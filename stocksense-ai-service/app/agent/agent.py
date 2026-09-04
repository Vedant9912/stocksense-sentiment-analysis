"""
Stateful Research Agent Orchestrator.
Manages the bounded state machine workflow:
START -> Understand -> Tool Selection -> Tool Execution -> Validation -> LLM Synthesis -> Structured Output -> END.
"""
from typing import Dict, Any, List, Optional
from pydantic import BaseModel

# Import specialized tools
from app.tools.market_data import MarketDataTool, resolve_ticker
from app.tools.news import NewsTool
from app.tools.technical_analysis import TechnicalAnalysisTool
from app.tools.sentiment import SentimentTool

# Import LLM client and schemas
from app.agent.llm import LLMClient
from app.schemas import StructuredAnalysisResponse

MAX_TOOL_CALLS = 5
ALLOWED_TOOLS = ["MarketDataTool", "NewsTool", "TechnicalAnalysisTool", "SentimentTool"]

class AgentState(BaseModel):
    query: str
    symbol: str
    selected_tools: List[str] = []
    tool_results: Dict[str, Any] = {}
    tool_call_count: int = 0
    errors: List[str] = []
    structured_response: Optional[Dict[str, Any]] = None

class StatefulAgent:
    def __init__(self) -> None:
        self.llm_client = LLMClient()

    def execute(self, symbol: str, query: str) -> Dict[str, Any]:
        """
        Executes the stateful agent workflow end-to-end.
        """
        # Resolve company name to canonical ticker symbol if needed
        resolved = resolve_ticker(symbol)

        # START: Initialize state
        state = AgentState(
            query=query,
            symbol=resolved,
            tool_call_count=0
        )

        # 1. Understand request & Determine required tools
        self._determine_tools(state)

        # 2. Execute selected tools (checking max call counts)
        self._execute_tools(state)

        # 3. Validate tool execution results
        self._validate_tool_results(state)

        # 4. Synthesize all evidence and generate structured response
        self._synthesize_evidence(state)

        # END: Return validated dict output matching StructuredAnalysisResponse
        return state.structured_response or {}

    def _determine_tools(self, state: AgentState) -> None:
        """
        Analyzes query intent and maps it to required tools.
        If the query is generic, it defaults to executing all tools for a full research report.
        """
        q = state.query.lower()
        selected = []

        is_generic = any(x in q for x in ["analyze", "summary", "report", "what is", "sentiment around"]) or len(q) < 5

        # Check for MarketDataTool keywords
        if is_generic or any(x in q for x in ["price", "market", "volume", "close", "change"]):
            selected.append("MarketDataTool")

        # Check for NewsTool keywords
        if is_generic or any(x in q for x in ["news", "driver", "headline", "article", "recent"]):
            selected.append("NewsTool")

        # Check for TechnicalAnalysisTool keywords
        if is_generic or any(x in q for x in ["technical", "rsi", "sma", "ema", "trend", "moving average"]):
            selected.append("TechnicalAnalysisTool")

        # Check for SentimentTool keywords
        if is_generic or any(x in q for x in ["sentiment", "mood", "feeling", "opinion", "finbert", "driver", "drivers"]):
            selected.append("SentimentTool")

        # Ensure SentimentTool has NewsTool dependency met
        if "SentimentTool" in selected and "NewsTool" not in selected:
            selected.append("NewsTool")
            
        # Ensure TechnicalAnalysisTool has MarketDataTool dependency met (needs history)
        if "TechnicalAnalysisTool" in selected and "MarketDataTool" not in selected:
            selected.append("MarketDataTool")

        state.selected_tools = [t for t in selected if t in ALLOWED_TOOLS]
        if not state.selected_tools:
            state.selected_tools = list(ALLOWED_TOOLS)
        print(f"StatefulAgent: Selected tools {state.selected_tools} for query '{state.query}'")

    def _execute_tools(self, state: AgentState) -> None:
        """
        Executes chosen tools sequentially while enforcing the tool calling limit.
        """
        # We need to run tools in logical order (dependencies first)
        # MarketDataTool -> TechnicalAnalysisTool
        # NewsTool -> SentimentTool
        execution_order = ["MarketDataTool", "NewsTool", "TechnicalAnalysisTool", "SentimentTool"]
        tools_to_run = [t for t in execution_order if t in state.selected_tools]

        for tool_name in tools_to_run:
            if state.tool_call_count >= MAX_TOOL_CALLS:
                err_msg = f"Max tool calls limit ({MAX_TOOL_CALLS}) exceeded. Truncating."
                state.errors.append(err_msg)
                print(f"StatefulAgent: {err_msg}")
                break

            print(f"StatefulAgent: Invoking {tool_name} for symbol {state.symbol}")
            state.tool_call_count += 1

            if tool_name == "MarketDataTool":
                state.tool_results["MarketDataTool"] = MarketDataTool.fetch(state.symbol)

            elif tool_name == "NewsTool":
                state.tool_results["NewsTool"] = NewsTool.fetch(state.symbol)

            elif tool_name == "TechnicalAnalysisTool":
                market_data = state.tool_results.get("MarketDataTool", {})
                history = market_data.get("history", [])
                state.tool_results["TechnicalAnalysisTool"] = TechnicalAnalysisTool.calculate(history)

            elif tool_name == "SentimentTool":
                news_data = state.tool_results.get("NewsTool", {})
                articles = news_data.get("news", [])
                
                # Analyze all headlines in batch
                titles = [a.get("title", "") for a in articles]
                batch_preds = SentimentTool.analyze_batch(titles) if titles else []
                
                headlines_sentiment = []
                for article, pred in zip(articles, batch_preds):
                    sent_item = {
                        "headline": article.get("title", ""),
                        "label": pred.get("label", "neutral"),
                        "score": pred.get("score", 1.0),
                        "url": article.get("url", "#")
                    }
                    headlines_sentiment.append(sent_item)
                
                # Aggregate results
                agg = SentimentTool.aggregate_sentiment(headlines_sentiment)
                state.tool_results["SentimentTool"] = {
                    "aggregate": agg,
                    "breakdown": headlines_sentiment
                }

    def _validate_tool_results(self, state: AgentState) -> None:
        """
        Inspects results from executed tools and logs warnings or falls back to default empty values.
        """
        for tool_name in state.selected_tools:
            res = state.tool_results.get(tool_name, {})
            status = res.get("status", "unavailable")
            
            if status != "success" and tool_name != "SentimentTool": # Sentiment is derived
                warn_msg = f"Tool {tool_name} failed or returned unavailable data."
                state.errors.append(warn_msg)
                print(f"StatefulAgent Validation Warning: {warn_msg}")

    def _synthesize_evidence(self, state: AgentState) -> None:
        """
        Constructs the correlation prompt containing all tool outputs and calls the LLM Client.
        Validates that the output matches the strict structured schema.
        """
        # Construct raw data log string for the LLM prompt
        market_res = state.tool_results.get("MarketDataTool", {})
        technical_res = state.tool_results.get("TechnicalAnalysisTool", {})
        sentiment_res = state.tool_results.get("SentimentTool", {})
        news_res = state.tool_results.get("NewsTool", {})

        prompt = f"""
You are a senior financial analyst and systems architect.
Synthesize the following research data for stock symbol: {state.symbol}

User Question/Query:
"{state.query}"

---- RAW TOOL EVIDENCE DATA ----
MarketDataTool Status: {market_res.get('status', 'unavailable')}
Current Price: ${market_res.get('price', 0.0)}
Previous Close: ${market_res.get('previous_close', 0.0)}
Price Change: {market_res.get('change', 0.0)}
Percentage Change: {market_res.get('change_percent', 0.0)}%
Volume: {market_res.get('volume', 0)}

TechnicalAnalysisTool Status: {technical_res.get('status', 'unavailable')}
SMA (20): {technical_res.get('sma_20', 0.0)}
SMA (50): {technical_res.get('sma_50', 0.0)}
EMA (20): {technical_res.get('ema_20', 0.0)}
RSI (14): {technical_res.get('rsi_14', 50.0)}
Trend: {technical_res.get('trend', 'neutral')}

SentimentTool (FinBERT Aggregate Score):
Overall Label: {sentiment_res.get('aggregate', {}).get('label', 'neutral')}
Overall Score: {sentiment_res.get('aggregate', {}).get('score', 0.0)} (Bullish %: {sentiment_res.get('aggregate', {}).get('positive', 0.0)}%, Bearish %: {sentiment_res.get('aggregate', {}).get('negative', 0.0)}%)

Scraped News Articles (Count: {len(news_res.get('news', []))}):
{json_dumps_news(news_res.get('news', []))}
--------------------------------

YOUR TASK:
1. Synthesize this data to answer the user's query: "{state.query}"
2. Cross-correlate price action, technical indicators, and news sentiment.
3. Identify the key drivers (maximum 3 bullet points) behind recent sentiment shifts or trends.
4. Output a concise summary paragraph.
5. Provide a confidence score (0.0 to 1.0) indicating data completeness and correlation clarity.
6. YOU MUST OUTPUT A JSON OBJECT ONLY. NO MARKDOWN, NO OTHER TEXT.

The JSON schema MUST exactly follow:
{{
    "symbol": "{state.symbol}",
    "summary": "Concise paragraph explaining how technical trend, price change, and sentiment correlate to answer the query.",
    "market": {{
        "price": {market_res.get('price', 0.0)},
        "change": {market_res.get('change', 0.0)},
        "change_percent": {market_res.get('change_percent', 0.0)}
    }},
    "sentiment": {{
        "label": "{sentiment_res.get('aggregate', {}).get('label', 'neutral')}",
        "score": {sentiment_res.get('aggregate', {}).get('score', 0.0)}
    }},
    "technical": {{
        "rsi": {technical_res.get('rsi_14', 50.0)},
        "trend": "{technical_res.get('trend', 'neutral')}"
    }},
    "news": [ ... list of scraped articles matching input ... ],
    "key_drivers": [
        "First key driver sentence...",
        "Second key driver sentence..."
    ],
    "confidence": 0.85,
    "disclaimer": "This analysis is for research purposes only and does not constitute financial advice."
}}
"""

        # Call the LLM (or fallback deterministically)
        structured_json = self.llm_client.generate_structured_response(
            prompt=prompt,
            schema_fields=["symbol", "summary", "market", "sentiment", "technical", "news", "key_drivers", "confidence"],
            symbol=state.symbol,
            tool_results=state.tool_results
        )

        # Force map/inject the raw tool outputs directly into the final JSON structure 
        # to guarantee 0% LLM hallucinations of financial data!
        structured_json["symbol"] = state.symbol
        is_indian = str(market_res.get("resolved_symbol", "")).endswith((".NS", ".BO"))
        structured_json["market"] = {
            "price": market_res.get("price", 0.0),
            "change": market_res.get("change", 0.0),
            "change_percent": market_res.get("change_percent", 0.0),
            "currency": "INR" if is_indian else "USD",
            "resolved_symbol": market_res.get("resolved_symbol", state.symbol)
        }
        structured_json["sentiment"] = {
            "label": sentiment_res.get("aggregate", {}).get("label", "neutral"),
            "score": sentiment_res.get("aggregate", {}).get("score", 0.0)
        }
        structured_json["technical"] = {
            "rsi": technical_res.get("rsi_14", 50.0),
            "trend": technical_res.get("trend", "neutral"),
            "sma_20": technical_res.get("sma_20", 0.0),
            "sma_50": technical_res.get("sma_50", 0.0),
            "ema_20": technical_res.get("ema_20", 0.0)
        }
        
        # Pull original clean scraped articles directly from NewsTool paired with sentiments
        scraped_articles = news_res.get("news", [])
        sentiment_breakdown = sentiment_res.get("breakdown", [])
        sent_by_title = {item.get("headline"): item for item in sentiment_breakdown}

        structured_news = []
        for a in scraped_articles:
            title = a.get("title", "")
            sent_info = sent_by_title.get(title, {})
            structured_news.append({
                "title": title,
                "source": a.get("source", "Unknown"),
                "published_at": a.get("published_at", ""),
                "url": a.get("url", "#"),
                "label": sent_info.get("label", "neutral"),
                "score": sent_info.get("score", 1.0)
            })
        structured_json["news"] = structured_news

        # Validate structured output against Pydantic schema
        try:
            validated = StructuredAnalysisResponse(**structured_json)
            state.structured_response = validated.dict()
        except Exception as e:
            print(f"StatefulAgent Pydantic validation failed: {e}. Attempting recovery.")
            # Simple fallback structure mapping
            state.structured_response = structured_json

def json_dumps_news(news: List[Dict[str, Any]]) -> str:
    """Helper to dump clean news articles list for the LLM prompt."""
    lines = []
    for idx, n in enumerate(news):
        lines.append(f"[{idx+1}] Title: {n['title']} (Source: {n['source']})")
    return "\n".join(lines)

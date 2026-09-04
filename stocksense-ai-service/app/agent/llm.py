"""
Generic LLM client wrapper.
Supports OpenAI and Google Gemini APIs dynamically, with full mock fallback support.
"""
import os
import json
from typing import Dict, Any, List

class LLMClient:
    def __init__(self) -> None:
        self.api_key = os.getenv("LLM_API_KEY")
        self.provider = os.getenv("LLM_PROVIDER", "").lower()
        self.base_url = os.getenv("LLM_BASE_URL")
        
        # Auto-detect provider if not explicitly defined
        if not self.provider and self.api_key:
            if self.api_key.startswith("AIzaSy"):
                self.provider = "gemini"
            else:
                self.provider = "openai"
                
        print(f"LLMClient initialized: Provider={self.provider or 'MOCK-FALLBACK'}")

    def generate_structured_response(self, prompt: str, schema_fields: List[str], symbol: str = "UNKNOWN", tool_results: dict = None) -> Dict[str, Any]:
        """
        Sends the prompt to the configured LLM provider and requests a structured JSON response.
        If the provider fails or key is missing, falls back to a clean mock parser.
        """
        if not self.api_key:
            print("LLMClient: No LLM_API_KEY found. Falling back to deterministic analysis synthesis.")
            return self._fallback_synthesis(prompt, symbol, tool_results)

        try:
            if self.provider == "gemini":
                return self._call_gemini(prompt)
            elif self.provider == "openai":
                return self._call_openai(prompt)
        except Exception as e:
            print(f"LLMClient: Provider call failed ({e}). Falling back to deterministic synthesis.")
            
        return self._fallback_synthesis(prompt, symbol, tool_results)

    def _call_gemini(self, prompt: str) -> Dict[str, Any]:
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        
        model_name = os.getenv("LLM_MODEL", "gemini-1.5-flash")
        model = genai.GenerativeModel(
            model_name,
            generation_config={"response_mime_type": "application/json"}
        )
        
        response = model.generate_content(prompt)
        return json.loads(response.text)

    def _call_openai(self, prompt: str) -> Dict[str, Any]:
        from openai import OpenAI
        
        client = OpenAI(api_key=self.api_key, base_url=self.base_url)
        model_name = os.getenv("LLM_MODEL", "gpt-4o-mini")
        
        response = client.chat.completions.create(
            model=model_name,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": "You are a professional financial analyst. You must output JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2
        )
        
        content = response.choices[0].message.content
        return json.loads(content)

    def _fallback_synthesis(self, prompt: str, symbol: str = "UNKNOWN", tool_results: dict = None) -> Dict[str, Any]:
        """
        Fallback parser that generates a standard, high-quality, structured response
        directly using the raw tool results.
        """
        if tool_results is None:
            tool_results = {}
            
        market_res = tool_results.get("MarketDataTool", {})
        technical_res = tool_results.get("TechnicalAnalysisTool", {})
        sentiment_res = tool_results.get("SentimentTool", {})
        
        price = market_res.get("price", 0.0)
        change = market_res.get("change", 0.0)
        change_pct = market_res.get("change_percent", 0.0)
        
        rsi = technical_res.get("rsi_14", 50.0)
        trend = technical_res.get("trend", "neutral")
        
        label = sentiment_res.get("aggregate", {}).get("label", "neutral")
        score = sentiment_res.get("aggregate", {}).get("score", 0.0)
        sma_20 = technical_res.get("sma_20", 0.0)
        sma_50 = technical_res.get("sma_50", 0.0)
        ema_20 = technical_res.get("ema_20", 0.0)
        
        is_indian = str(market_res.get("resolved_symbol", "")).endswith((".NS", ".BO"))
        currency_sym = "₹" if is_indian else "$"

        # Compile narrative drivers
        drivers = [
            f"Market price for {symbol} closed at {currency_sym}{price} ({change_pct:+0.2f}%).",
            f"Technical posture is {trend.upper()} with RSI at {rsi}, SMA-20 at {currency_sym}{sma_20}, and SMA-50 at {currency_sym}{sma_50}."
        ]
        if label == "positive":
            drivers.append("FinBERT sentiment analysis indicates news headlines are generally bullish.")
        elif label == "negative":
            drivers.append("FinBERT sentiment analysis indicates news headlines are generally bearish.")
        else:
            drivers.append("Financial news headlines indicate a neutral or mixed sentiment profile.")

        summary = (
            f"StockSense AI analysis for {symbol}: The stock is trading at {currency_sym}{price} "
            f"({change_pct:+0.2f}%). Technical momentum is {trend.upper()} with an RSI (14) of {rsi}, "
            f"SMA (20) at {currency_sym}{sma_20}, and SMA (50) at {currency_sym}{sma_50}. "
            f"News sentiment classified via FinBERT is {label.upper()} (score: {score:+0.2f})."
        )

        return {
            "symbol": symbol,
            "summary": summary,
            "market": {
                "price": price,
                "change": change,
                "change_percent": change_pct
            },
            "sentiment": {
                "label": label,
                "score": score
            },
            "technical": {
                "rsi": rsi,
                "trend": trend,
                "sma_20": sma_20,
                "sma_50": sma_50,
                "ema_20": ema_20
            },
            "news": [],  # Filled in by the agent executor from raw news tool
            "key_drivers": drivers,
            "confidence": 0.8,
            "disclaimer": "This analysis is for research purposes only and does not constitute financial advice."
        }

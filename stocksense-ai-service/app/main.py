"""
StockSense AI Microservice
---------------------------
Standalone FastAPI worker. Spring Boot calls this internally; it is NOT
exposed to the browser directly. No auth here on purpose -- this service
should sit behind an internal network / firewall, with Spring Boot as the
only public-facing entry point.

Run with:  uvicorn app.main:app --host 0.0.0.0 --port 8000
"""
from collections import Counter

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.model import get_engine
from app.scraper import fetch_headlines
from app.schemas import SentimentResult, HeadlineSentiment, AgentRequest, StructuredAnalysisResponse
from app.agent.agent import StatefulAgent

app = FastAPI(
    title="StockSense AI Engine",
    description="FinBERT-powered news sentiment scoring for stock tickers",
    version="1.0.0",
)

# CORS only matters if you ever call this directly from a browser during
# local dev. In production, only Spring Boot's server-side WebClient hits this.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def warm_up_model() -> None:
    """Load FinBERT into memory once, at boot, instead of on first request."""
    get_engine()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/sentiment/{ticker}", response_model=SentimentResult)
def get_sentiment(ticker: str, limit: int = 15) -> SentimentResult:
    ticker = ticker.upper().strip()

    headlines_data = fetch_headlines(ticker, limit=limit)
    if not headlines_data:
        raise HTTPException(
            status_code=404,
            detail=f"No recent news headlines found for '{ticker}'.",
        )

    headline_texts = [h["headline"] for h in headlines_data]
    engine = get_engine()
    predictions = engine.predict(headline_texts)

    # Merge predicted sentiments with their corresponding URLs
    predictions_with_url = []
    for pred, orig in zip(predictions, headlines_data):
        pred_copy = dict(pred)
        pred_copy["url"] = orig["url"]
        predictions_with_url.append(pred_copy)

    counts = Counter(p["label"] for p in predictions)
    total = len(predictions)

    positive_pct = round(counts.get("positive", 0) / total * 100, 1)
    negative_pct = round(counts.get("negative", 0) / total * 100, 1)
    neutral_pct = round(counts.get("neutral", 0) / total * 100, 1)

    overall_label = counts.most_common(1)[0][0]
    # -1 (all negative) .. +1 (all positive), used for the gauge on the frontend
    overall_score = round((positive_pct - negative_pct) / 100, 3)

    return SentimentResult(
        ticker=ticker,
        positive=positive_pct,
        negative=negative_pct,
        neutral=neutral_pct,
        overall_label=overall_label,
        overall_score=overall_score,
        headline_count=total,
        headlines=[HeadlineSentiment(**p) for p in predictions_with_url],
    )

@app.post("/api/ai/analyze", response_model=StructuredAnalysisResponse)
def analyze_stock(request: AgentRequest) -> StructuredAnalysisResponse:
    symbol = request.symbol.strip().upper()
    query = request.query.strip()
    
    if not symbol:
        raise HTTPException(status_code=400, detail="Symbol cannot be empty.")
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty.")
        
    try:
        agent = StatefulAgent()
        analysis = agent.execute(symbol, query)
        
        if not analysis:
            raise HTTPException(status_code=500, detail="Agent failed to compile structured response.")
            
        return StructuredAnalysisResponse(**analysis)
    except Exception as e:
        print(f"FastAPI /api/ai/analyze error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

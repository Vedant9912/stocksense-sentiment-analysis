from pydantic import BaseModel, Field
from typing import List, Optional

# --- Legacy Schemas for backward compatibility ---
class HeadlineSentiment(BaseModel):
    headline: str
    label: str          # positive | negative | neutral
    score: float         # confidence of the predicted label, 0-1
    url: str

class SentimentResult(BaseModel):
    ticker: str
    positive: float       # aggregate % 0-100
    negative: float
    neutral: float
    overall_label: str     # positive | negative | neutral (majority)
    overall_score: float   # -1.0 (very bearish) .. +1.0 (very bullish)
    headline_count: int
    headlines: List[HeadlineSentiment] = []

# --- New Agent-based Structured Analysis Schemas ---
class AgentRequest(BaseModel):
    symbol: str
    query: str

class MarketDataResponse(BaseModel):
    price: float
    change: float
    change_percent: float
    currency: Optional[str] = "USD"
    resolved_symbol: Optional[str] = None

class SentimentResponse(BaseModel):
    label: str
    score: float

class TechnicalResponse(BaseModel):
    rsi: float
    trend: str
    sma_20: Optional[float] = None
    sma_50: Optional[float] = None
    ema_20: Optional[float] = None

class NewsItemResponse(BaseModel):
    title: str
    source: str
    published_at: str
    url: str
    label: Optional[str] = "neutral"
    score: Optional[float] = 1.0

class StructuredAnalysisResponse(BaseModel):
    symbol: str
    summary: str
    market: MarketDataResponse
    sentiment: SentimentResponse
    technical: TechnicalResponse
    news: List[NewsItemResponse] = []
    key_drivers: List[str] = []
    confidence: float
    disclaimer: str = "This analysis is for research purposes only and does not constitute financial advice."

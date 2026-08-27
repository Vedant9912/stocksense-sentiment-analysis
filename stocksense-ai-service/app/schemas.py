from pydantic import BaseModel
from typing import List


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

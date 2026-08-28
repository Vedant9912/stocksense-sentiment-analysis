"""
Unit tests for specialized SentimentTool.
Verifies positive, negative, and neutral classifications.
"""
import sys
import os
# Add root folder to sys.path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.tools.sentiment import SentimentTool

def test_sentiment_analysis_neutral_fallback():
    # Empty inputs should degrade gracefully to neutral
    res1 = SentimentTool.analyze("")
    assert res1["label"] == "neutral"
    assert res1["score"] == 1.0

    res2 = SentimentTool.analyze("   ")
    assert res2["label"] == "neutral"
    assert res2["score"] == 1.0

def test_aggregate_sentiment():
    # Helper aggregates lists of label outcomes
    results = [
        {"label": "positive", "score": 0.9},
        {"label": "positive", "score": 0.8},
        {"label": "negative", "score": 0.75},
        {"label": "neutral", "score": 0.95}
    ]
    
    agg = SentimentTool.aggregate_sentiment(results)
    
    # 2 positive, 1 negative, 1 neutral -> total 4
    # Bullish: 50.0%, Bearish: 25.0%, Neutral: 25.0%
    # Overall score: (50.0 - 25.0) / 100 = 0.25
    assert agg["positive"] == 50.0
    assert agg["negative"] == 25.0
    assert agg["neutral"] == 25.0
    assert agg["score"] == 0.25
    assert agg["label"] == "positive"

def test_aggregate_sentiment_empty():
    agg = SentimentTool.aggregate_sentiment([])
    assert agg["label"] == "neutral"
    assert agg["score"] == 0.0

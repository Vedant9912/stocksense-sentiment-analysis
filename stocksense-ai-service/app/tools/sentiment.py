"""
Specialized SentimentTool.
Analyzes financial text/headlines and returns normalized classifications.
Abstracts the underlying AI/ML model execution so providers can be swapped later.
"""
from typing import Dict, Any, List
from app.model import get_engine

class SentimentTool:
    @staticmethod
    def analyze(text: str) -> Dict[str, Any]:
        """
        Analyzes a single piece of financial text and returns a normalized dictionary:
        {
            "label": "positive | negative | neutral",
            "score": float (confidence score, 0.0 - 1.0)
        }
        """
        if not text or not text.strip():
            return {"label": "neutral", "score": 1.0}

        try:
            engine = get_engine()
            # Predict receives a list of headlines and returns a list of dicts: [{"headline": ..., "label": ..., "score": ...}]
            predictions = engine.predict([text])
            if predictions:
                pred = predictions[0]
                return {
                    "label": pred["label"],
                    "score": pred["score"]
                }
        except Exception as e:
            print(f"SentimentTool analyze exception: {e}")
        return {"label": "neutral", "score": 1.0}

    @staticmethod
    def analyze_batch(texts: List[str]) -> List[Dict[str, Any]]:
        """
        Analyzes a batch of financial texts in a single call to the engine.
        Returns a list of normalized dicts: [{'label': ..., 'score': ...}, ...]
        """
        if not texts:
            return []
        try:
            engine = get_engine()
            predictions = engine.predict(texts)
            results = []
            for p in predictions:
                results.append({
                    "label": p.get("label", "neutral"),
                    "score": p.get("score", 1.0)
                })
            return results
        except Exception as e:
            print(f"SentimentTool batch analysis exception: {e}")
            return [{"label": "neutral", "score": 1.0} for _ in texts]

    @staticmethod
    def aggregate_sentiment(results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculates aggregate sentiment from multiple normalized sentiment scores.
        Uses a documented and predictable weighted majority logic:
        - Score calculated as: (positive_count - negative_count) / total_count
        - Scale: -1.0 (extremely bearish) to +1.0 (extremely bullish)
        """
        if not results:
            return {"label": "neutral", "score": 0.0, "positive": 0.0, "negative": 0.0, "neutral": 100.0}

        total = len(results)
        pos = sum(1 for r in results if r["label"] == "positive")
        neg = sum(1 for r in results if r["label"] == "negative")
        neu = sum(1 for r in results if r["label"] == "neutral")

        positive_pct = round((pos / total) * 100, 1)
        negative_pct = round((neg / total) * 100, 1)
        neutral_pct = round((neu / total) * 100, 1)

        # Calculate overall score between -1.0 and 1.0
        overall_score = round((positive_pct - negative_pct) / 100, 3)
        
        # Majority count label selector
        overall_label = "neutral"
        if pos > neg and pos >= neu:
            overall_label = "positive"
        elif neg > pos and neg >= neu:
            overall_label = "negative"

        return {
            "label": overall_label,
            "score": overall_score,
            "positive": positive_pct,
            "negative": negative_pct,
            "neutral": neutral_pct
        }

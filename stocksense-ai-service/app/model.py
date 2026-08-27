"""
FinBERT wrapper.

Loads ProsusAI/finbert once at process startup and exposes a simple
predict() function that turns a list of headlines into sentiment labels.
Kept as its own module so main.py stays thin and this can be unit tested
or swapped for a different checkpoint later without touching the API layer.
"""
from functools import lru_cache
from typing import List

from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch

MODEL_NAME = "ProsusAI/finbert"
LABELS = ["positive", "negative", "neutral"]   # FinBERT's id2label order


class FinBertEngine:
    def __init__(self) -> None:
        self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        self.model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
        self.model.eval()

    @torch.no_grad()
    def predict(self, headlines: List[str]) -> List[dict]:
        """Returns [{headline, label, score}] for every input headline."""
        if not headlines:
            return []

        inputs = self.tokenizer(
            headlines,
            padding=True,
            truncation=True,
            max_length=64,
            return_tensors="pt",
        )
        logits = self.model(**inputs).logits
        probs = torch.softmax(logits, dim=-1)

        results = []
        for headline, prob in zip(headlines, probs):
            idx = int(torch.argmax(prob).item())
            results.append(
                {
                    "headline": headline,
                    "label": LABELS[idx],
                    "score": round(float(prob[idx]), 4),
                }
            )
        return results


@lru_cache(maxsize=1)
def get_engine() -> "FinBertEngine":
    """Lazily instantiate the model exactly once (it's ~400MB, expensive to load)."""
    return FinBertEngine()

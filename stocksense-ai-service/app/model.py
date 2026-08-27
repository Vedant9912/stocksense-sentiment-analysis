"""
FinBERT wrapper.

Loads ProsusAI/finbert once at process startup and exposes a simple
predict() function that turns a list of headlines into sentiment labels.
Supports fallback to Hugging Face Serverless Inference API if HF_TOKEN is defined
to keep RAM usage below 50MB (critical for free 512MB RAM server hosting).
"""
from functools import lru_cache
from typing import List
import os
import requests
import time

MODEL_NAME = "ProsusAI/finbert"
LABELS = ["positive", "negative", "neutral"]   # FinBERT's id2label order


class FinBertEngine:
    def __init__(self) -> None:
        self.hf_token = os.getenv("HF_TOKEN")
        if not self.hf_token:
            print("HF_TOKEN not found. Initializing local PyTorch model (requires ~1GB RAM)...")
            from transformers import AutoTokenizer, AutoModelForSequenceClassification
            import torch
            self.tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
            self.model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
            self.model.eval()
        else:
            print("HF_TOKEN found. Initializing serverless Hugging Face Inference API client...")

    def predict(self, headlines: List[str]) -> List[dict]:
        """Returns [{headline, label, score}] for every input headline."""
        if not headlines:
            return []

        if self.hf_token:
            return self._predict_via_hf_api(headlines)
        
        return self._predict_locally(headlines)

    def _predict_locally(self, headlines: List[str]) -> List[dict]:
        import torch
        
        inputs = self.tokenizer(
            headlines,
            padding=True,
            truncation=True,
            max_length=64,
            return_tensors="pt",
        )
        with torch.no_grad():
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

    def _predict_via_hf_api(self, headlines: List[str]) -> List[dict]:
        api_url = f"https://api-inference.huggingface.co/models/{MODEL_NAME}"
        headers = {"Authorization": f"Bearer {self.hf_token}"}
        
        results = []
        try:
            response = requests.post(api_url, headers=headers, json={"inputs": headlines}, timeout=15)
            
            # If the model is currently loading on Hugging Face serverless, wait & retry once
            if response.status_code == 503:
                est_time = response.json().get("estimated_time", 10)
                print(f"HF Model loading. Sleeping for {est_time}s before retry...")
                time.sleep(min(est_time, 8))
                response = requests.post(api_url, headers=headers, json={"inputs": headlines}, timeout=15)
                
            response.raise_for_status()
            api_results = response.json()
            
            # Hugging Face returns a list of classification scores for each headline
            # e.g., [[{'label': 'positive', 'score': 0.95}, {'label': 'negative', 'score': 0.02}, ...]]
            for headline, scores in zip(headlines, api_results):
                best = max(scores, key=lambda x: x["score"])
                results.append({
                    "headline": headline,
                    "label": best["label"].lower(),
                    "score": round(float(best["score"]), 4)
                })
        except Exception as e:
            print(f"Hugging Face Inference API error: {e}. Falling back to default neutral classification.")
            for headline in headlines:
                results.append({
                    "headline": headline,
                    "label": "neutral",
                    "score": 1.0
                })
        return results


@lru_cache(maxsize=1)
def get_engine() -> "FinBertEngine":
    """Instantiate the engine exactly once."""
    return FinBertEngine()

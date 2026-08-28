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

    def generate_structured_response(self, prompt: str, schema_fields: List[str]) -> Dict[str, Any]:
        """
        Sends the prompt to the configured LLM provider and requests a structured JSON response.
        If the provider fails or key is missing, falls back to a clean mock parser.
        """
        if not self.api_key:
            print("LLMClient: No LLM_API_KEY found. Falling back to deterministic analysis synthesis.")
            return self._fallback_synthesis(prompt)

        try:
            if self.provider == "gemini":
                return self._call_gemini(prompt)
            elif self.provider == "openai":
                return self._call_openai(prompt)
        except Exception as e:
            print(f"LLMClient: Provider call failed ({e}). Falling back to deterministic synthesis.")
            
        return self._fallback_synthesis(prompt)

    def _call_gemini(self, prompt: str) -> Dict[str, Any]:
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        
        model_name = os.getenv("LLM_MODEL", "gemini-1.5-flash")
        model = genai.GenerativeModel(
            model_name,
            generation_config={"response_mime_type": "application/json"}
        )
        
        response = model.generate_content(prompt)
        # Parse the JSON string
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

    def _fallback_synthesis(self, prompt: str) -> Dict[str, Any]:
        """
        Fallback parser that generates a standard, high-quality, structured response
        by parsing the tool inputs out of the prompt (since the prompt contains all raw tool outputs).
        """
        # Let's extract values using simple string parsing/searching from the prompt
        symbol = "UNKNOWN"
        price = 0.0
        change = 0.0
        change_pct = 0.0
        rsi = 50.0
        trend = "neutral"
        label = "neutral"
        score = 0.0
        
        # Extract Ticker
        for line in prompt.split("\n"):
            if "Ticker Symbol:" in line or "Symbol:" in line:
                symbol = line.split(":")[-1].strip().upper()
            if "Current Price:" in line:
                try: price = float(line.split(":")[-1].replace("$", "").strip())
                except: pass
            if "Price Change:" in line:
                try: change = float(line.split(":")[-1].strip())
                except: pass
            if "Percentage Change:" in line:
                try: change_pct = float(line.split(":")[-1].replace("%", "").strip())
                except: pass
            if "RSI (14):" in line:
                try: rsi = float(line.split(":")[-1].strip())
                except: pass
            if "Trend:" in line:
                trend = line.split(":")[-1].strip().lower()
            if "Overall Label:" in line:
                label = line.split(":")[-1].strip().lower()
            if "Overall Score:" in line:
                try: score = float(line.split(":")[-1].strip())
                except: pass

        # Compile static narrative drivers
        drivers = [
            f"Market price for {symbol} closed at {price} indicating a change of {change_pct}%.",
            f"Technical indicators show a {trend} trend with RSI at {rsi}."
        ]
        if label == "positive":
            drivers.append("FinBERT sentiment analysis indicates news headlines are generally bullish.")
        elif label == "negative":
            drivers.append("FinBERT sentiment analysis indicates news headlines are generally bearish.")
        else:
            drivers.append("Financial news headlines indicate a neutral or mixed sentiment profile.")

        summary = (
            f"StockSense AI deterministic analysis for {symbol}: The stock is trading at {price} "
            f"representing a {change_pct}% change. Technical trend is currently {trend} with a relative "
            f"strength index (RSI 14) of {rsi}. News sentiment classified via FinBERT is {label.upper()}."
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
                "trend": trend
            },
            "news": [],  # Filled in by the agent executor from raw news tool
            "key_drivers": drivers,
            "confidence": 0.8,
            "disclaimer": "This analysis is for research purposes only and does not constitute financial advice."
        }

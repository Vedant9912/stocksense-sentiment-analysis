"""
Specialized TechnicalAnalysisTool.
Computes technical indicators (SMA, EMA, RSI) and simple trend classifications deterministically.
"""
from typing import Dict, Any, List
import pandas as pd
import numpy as np

class TechnicalAnalysisTool:
    @staticmethod
    def calculate(history_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Calculates indicators based on normalized historical price data from MarketDataTool.
        Returns a normalized indicators dictionary:
        {
            "status": "success | unavailable",
            "sma_20": float,
            "sma_50": float,
            "ema_20": float,
            "rsi_14": float,
            "trend": "bullish | bearish | neutral"
        }
        """
        result = {
            "status": "unavailable",
            "sma_20": 0.0,
            "sma_50": 0.0,
            "ema_20": 0.0,
            "rsi_14": 50.0, # neutral baseline
            "trend": "neutral"
        }

        if not history_data or len(history_data) < 5:
            return result

        try:
            # Create a Pandas DataFrame from the historical data
            df = pd.DataFrame(history_data)
            if 'close' not in df.columns:
                return result

            closes = df['close'].astype(float)
            length = len(closes)

            # Need at least 20 elements for SMA 20, 50 for SMA 50
            # If length is small, fallback gracefully or use smaller windows
            sma_20_val = float(closes.rolling(window=min(20, length)).mean().iloc[-1])
            sma_50_val = float(closes.rolling(window=min(50, length)).mean().iloc[-1])
            
            # EMA 20
            ema_20_val = float(closes.ewm(span=min(20, length), adjust=False).mean().iloc[-1])

            # RSI 14 calculation
            rsi_val = 50.0
            if length >= 15:
                delta = closes.diff()
                gain = delta.clip(lower=0)
                loss = -1 * delta.clip(upper=0)
                
                avg_gain = gain.rolling(window=14).mean()
                avg_loss = loss.rolling(window=14).mean()
                
                # Prevent division by zero
                last_gain = avg_gain.iloc[-1]
                last_loss = avg_loss.iloc[-1]
                
                if pd.isna(last_gain) or pd.isna(last_loss):
                    rsi_val = 50.0
                elif last_loss == 0:
                    rsi_val = 100.0
                else:
                    rs = last_gain / last_loss
                    rsi_val = float(100 - (100 / (1 + rs)))

            # Deterministic trend classification logic
            current_price = float(closes.iloc[-1])
            trend = "neutral"
            if current_price > sma_20_val and sma_20_val >= sma_50_val:
                trend = "bullish"
            elif current_price < sma_20_val and sma_20_val <= sma_50_val:
                trend = "bearish"

            result.update({
                "status": "success",
                "sma_20": round(sma_20_val, 2),
                "sma_50": round(sma_50_val, 2),
                "ema_20": round(ema_20_val, 2),
                "rsi_14": round(rsi_val, 2),
                "trend": trend
            })

        except Exception as e:
            # Graceful degradation
            print(f"TechnicalAnalysisTool calculation failure: {e}")

        return result

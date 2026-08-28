"""
Specialized MarketDataTool.
Fetches stock market metrics (price, change, volume, historical closes) using yfinance.
Returns normalized data structures and handles error states gracefully.
"""
from typing import Dict, Any, List
import yfinance as yf
import pandas as pd
import time

class MarketDataTool:
    @staticmethod
    def fetch(symbol: str) -> Dict[str, Any]:
        """
        Fetches core market statistics for the given stock symbol.
        Returns a normalized dictionary structure:
        {
            "status": "success | unavailable",
            "symbol": str,
            "price": float,
            "change": float,
            "change_percent": float,
            "volume": int,
            "previous_close": float,
            "history": [{"date": str, "close": float}]
        }
        """
        symbol = symbol.upper().strip()
        result = {
            "status": "unavailable",
            "symbol": symbol,
            "price": 0.0,
            "change": 0.0,
            "change_percent": 0.0,
            "volume": 0,
            "previous_close": 0.0,
            "history": []
        }

        if not symbol:
            return result

        try:
            ticker = yf.Ticker(symbol)
            # Use history(period="30d") which is highly reliable and doesn't hit Yahoo info scraping limits
            hist = ticker.history(period="30d")
            
            if hist.empty:
                print(f"MarketDataTool: No history found for symbol {symbol}")
                return result

            # Parse metrics from historical dataframe
            last_idx = -1
            prev_idx = -2 if len(hist) >= 2 else -1

            price = float(hist['Close'].iloc[last_idx])
            prev_close = float(hist['Close'].iloc[prev_idx])
            change = round(price - prev_close, 2)
            change_percent = round((change / prev_close) * 100, 2) if prev_close != 0.0 else 0.0
            volume = int(hist['Volume'].iloc[last_idx])

            # Compile historical close prices
            history_points = []
            for date, row in hist.iterrows():
                # Convert Timestamp to YYYY-MM-DD string
                date_str = date.strftime('%Y-%m-%d')
                history_points.append({
                    "date": date_str,
                    "close": round(float(row['Close']), 2)
                })

            result.update({
                "status": "success",
                "price": round(price, 2),
                "change": change,
                "change_percent": change_percent,
                "volume": volume,
                "previous_close": round(prev_close, 2),
                "history": history_points
            })
            
        except Exception as e:
            # Graceful degradation - log error and return unavailable status instead of crashing
            print(f"MarketDataTool failure for symbol {symbol}: {e}")

        return result

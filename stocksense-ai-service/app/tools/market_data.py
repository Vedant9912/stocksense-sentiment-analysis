"""
Specialized MarketDataTool.
Fetches stock market metrics (price, change, volume, historical closes) using yfinance.
Returns normalized data structures and handles error states gracefully.
"""
from typing import Dict, Any, List
import yfinance as yf
import pandas as pd
import time

COMPANY_NAME_TO_TICKER = {
    "APPLE": "AAPL",
    "APPLE INC": "AAPL",
    "TESLA": "TSLA",
    "TESLA MOTORS": "TSLA",
    "MICROSOFT": "MSFT",
    "GOOGLE": "GOOGL",
    "ALPHABET": "GOOGL",
    "AMAZON": "AMZN",
    "NVIDIA": "NVDA",
    "META": "META",
    "FACEBOOK": "META",
    "NETFLIX": "NFLX",
    "AMD": "AMD",
    "INTEL": "INTC",
    "TATA MOTORS": "TATAMOTORS",
    "TATA MOTOR": "TATAMOTORS",
    "TATA STEEL": "TATASTEEL",
    "TCS": "TCS",
    "TATA CONSULTANCY SERVICES": "TCS",
    "TATA CONSULTANCY": "TCS",
    "RELIANCE": "RELIANCE",
    "RELIANCE INDUSTRIES": "RELIANCE",
    "INFOSYS": "INFY",
    "INFY": "INFY",
    "HDFC BANK": "HDFCBANK",
    "HDFC": "HDFCBANK",
    "ICICI BANK": "ICICIBANK",
    "ICICI": "ICICIBANK",
    "STATE BANK OF INDIA": "SBIN",
    "SBI": "SBIN",
    "SBIN": "SBIN",
    "BHARTI AIRTEL": "BHARTIARTL",
    "AIRTEL": "BHARTIARTL",
    "KOTAK": "KOTAKBANK",
    "KOTAK BANK": "KOTAKBANK",
    "KOTAK MAHINDRA BANK": "KOTAKBANK",
    "LARSEN & TOUBRO": "LT",
    "LARSEN": "LT",
    "L&T": "LT",
    "LT": "LT",
    "ITC": "ITC",
    "HINDUSTAN UNILEVER": "HINDUNILVR",
    "HUL": "HINDUNILVR",
    "AXIS BANK": "AXISBANK",
    "AXIS": "AXISBANK",
    "BAJAJ FINANCE": "BAJFINANCE",
    "BAJAJ FINSERV": "BAJAJFINSV",
    "MARUTI": "MARUTI",
    "MARUTI SUZUKI": "MARUTI",
    "TITAN": "TITAN",
    "SUN PHARMA": "SUNPHARMA",
    "SUN PHARMACEUTICALS": "SUNPHARMA",
    "ULTRATECH CEMENT": "ULTRACEMCO",
    "ULTRATECH": "ULTRACEMCO",
    "NTPC": "NTPC",
    "POWER GRID": "POWERGRID",
    "POWERGRID": "POWERGRID",
    "MAHINDRA & MAHINDRA": "M&M",
    "MAHINDRA": "M&M",
    "M&M": "M&M",
    "JSW STEEL": "JSWSTEEL",
    "ADANI ENTERPRISES": "ADANIENT",
    "ADANI PORTS": "ADANIPORTS",
    "COAL INDIA": "COALINDIA",
    "HCL TECH": "HCLTECH",
    "HCL TECHNOLOGIES": "HCLTECH",
    "HCL": "HCLTECH",
    "ONGC": "ONGC",
    "OIL AND NATURAL GAS CORPORATION": "ONGC",
    "WIPRO": "WIPRO",
    "TECH MAHINDRA": "TECHM",
    "NESTLE": "NESTLEIND",
    "NESTLE INDIA": "NESTLEIND",
    "ZOMATO": "ZOMATO",
    "PAYTM": "PAYTM",
    "JIO FINANCIAL": "JIOFIN",
    "JIO FINANCIAL SERVICES": "JIOFIN",
    "BHARAT ELECTRONICS": "BEL",
    "BEL": "BEL",
    "IRFC": "IRFC",
    "BSE": "BSE",
    "BSE LTD": "BSE",
    "BSE LIMITED": "BSE"
}

def resolve_ticker(input_str: str) -> str:
    cleaned = input_str.upper().strip()
    if cleaned in COMPANY_NAME_TO_TICKER:
        return COMPANY_NAME_TO_TICKER[cleaned]
    stripped = cleaned.replace(" LIMITED", "").replace(" LTD", "").replace(" INC", "").replace(" CORP", "").replace(" CO", "").strip()
    if stripped in COMPANY_NAME_TO_TICKER:
        return COMPANY_NAME_TO_TICKER[stripped]
    return cleaned

class MarketDataTool:
    @staticmethod
    def fetch(symbol: str) -> Dict[str, Any]:
        """
        Fetches core market statistics for the given stock symbol or company name.
        """
        symbol = resolve_ticker(symbol)
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
            # Check candidate symbols (original, .NS for Indian stocks, .BO for BSE)
            candidates = [symbol]
            if not symbol.endswith(".NS") and not symbol.endswith(".BO"):
                candidates.extend([f"{symbol}.NS", f"{symbol}.BO"])

            ticker = None
            hist = None
            resolved_symbol = symbol

            for cand in candidates:
                t = yf.Ticker(cand)
                h = t.history(period="30d")
                if not h.empty:
                    ticker = t
                    hist = h
                    resolved_symbol = cand
                    break

            if hist is None or hist.empty:
                print(f"MarketDataTool: No history found for symbol {symbol}")
                return result

            # Parse metrics from historical dataframe
            last_idx = -1
            prev_idx = -2 if len(hist) >= 2 else -1

            hist_close = float(hist['Close'].iloc[last_idx])
            prev_close = float(hist['Close'].iloc[prev_idx])

            # Try to get real-time price from fast_info if market is open/available
            realtime_price = None
            try:
                realtime_price = getattr(ticker.fast_info, 'last_price', None)
                if realtime_price is not None and realtime_price > 0:
                    price = float(realtime_price)
                else:
                    price = hist_close
            except Exception:
                price = hist_close

            # If previous close is available from fast_info, use it
            try:
                fast_prev = getattr(ticker.fast_info, 'previous_close', None)
                if fast_prev is not None and fast_prev > 0:
                    prev_close = float(fast_prev)
            except Exception:
                pass

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
                "symbol": symbol,
                "resolved_symbol": resolved_symbol,
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

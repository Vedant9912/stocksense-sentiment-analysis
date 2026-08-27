"""
Lightweight financial news headline fetcher.

Default implementation scrapes Google News' public RSS search feed, which
needs no API key and works for any ticker/company name. If you have a paid
news API key (NewsAPI, Finnhub, Marketaux, etc.), drop it into .env and
swap fetch_headlines()'s body to call that provider instead -- the rest of
the pipeline (model.py, main.py) doesn't care where headlines come from.
"""
import os
from typing import List
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"


def fetch_headlines(ticker: str, limit: int = 15) -> List[dict]:
    """
    Fetches recent headlines mentioning `ticker` via Google News RSS.
    Falls back to an empty list (never raises) so the caller can decide
    how to degrade -- e.g. return a neutral/unknown sentiment instead of 500ing.
    """
    query = quote(f"{ticker} stock")
    url = GOOGLE_NEWS_RSS.format(query=query)

    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=8)
        resp.raise_for_status()
    except requests.RequestException:
        return []

    soup = BeautifulSoup(resp.content, "xml")
    items = soup.find_all("item")[:limit]

    headlines = []
    for item in items:
        title = item.find("title")
        link = item.find("link")
        
        title_text = title.text.strip() if title and title.text else ""
        link_text = link.text.strip() if link and link.text else "#"
        
        if title_text:
            headlines.append({
                "headline": title_text,
                "url": link_text
            })

    return headlines

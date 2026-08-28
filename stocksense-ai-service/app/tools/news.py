"""
Specialized NewsTool.
Retrieves financial news headlines and metadata for a ticker using Google News RSS.
"""
from typing import Dict, Any, List
from urllib.parse import quote
import requests
from bs4 import BeautifulSoup

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl=en-US&gl=US&ceid=US:en"

class NewsTool:
    @staticmethod
    def fetch(symbol: str, limit: int = 8) -> Dict[str, Any]:
        """
        Retrieves recent financial news articles for the given stock ticker.
        Returns a normalized structure:
        {
            "status": "success | unavailable",
            "news": [
                {
                    "title": str,
                    "source": str,
                    "published_at": str,
                    "url": str,
                    "description": str
                }
            ]
        }
        """
        symbol = symbol.upper().strip()
        result = {
            "status": "unavailable",
            "news": []
        }

        if not symbol:
            return result

        query = quote(f"{symbol} stock")
        url = GOOGLE_NEWS_RSS.format(query=query)

        try:
            resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=8)
            if resp.status_code != 200:
                print(f"NewsTool RSS request failed status code: {resp.status_code}")
                return result
                
            soup = BeautifulSoup(resp.content, "xml")
            items = soup.find_all("item")[:limit]
            
            articles = []
            for item in items:
                title_elm = item.find("title")
                link_elm = item.find("link")
                pub_elm = item.find("pubDate")
                src_elm = item.find("source")
                desc_elm = item.find("description")
                
                title = title_elm.text.strip() if title_elm else ""
                url_str = link_elm.text.strip() if link_elm else "#"
                published = pub_elm.text.strip() if pub_elm else ""
                source = src_elm.text.strip() if src_elm else "Unknown"
                description = desc_elm.text.strip() if desc_elm else ""
                
                # Clean up description (strip HTML tags if present)
                if "<" in description:
                    try:
                        description = BeautifulSoup(description, "html.parser").get_text().strip()
                    except:
                        pass
                
                # Truncate description if too long
                if len(description) > 200:
                    description = description[:197] + "..."

                if title:
                    articles.append({
                        "title": title,
                        "source": source,
                        "published_at": published,
                        "url": url_str,
                        "description": description or title
                    })
            
            result.update({
                "status": "success",
                "news": articles
            })
            
        except Exception as e:
            # Graceful degradation - return empty list with status unavailable instead of 500
            print(f"NewsTool scraper exception for {symbol}: {e}")

        return result

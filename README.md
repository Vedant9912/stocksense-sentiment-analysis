# StockSense -- AI News Sentiment for Stocks

Real-time stock-news sentiment using FinBERT, served through a secured
Spring Boot API with a MySQL cache, and a dark, terminal-styled dashboard.

## Architecture

```
Browser (Bootstrap-free vanilla JS, Chart-free SVG gauge)
   |  fetch() + JWT Bearer token
   v
Spring Boot (8080)              <-- presentation/security/orchestration
   |  Controller -> Service -> Repository
   |  MySQL (cache: stock_sentiment, users)
   |  @Async WebClient call on cache-miss
   v
FastAPI + FinBERT (8000)        <-- AI microservice, internal only
   - scrapes Google News RSS for the ticker
   - scores each headline with ProsusAI/finbert
   - returns aggregated positive/negative/neutral %
```

**Data flow:** Spring Boot checks MySQL first. If a row for the ticker is
younger than `sentiment.cache.minutes` (default 15), it's returned
immediately and FastAPI is never called. Otherwise, Spring Boot kicks off
an async call to FastAPI on a dedicated thread pool, immediately replies
`202 Accepted` with a `pollUrl`, and the frontend polls
`/api/stocks/sentiment/{ticker}/status` every 2s until the result is ready
(or FastAPI errors out, which surfaces as `502`).

## Running it locally

### 1. AI microservice (FastAPI)

```bash
cd stocksense-ai-service
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

First request will download `ProsusAI/finbert` (~440MB) from Hugging Face,
so make sure outbound internet is available the first time. Test it
directly:

```bash
curl http://localhost:8000/sentiment/RELIANCE
```

### 2. MySQL

```sql
CREATE DATABASE stocksense;
```
Edit `stocksense-backend/src/main/resources/application.properties` if your
MySQL username/password differ from the `root`/`root` defaults.

### 3. Backend (Spring Boot)

```bash
cd stocksense-backend
mvn spring-boot:run
```

Runs on `http://localhost:8080`. It expects the FastAPI service at
`http://localhost:8000` (see `ai.service.base-url` in
`application.properties` -- change this if you deploy FastAPI elsewhere).

### 4. Use it

Open `http://localhost:8080/login.html`, create an account, log in, and
search a ticker (try the quick chips: RELIANCE, TCS, INFY, AAPL, TSLA).

## API summary

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | public | `{username, email, password}` |
| POST | `/api/auth/login` | public | returns `{token, username}` |
| GET | `/api/stocks/sentiment/{ticker}` | Bearer JWT | 200 (cache hit) or 202 (cache miss, triggers async refresh) |
| GET | `/api/stocks/sentiment/{ticker}/status` | Bearer JWT | poll after a 202; 200 when done, 202 while in progress, 502 on AI failure |
| POST | `/api/stocks/sentiment/{ticker}/refresh` | Bearer JWT | force a fresh AI lookup, bypassing the cache |

FastAPI (internal, no auth -- keep it off the public internet):

| Method | Path | Notes |
|---|---|---|
| GET | `/sentiment/{ticker}` | scrape + FinBERT score, returns aggregate + per-headline breakdown |
| GET | `/health` | liveness check |

## Notes / things to tune before production

- Change `app.jwt.secret` in `application.properties` to a long random value.
- The news source is Google News RSS (no API key needed). Swap
  `app/scraper.py` for a paid provider (NewsAPI, Finnhub) if you need more
  reliable or higher-volume headlines.
- FastAPI has no auth -- it's designed to sit behind a firewall/VPC with
  Spring Boot as the only public entry point. Add an internal shared-secret
  header if that's not guaranteed in your deployment.
- `spring.jpa.hibernate.ddl-auto=update` is convenient for dev; use proper
  migrations (Flyway/Liquibase) before production.

# StockSense: Advanced Financial Analytics Terminal

StockSense is an enterprise-grade financial news sentiment analysis workstation. It scrapes real-time news headlines via RSS feeds, processes sentiment classifications using the **FinBERT** transformer model, and integrates interactive **TradingView technical charts**, a scrolling ticker tape, and a keyboard-driven command-line terminal interface.

---

## 🚀 Key Features

* **📟 High-Density Terminal Interface**: Pure black background (`#000000`) with high-contrast amber-cyan monospace styling (`JetBrains Mono`) optimized for rapid data reading and financial monitoring.
* **📈 TradingView Interactive Charting**: Real-time candlestick charts with **10+ technical indicators preloaded** (RSI, Simple/Exponential Moving Averages, MACD, and Bollinger Bands) for advanced technical analysis.
* **⌨️ Command Line Console (CLI)**: A floating prompt fixed at the bottom (`SYS@STOCKSENSE> _`) supporting keyboard-only navigation. Press `/` or `` ` `` (backtick) at any time to focus the console and execute commands like `/analyze AAPL`, `/compare TSLA INFY`, or `/watchlist`.
* **🔗 Clickable Source Headlines**: Verified article headlines link directly back to the original financial news publications (Yahoo Finance, TradingView, Barchart, etc.).
* **🧬 H2H Comparative Matrix**: Compare two symbols side-by-side with dual sentiment gauges, a detailed metrics comparison grid (calculating positive/negative deltas), and dynamically generated written summary analyses.
* **⚡ Serverless Low-RAM Mode (<50MB)**: Option to run sentiment classifications via the free Hugging Face Serverless Inference API, dropping Python memory footprint from **1GB to ~35MB** (crucial for deploying on 512MB free-tier instances).
* **⭐ Scoped User Watchlists**: Bookmark your favorite stocks with direct dashboard analysis shortcuts, persisted locally in user-scoped browser localStorage.
* **🌍 Live Market Indices Tape**: Scrolling ticker tape at the top featuring major indexes (**NIFTY 50, SENSEX, NASDAQ, S&P 500**) with real-time simulated price fluctuations.

---

## 🏗️ Architecture Design

```
                     Browser View (HTML5, Vanilla JS, CSS3 Variables)
                         | (JWT Bearer Token Authed Requests)
                         v
                Spring Boot Backend (8080)   <--- Presentation & Orchestration
                         | 
          +--------------+--------------+
          |                             |
          v                             v
   MySQL Cache DB               FastAPI AI Engine (8000)   <--- Sentiment Extraction
(Users, Sentiment Cache)                |
                                        +----> Local PyTorch (FinBERT weights loaded)
                                        |      [Requires 1GB RAM]
                                        OR
                                        +----> HF Serverless Inference API (Free)
                                               [Requires <50MB RAM]
```

---

## 🛠️ Local Environment Setup

### 1. Database Setup (MySQL)
Create a clean database schema:
```sql
CREATE DATABASE stocksense;
```

*Note: If your local database is running IPv4 (default Windows loopback), make sure Spring Boot is run with loopback configurations to avoid metadata timeout errors.*

### 2. AI Microservice (FastAPI)
Navigate to the directory and set up a virtual environment:
```bash
cd stocksense-ai-service
python -m venv venv
venv\Scripts\activate      # On Windows
source venv/bin/activate   # On Mac/Linux
pip install -r requirements.txt
```

#### Low-Memory Deployment (Highly Recommended):
Create a `.env` file inside `stocksense-ai-service/` and add your Hugging Face Access Token:
```env
HF_TOKEN=your_hugging_face_token_here
```
This forces the microservice to delegate classifications to Hugging Face's serverless GPUs, saving 1GB of server RAM.

Start the AI engine:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 3. Backend Setup (Spring Boot)
Ensure your environment variables are configured correctly to map IPv4 loopback dependencies:
```powershell
# In PowerShell (Windows)
$env:SPRING_DATASOURCE_URL="jdbc:mysql://127.0.0.1:3306/stocksense?createDatabaseIfNotExist=true&useSSL=false&serverTimezone=UTC";
$env:AI_SERVICE_BASE_URL="http://127.0.0.1:8000";
mvn spring-boot:run
```
Open [http://localhost:8080/login.html](http://localhost:8080/login.html) in your browser, register a user account, and log in to explore.

---

## ⌨️ Command Console Cheat Sheet

Press `/` or `` ` `` to focus the terminal console input bar at the bottom of the screen:

| Command | Action | Example |
|---|---|---|
| `/analyze [TICKER]` | Run full sentiment report + load TradingView chart on a ticker. | `/analyze AAPL` |
| `/compare [T1] [T2]` | Redirect to side-by-side comparison screen between two tickers. | `/compare TSLA MSFT` |
| `/watchlist` | Load bookmarks page and retrieve updated ratings. | `/watchlist` |
| `/dashboard` | Return to search dashboard. | `/dashboard` |
| `/clear` | Clear the active search widgets and logs. | `/clear` |
| `/help` | Launch manual helper box. | `/help` |

---

## 📋 REST API Documentation

### Spring Boot Backend (Public)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | Public | Register user account `{username, email, password}`. |
| `POST` | `/api/auth/login` | Public | Login user and retrieve JWT token `{token, username}`. |
| `GET` | `/api/stocks/sentiment/{ticker}` | Bearer JWT | Fetch sentiment. Returns `200` (cache hit) or `202` (cache miss, triggers scraper thread). |
| `GET` | `/api/stocks/sentiment/{ticker}/status` | Bearer JWT | Status polling. Returns `200` when complete, `222`/`202` in-progress, `502` on errors. |
| `POST` | `/api/stocks/sentiment/{ticker}/refresh` | Bearer JWT | Bypasses MySQL cache and forces live scrapers. |

### FastAPI Microservice (Internal)

| Method | Path | Description |
|---|---|---|
| `GET` | `/sentiment/{ticker}` | Scrapes headlines and scores each item with FinBERT sentiment model. |
| `GET` | `/health` | Core server liveness checking. |

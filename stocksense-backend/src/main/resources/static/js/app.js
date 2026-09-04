const token = localStorage.getItem('stocksense_token');
const username = localStorage.getItem('stocksense_username');

if (!token) {
  window.location.href = '/login.html';
}

document.getElementById('username-display').textContent = username ? `${username.toUpperCase()}` : '';

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('stocksense_token');
  localStorage.removeItem('stocksense_username');
  window.location.href = '/login.html';
});

/* ==========================================================================
   Client-Side View Router
   ========================================================================== */
const navLinks = document.querySelectorAll('.nav-link');
const views = document.querySelectorAll('.view-pane');

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const targetView = link.dataset.view;
    switchView(targetView);
  });
});

function switchView(viewName) {
  navLinks.forEach(link => {
    if (link.dataset.view === viewName) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  views.forEach(view => {
    if (view.id === `view-${viewName}`) {
      view.classList.remove('hidden');
    } else {
      view.classList.add('hidden');
    }
  });

  if (viewName === 'watchlist') {
    loadWatchlist();
  } else if (viewName === 'history') {
    loadHistory();
  }
}

// Default View
switchView('dashboard');

/* ==========================================================================
   Helper Utilities
   ========================================================================== */
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30;

async function authedFetch(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`
    }
  });

  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('stocksense_token');
    window.location.href = '/login.html';
    throw new Error('Session expired');
  }
  return res;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatTime(iso) {
  if (!iso) return 'JUST NOW';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).toUpperCase();
  } catch { return iso.toUpperCase(); }
}

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }).toUpperCase();
  } catch { return iso.toUpperCase(); }
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function extractTicker(text) {
  const upper = text.toUpperCase().trim();
  
  // Common company name mappings to official NSE/US tickers
  const aliases = {
    "TATA MOTORS": "TATAMOTORS",
    "TATA STEEL": "TATASTEEL",
    "HDFC BANK": "HDFCBANK",
    "ICICI BANK": "ICICIBANK",
    "KOTAK BANK": "KOTAKBANK",
    "AXIS BANK": "AXISBANK",
    "STATE BANK OF INDIA": "SBIN",
    "SBI": "SBIN",
    "RELIANCE INDUSTRIES": "RELIANCE",
    "LARSEN": "LT",
    "L&T": "LT",
    "BAJAJ FINANCE": "BAJFINANCE",
    "BHARTI AIRTEL": "BHARTIARTL",
    "HINDUSTAN UNILEVER": "HINDUNILVR",
    "HUL": "HINDUNILVR",
    "SUN PHARMA": "SUNPHARMA",
    "NESTLE INDIA": "NESTLEIND",
    "COAL INDIA": "COALINDIA",
    "ADANI ENTERPRISES": "ADANIENT",
    "ADANI PORTS": "ADANIPORTS",
    "GOOGLE": "GOOGL",
    "APPLE": "AAPL",
    "TESLA": "TSLA",
    "MICROSOFT": "MSFT",
    "AMAZON": "AMZN",
    "NVIDIA": "NVDA",
    "META": "META",
    "FACEBOOK": "META",
    "BSE": "BSE",
    "BSE LTD": "BSE",
    "BSE LIMITED": "BSE"
  };

  for (const [alias, mapped] of Object.entries(aliases)) {
    if (upper.includes(alias)) {
      return mapped;
    }
  }

  // Extract standalone uppercase tickers (2 to 12 characters)
  const stopWords = new Set(["WHY", "WHAT", "WHEN", "HOW", "NEWS", "STOCK", "STOCKS", "PRICE", "RSI", "SMA", "EMA", "TREND", "GIVE", "VIEW", "ANALYZE", "REPORT", "ABOUT", "TELL", "SHOW", "THE", "AND", "FOR", "LTD", "LIMITED", "INC", "CORP"]);
  
  const words = upper.split(/\s+/);
  for (const w of words) {
    const cleaned = w.replace(/[^A-Z0-9]/g, "");
    if (cleaned.length >= 2 && cleaned.length <= 12 && !stopWords.has(cleaned)) {
      return cleaned;
    }
  }
  return "";
}

/* ==========================================================================
   Live TradingView Technical Chart Integration with Studies
   ========================================================================== */
let tradingViewScriptLoaded = false;

function loadTradingViewWidget(ticker) {
  const chartDiv = document.getElementById('tradingview-chart');
  chartDiv.innerHTML = '';

  // 1. Resolve to canonical ticker (removing company names, spaces, or suffixes)
  let canonical = extractTicker(ticker) || ticker.toUpperCase().replace(/\.(NS|BO)$/, '').trim();
  canonical = canonical.replace(/[^A-Z0-9&]/g, '');

  if (!canonical) {
    canonical = 'AAPL';
  }

  let exchangeTicker = canonical;

  // Determine if it's an Indian stock dynamically from currentData or ticker pattern
  const isIndian = (currentData?.market?.currency === 'INR') ||
                   (currentData?.market?.resolved_symbol && (currentData.market.resolved_symbol.endsWith('.NS') || currentData.market.resolved_symbol.endsWith('.BO'))) ||
                   ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'TATAMOTORS', 'SBIN', 'ITC', 'WIPRO', 'ICICIBANK', 'BHARTIARTL', 'KOTAKBANK', 'LT', 'BAJFINANCE', 'AXISBANK', 'MARUTI', 'TITAN', 'ULTRACEMCO', 'SUNPHARMA', 'NESTLEIND', 'POWERGRID', 'NTPC', 'JSWSTEEL', 'TATASTEEL', 'M&M', 'ADANIENT', 'COALINDIA', 'HCLTECH', 'ONGC', 'TECHM', 'HINDUNILVR', 'ZOMATO', 'PAYTM', 'IRFC', 'JIOFIN', 'BEL', 'BSE'].includes(canonical);

  const isNyse = ['IBM', 'JPM', 'DIS', 'WMT', 'KO', 'UNH', 'V', 'MA', 'BA', 'GE', 'PFE', 'NKE', 'CVX', 'XOM', 'PG', 'HD', 'JNJ', 'ORCL', 'CRM', 'BABA', 'TSM', 'PLTR', 'UBER', 'SNAP', 'SONY', 'SHOP', 'SPOT', 'DELL', 'NOW', 'SQ', 'COIN'].includes(canonical);

  if (isIndian) {
    exchangeTicker = `NSE:${canonical}`;
  } else if (isNyse) {
    exchangeTicker = `NYSE:${canonical}`;
  } else {
    exchangeTicker = `NASDAQ:${canonical}`;
  }

  if (tradingViewScriptLoaded) {
    initWidget(exchangeTicker);
  } else {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.type = 'text/javascript';
    script.onload = () => {
      tradingViewScriptLoaded = true;
      initWidget(exchangeTicker);
    };
    document.head.appendChild(script);
  }
}

function initWidget(symbol) {
  try {
    new TradingView.widget({
      "width": "100%",
      "height": 450,
      "symbol": symbol,
      "interval": "D",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "toolbar_bg": "#0a0a0a",
      "enable_publishing": false,
      "hide_side_toolbar": false,
      "allow_symbol_change": true,
      "container_id": "tradingview-chart",
      "studies": [
        "MASimple@tv-basicstudies",
        "MAExp@tv-basicstudies",
        "RSI@tv-basicstudies",
        "MACD@tv-basicstudies",
        "BB@tv-basicstudies"
      ]
    });
  } catch (e) {
    console.error("Failed to load TradingView widget:", e);
  }
}

/* ==========================================================================
   Search & Agent Dashboard Logic
   ========================================================================== */
const tickerInput = document.getElementById('ticker-input');
const searchBtn = document.getElementById('search-btn');
const statusLine = document.getElementById('status-line');
const resultSection = document.getElementById('result-section');
const watchlistStar = document.getElementById('watchlist-star');
let currentTicker = '';
let currentData = null;

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    tickerInput.value = chip.dataset.ticker;
    runSearch();
  });
});

tickerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearch();
});
searchBtn.addEventListener('click', () => runSearch());

watchlistStar.addEventListener('click', () => {
  if (!currentTicker) return;
  toggleWatchlist(currentTicker);
});

function setStatus(text, isError) {
  statusLine.textContent = text;
  statusLine.className = isError ? 'error' : '';
}

function setLoadingStatus(text) {
  statusLine.innerHTML = `<span class="spinner"></span>${text}`;
  statusLine.className = '';
}

async function runSearch(customQuery = "") {
  if (typeof customQuery !== 'string') {
    customQuery = "";
  }
  const inputText = tickerInput.value.trim();
  if (!inputText) return;

  // Resolve ticker from either company name or ticker symbol
  let ticker = extractTicker(inputText) || inputText.toUpperCase().replace(/\.(NS|BO)$/, '').trim();
  ticker = ticker.replace(/[^A-Z0-9&]/g, '');

  let query;
  // If input contains multiple words and wasn't a recognized company alias, keep original query as prompt
  if (inputText.includes(" ") && !extractTicker(inputText)) {
    query = inputText;
  } else {
    query = customQuery || `Analyze the technical trend, recent news, and sentiment of ${ticker} stock.`;
  }

  if (!ticker) {
    setStatus('SYS ERROR: UNABLE TO RESOLVE TICKER SYMBOL FROM QUERY.', true);
    return;
  }

  searchBtn.disabled = true;
  resultSection.style.display = 'none';
  setLoadingStatus(`SYS: INITIATING STATEFUL RESEARCH AGENT FOR ${ticker}...`);

  try {
    const res = await authedFetch(`/api/stocks/analyze`, {
      method: 'POST',
      body: JSON.stringify({ symbol: ticker, query: query })
    });

    if (res.status === 200) {
      const data = await res.json();
      setStatus(`SYS: RETRIEVED COMPILED REPORT FROM CACHE.`);
      currentTicker = ticker;
      currentData = data;
      renderResult(ticker, data);
      await updateWatchlistStar(ticker);
      loadTradingViewWidget(ticker);
      return;
    }

    if (res.status === 202) {
      const body = await res.json();
      setLoadingStatus(`SYS: AGENT INITIALIZING WORKFLOW FOR ${ticker}...`);
      await pollForAnalysisResult(ticker, query);
      return;
    }

    const errData = await res.json().catch(() => ({}));
    setStatus(errData.error || `SYS ERROR: CANNOT COMPUTE FOR ${ticker}`, true);
  } catch (err) {
    if (err.message !== 'Session expired') {
      setStatus('SYS ERROR: NETWORK EXCEPTION IN COMPILING ANALYSIS', true);
    }
  } finally {
    searchBtn.disabled = false;
  }
}

async function pollForAnalysisResult(ticker, query) {
  const url = `/api/stocks/analyze/status?symbol=${encodeURIComponent(ticker)}&query=${encodeURIComponent(query)}`;
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    let res;
    try {
      res = await authedFetch(url);
    } catch (err) {
      return;
    }

    if (res.status === 200) {
      const data = await res.json();
      setStatus(`SYS: COMPILE DONE · AI ANALYSIS CORRELATED FOR ${ticker}`);
      currentTicker = ticker;
      currentData = data;
      renderResult(ticker, data);
      await updateWatchlistStar(ticker);
      loadTradingViewWidget(ticker);
      return;
    }

    if (res.status === 502) {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || `SYS ERROR: AGENT WORKFLOW CRASHED FOR ${ticker}`, true);
      return;
    }

    setLoadingStatus(`SYS: EXECUTING SPECIALIZED TOOLS & CORE CORRELATIONS... (${attempt + 1})`);
  }

  setStatus('SYS ERROR: COMPUTATION TIME EXCEEDED THRESHOLD. RETRY.', true);
}

function renderResult(ticker, data) {
  document.getElementById('result-ticker').textContent = ticker;
  document.getElementById('result-meta').textContent =
    `CLASSIFICATION CONFIDENCE: ${(data.confidence * 100).toFixed(0)}% · FEED SOURCE: FinBERT VIA API`;

  // Render legacy gauge and charts
  const score = Math.max(-1, Math.min(1, data.sentiment?.score ?? 0));
  const angle = score * 90;
  document.getElementById('gauge-needle').setAttribute('transform', `rotate(${angle} 110 110)`);

  const label = data.sentiment?.label || 'neutral';
  document.getElementById('gauge-label').textContent = label.toUpperCase();
  document.getElementById('gauge-label').style.color =
    label === 'positive' ? 'var(--bullish)' : label === 'negative' ? 'var(--bearish)' : 'var(--neutral)';
  document.getElementById('gauge-score').textContent = `SCORE: ${score.toFixed(2)}`;

  // Update dynamic sentiment bars from analyzed headlines
  const newsItems = data.news || [];
  if (newsItems.length > 0) {
    const posCount = newsItems.filter(n => (n.label || '').toLowerCase() === 'positive').length;
    const negCount = newsItems.filter(n => (n.label || '').toLowerCase() === 'negative').length;
    const neuCount = newsItems.filter(n => (n.label || '').toLowerCase() === 'neutral').length;
    const total = newsItems.length;
    setBar('positive', Math.round((posCount / total) * 100));
    setBar('negative', Math.round((negCount / total) * 100));
    setBar('neutral', Math.round((neuCount / total) * 100));
  } else if (label === 'positive') {
    setBar('positive', 75); setBar('negative', 10); setBar('neutral', 15);
  } else if (label === 'negative') {
    setBar('positive', 10); setBar('negative', 75); setBar('neutral', 15);
  } else {
    setBar('positive', 20); setBar('negative', 20); setBar('neutral', 60);
  }

  // Render Agent Synthesis Card
  const synthesisCard = document.getElementById('agent-synthesis-card');
  if (data.summary) {
    document.getElementById('synthesis-confidence').textContent = data.confidence.toFixed(2);
    document.getElementById('synthesis-text').textContent = data.summary;
    document.getElementById('synthesis-disclaimer').textContent = data.disclaimer || "Disclaimer: Research purposes only.";
    
    // Key drivers list
    const driversList = document.getElementById('synthesis-drivers');
    driversList.innerHTML = '';
    (data.key_drivers || []).forEach(drv => {
      const li = document.createElement('li');
      li.textContent = drv;
      driversList.appendChild(li);
    });

    // Technical table readouts
    const currSign = (data.market?.currency === 'INR' || (data.market?.resolved_symbol && (data.market.resolved_symbol.endsWith('.NS') || data.market.resolved_symbol.endsWith('.BO')))) ? '₹' : '$';
    document.getElementById('synth-close').textContent = `${currSign}${(data.market?.price || 0.0).toFixed(2)}`;
    const chg = data.market?.change || 0.0;
    const pct = data.market?.change_percent || 0.0;
    const synthDelta = document.getElementById('synth-delta');
    synthDelta.textContent = `${chg >= 0 ? '+' : ''}${currSign}${chg.toFixed(2)} (${chg >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
    synthDelta.style.color = chg >= 0 ? 'var(--bullish)' : 'var(--bearish)';

    document.getElementById('synth-rsi').textContent = (data.technical?.rsi || 50.0).toFixed(2);
    const trendSpan = document.getElementById('synth-trend');
    const trend = data.technical?.trend || 'neutral';
    trendSpan.textContent = trend.toUpperCase();
    trendSpan.style.color = trend === 'bullish' ? 'var(--bullish)' : trend === 'bearish' ? 'var(--bearish)' : 'var(--neutral)';

    const sma20El = document.getElementById('synth-sma20');
    if (sma20El) sma20El.textContent = data.technical?.sma_20 != null ? `${currSign}${data.technical.sma_20.toFixed(2)}` : '--';
    const sma50El = document.getElementById('synth-sma50');
    if (sma50El) sma50El.textContent = data.technical?.sma_50 != null ? `${currSign}${data.technical.sma_50.toFixed(2)}` : '--';

    synthesisCard.style.display = 'block';
  } else {
    synthesisCard.style.display = 'none';
  }

  // Render clickable headlines with proper sentiment badge and color
  const list = document.getElementById('headline-list');
  list.innerHTML = '';
  (data.news || []).forEach(h => {
    const hasUrl = h.url && h.url !== '#' && h.url !== '';
    const row = document.createElement(hasUrl ? 'a' : 'div');
    if (hasUrl) {
      row.href = h.url;
      row.target = '_blank';
    }
    const label = (h.label || 'neutral').toLowerCase();
    row.className = `headline-row label-${label}`;
    const scoreBadge = h.score ? ` · ${(h.score * 100).toFixed(0)}%` : '';
    row.innerHTML = `
      <span class="headline-text">${escapeHtml(h.title || h.headline || '')}</span>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
        <span class="headline-score">${label.toUpperCase()}${scoreBadge}</span>
        <span style="font-size: 9px; color: var(--text-muted);">${escapeHtml((h.source || 'RECENT').toUpperCase())}</span>
      </div>
    `;
    list.appendChild(row);
  });

  resultSection.style.display = 'block';
}

function setBar(kind, value) {
  const v = value ?? 0;
  document.getElementById(`bar-${kind}`).style.width = `${v}%`;
  document.getElementById(`val-${kind}`).textContent = `${v.toFixed(0)}%`;
}

/* ==========================================================================
   Watchlist Persistence using secure Spring Boot DB endpoints
   ========================================================================== */
async function getWatchlist() {
  try {
    const res = await authedFetch('/api/stocks/watchlist');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.error('Failed to get watchlist from server:', err);
  }
  return [];
}

async function updateWatchlistStar(ticker) {
  const list = await getWatchlist();
  if (list.includes(ticker)) {
    watchlistStar.classList.add('active');
    watchlistStar.querySelector('.star-icon').textContent = '★';
    watchlistStar.title = 'Remove from Watchlist';
  } else {
    watchlistStar.classList.remove('active');
    watchlistStar.querySelector('.star-icon').textContent = '☆';
    watchlistStar.title = 'Add to Watchlist';
  }
}

async function toggleWatchlist(ticker) {
  try {
    const res = await authedFetch(`/api/stocks/watchlist/${ticker}`, {
      method: 'POST'
    });
    if (res.ok) {
      await updateWatchlistStar(ticker);
      // Reload view if active
      if (document.getElementById('view-watchlist').classList.contains('hidden') === false) {
        await loadWatchlist();
      }
    }
  } catch (err) {
    console.error('Failed to toggle watchlist:', err);
  }
}

async function loadWatchlist() {
  const list = await getWatchlist();
  const tbody = document.getElementById('watchlist-tbody');
  const emptyState = document.getElementById('watchlist-empty');
  tbody.innerHTML = '';

  if (list.length === 0) {
    emptyState.classList.remove('hidden');
    document.querySelector('.watchlist-table').classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  document.querySelector('.watchlist-table').classList.remove('hidden');

  for (const ticker of list) {
    const row = document.createElement('tr');
    row.id = `wl-row-${ticker}`;
    row.innerHTML = `
      <td><span class="wl-ticker">${ticker}</span></td>
      <td class="wl-label-cell"><span class="wl-label neutral">PENDING</span></td>
      <td>
        <div class="wl-bar-track">
          <div class="wl-bar-fill fill-neutral" style="width: 50%"></div>
        </div>
      </td>
      <td><span class="wl-time">-</span></td>
      <td style="text-align: right;">
        <button class="btn btn-ghost wl-btn-analyze" data-ticker="${ticker}">ANALYZE</button>
        <button class="btn btn-ghost wl-btn-remove" data-ticker="${ticker}" style="color: var(--bearish);">DELETE</button>
      </td>
    `;
    tbody.appendChild(row);
    fetchWatchlistTicker(ticker);
  }
}

document.getElementById('watchlist-tbody').addEventListener('click', async (e) => {
  const analyzeBtn = e.target.closest('.wl-btn-analyze');
  const removeBtn = e.target.closest('.wl-btn-remove');

  if (analyzeBtn) {
    const ticker = analyzeBtn.dataset.ticker;
    tickerInput.value = ticker;
    switchView('dashboard');
    runSearch();
  }

  if (removeBtn) {
    const ticker = removeBtn.dataset.ticker;
    await toggleWatchlist(ticker);
    await loadWatchlist();
  }
});

async function fetchWatchlistTicker(ticker) {
  const row = document.getElementById(`wl-row-${ticker}`);
  if (!row) return;

  try {
    const res = await authedFetch(`/api/stocks/sentiment/${ticker}`);
    if (res.status === 200) {
      const data = await res.json();
      populateWatchlistRow(row, ticker, data);
    } else {
      populateWatchlistRow(row, ticker, null);
    }
  } catch (err) {
    populateWatchlistRow(row, ticker, null);
  }
}

function populateWatchlistRow(row, ticker, data) {
  const labelCell = row.querySelector('.wl-label-cell');
  const barFill = row.querySelector('.wl-bar-fill');
  const timeSpan = row.querySelector('.wl-time');

  if (!data) {
    labelCell.innerHTML = `<span class="wl-label neutral" style="background: transparent; border: 1px dashed var(--border);">UNCACHED</span>`;
    barFill.className = 'wl-bar-fill fill-neutral';
    barFill.style.width = '0%';
    timeSpan.textContent = 'RUN REPORT';
    return;
  }

  const label = data.overallLabel || 'neutral';
  labelCell.innerHTML = `<span class="wl-label ${label}">${label.toUpperCase()}</span>`;

  barFill.className = `wl-bar-fill fill-${label}`;
  const score = data.overallScore ?? 0;
  const pct = ((score + 1) / 2) * 100;
  barFill.style.width = `${pct}%`;

  timeSpan.textContent = formatTime(data.lastUpdated);
}

/* ==========================================================================
   Ticker Comparison Dashboard
   ========================================================================== */
const compareBtn = document.getElementById('compare-btn');
const compareT1Input = document.getElementById('compare-ticker-1');
const compareT2Input = document.getElementById('compare-ticker-2');
const compareStatus = document.getElementById('compare-status-line');
const compareResults = document.getElementById('compare-results');

compareT1Input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runComparison(); });
compareT2Input.addEventListener('keydown', (e) => { if (e.key === 'Enter') runComparison(); });
compareBtn.addEventListener('click', () => runComparison());

function setCompareStatus(text, isError) {
  compareStatus.textContent = text;
  compareStatus.className = isError ? 'error' : '';
}

function setCompareLoading(text) {
  compareStatus.innerHTML = `<span class="spinner"></span>${text}`;
  compareStatus.className = '';
}

async function runComparison() {
  const rawT1 = compareT1Input.value.trim();
  const rawT2 = compareT2Input.value.trim();
  
  const t1 = (extractTicker(rawT1) || rawT1.toUpperCase().replace(/\.(NS|BO)$/, '')).replace(/[^A-Z0-9&]/g, '');
  const t2 = (extractTicker(rawT2) || rawT2.toUpperCase().replace(/\.(NS|BO)$/, '')).replace(/[^A-Z0-9&]/g, '');

  if (!t1 || !t2) {
    setCompareStatus('SYS: INCORRECT PARAMETERS. SPECIFY DUAL TICKERS OR COMPANY NAMES.', true);
    return;
  }

  if (t1 === t2) {
    setCompareStatus('SYS: REDUNDANT COMPARISON NOT COMPILING.', true);
    return;
  }

  compareBtn.disabled = true;
  compareResults.classList.add('hidden');
  setCompareLoading(`SYS: COMPILING DUAL DATA SET FOR ${t1} VS ${t2}...`);

  try {
    const data1 = await fetchOrPollCompare(t1);
    const data2 = await fetchOrPollCompare(t2);

    renderCompareResults(t1, data1, t2, data2);
    setCompareStatus(`SYS: SIDE-BY-SIDE CHART COMPILED FOR ${t1} VS ${t2}`);
  } catch (err) {
    setCompareStatus(err.message || 'SYS ERROR: DUAL PIPELINE FAILED.', true);
  } finally {
    compareBtn.disabled = false;
  }
}

async function fetchOrPollCompare(ticker) {
  const query = "Comprehensive comparison of sentiment, technical indicators, and price action.";
  const res = await authedFetch(`/api/stocks/analyze`, {
    method: 'POST',
    body: JSON.stringify({ symbol: ticker, query: query })
  });

  if (res.status === 200) {
    return await res.json();
  }

  if (res.status === 202) {
    const url = `/api/stocks/analyze/status?symbol=${encodeURIComponent(ticker)}&query=${encodeURIComponent(query)}`;
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const statusRes = await authedFetch(url);

      if (statusRes.status === 200) {
        return await statusRes.json();
      }
      if (statusRes.status === 502) {
        const data = await statusRes.json().catch(() => ({}));
        throw new Error(data.error || `SYS ERROR: MODEL PIPELINE CRASHED FOR ${ticker}`);
      }
      setCompareLoading(`SYS: COMPILING AI ANALYSIS FOR ${ticker}... (attempt ${attempt + 1})`);
    }
    throw new Error(`SYS ERROR: ANALYSIS TIMEOUT EXCEEDED FOR ${ticker}`);
  }

  // Fallback to legacy sentiment endpoint if analyze returns non-200/202
  const legacyRes = await authedFetch(`/api/stocks/sentiment/${ticker}`);
  if (legacyRes.status === 200) {
    return await legacyRes.json();
  }
  throw new Error(`SYS ERROR: CANNOT RETRIEVE METRICS FOR ${ticker}`);
}

function renderCompareResults(t1, d1, t2, d2) {
  // Determine currencies and signs
  const currSign1 = (d1.market?.currency === 'INR' || (d1.market?.resolved_symbol && (d1.market.resolved_symbol.endsWith('.NS') || d1.market.resolved_symbol.endsWith('.BO')))) ? '₹' : '$';
  const currSign2 = (d2.market?.currency === 'INR' || (d2.market?.resolved_symbol && (d2.market.resolved_symbol.endsWith('.NS') || d2.market.resolved_symbol.endsWith('.BO')))) ? '₹' : '$';

  // Extract Sentiments
  const score1 = Math.max(-1, Math.min(1, d1.sentiment ? (d1.sentiment.score ?? 0) : (d1.overallScore ?? 0)));
  const score2 = Math.max(-1, Math.min(1, d2.sentiment ? (d2.sentiment.score ?? 0) : (d2.overallScore ?? 0)));
  const label1 = ((d1.sentiment ? d1.sentiment.label : d1.overallLabel) || 'neutral').toLowerCase();
  const label2 = ((d2.sentiment ? d2.sentiment.label : d2.overallLabel) || 'neutral').toLowerCase();

  // Needles
  const angle1 = score1 * 90;
  document.getElementById('comp-needle-1').setAttribute('transform', `rotate(${angle1} 110 110)`);
  document.getElementById('comp-t1-name').textContent = t1;
  document.getElementById('comp-label-1').textContent = label1.toUpperCase();
  document.getElementById('comp-label-1').className = `gauge-readout comp-readout wl-label ${label1}`;
  document.getElementById('comp-score-1').textContent = `SCORE: ${score1 >= 0 ? '+' : ''}${score1.toFixed(2)}`;

  const angle2 = score2 * 90;
  document.getElementById('comp-needle-2').setAttribute('transform', `rotate(${angle2} 110 110)`);
  document.getElementById('comp-t2-name').textContent = t2;
  document.getElementById('comp-label-2').textContent = label2.toUpperCase();
  document.getElementById('comp-label-2').className = `gauge-readout comp-readout wl-label ${label2}`;
  document.getElementById('comp-score-2').textContent = `SCORE: ${score2 >= 0 ? '+' : ''}${score2.toFixed(2)}`;

  // News items & Sentiment percentages
  const news1 = d1.news || d1.headlines || [];
  const news2 = d2.news || d2.headlines || [];

  let pos1 = 0, neg1 = 0, neu1 = 0;
  if (d1.positive != null) {
    pos1 = d1.positive; neg1 = d1.negative; neu1 = d1.neutral;
  } else if (news1.length > 0) {
    const p = news1.filter(n => (n.label || '').toLowerCase() === 'positive').length;
    const n = news1.filter(n => (n.label || '').toLowerCase() === 'negative').length;
    const u = news1.filter(n => (n.label || '').toLowerCase() === 'neutral').length;
    pos1 = Math.round((p / news1.length) * 100);
    neg1 = Math.round((n / news1.length) * 100);
    neu1 = Math.round((u / news1.length) * 100);
  } else {
    pos1 = label1 === 'positive' ? 75 : 15;
    neg1 = label1 === 'negative' ? 75 : 15;
    neu1 = label1 === 'neutral' ? 60 : 10;
  }

  let pos2 = 0, neg2 = 0, neu2 = 0;
  if (d2.positive != null) {
    pos2 = d2.positive; neg2 = d2.negative; neu2 = d2.neutral;
  } else if (news2.length > 0) {
    const p = news2.filter(n => (n.label || '').toLowerCase() === 'positive').length;
    const n = news2.filter(n => (n.label || '').toLowerCase() === 'negative').length;
    const u = news2.filter(n => (n.label || '').toLowerCase() === 'neutral').length;
    pos2 = Math.round((p / news2.length) * 100);
    neg2 = Math.round((n / news2.length) * 100);
    neu2 = Math.round((u / news2.length) * 100);
  } else {
    pos2 = label2 === 'positive' ? 75 : 15;
    neg2 = label2 === 'negative' ? 75 : 15;
    neu2 = label2 === 'neutral' ? 60 : 10;
  }

  setCompareBar(1, 'pos', pos1);
  setCompareBar(1, 'neg', neg1);
  setCompareBar(1, 'neu', neu1);

  setCompareBar(2, 'pos', pos2);
  setCompareBar(2, 'neg', neg2);
  setCompareBar(2, 'neu', neu2);

  // Headers
  document.getElementById('comp-t1-header').textContent = t1;
  document.getElementById('comp-t2-header').textContent = t2;

  // Technical & Market Metrics extraction
  const price1 = d1.market?.price ?? 0;
  const price2 = d2.market?.price ?? 0;
  const chg1 = d1.market?.change ?? 0;
  const chg2 = d2.market?.change ?? 0;
  const pct1 = d1.market?.change_percent ?? 0;
  const pct2 = d2.market?.change_percent ?? 0;

  const rsi1 = d1.technical?.rsi ?? 50.0;
  const rsi2 = d2.technical?.rsi ?? 50.0;
  const trend1 = (d1.technical?.trend || 'neutral').toLowerCase();
  const trend2 = (d2.technical?.trend || 'neutral').toLowerCase();

  const sma20_1 = d1.technical?.sma_20;
  const sma20_2 = d2.technical?.sma_20;
  const sma50_1 = d1.technical?.sma_50;
  const sma50_2 = d2.technical?.sma_50;
  const ema20_1 = d1.technical?.ema_20;
  const ema20_2 = d2.technical?.ema_20;

  // Populate 1: LAST PRICE
  const p1El = document.getElementById('m-price-1');
  const p2El = document.getElementById('m-price-2');
  const pDeltaEl = document.getElementById('m-price-delta');
  if (p1El) p1El.textContent = `${currSign1}${price1.toFixed(2)}`;
  if (p2El) p2El.textContent = `${currSign2}${price2.toFixed(2)}`;
  if (pDeltaEl) {
    if (currSign1 === currSign2 && price1 > 0 && price2 > 0) {
      const pDiff = price1 - price2;
      pDeltaEl.textContent = `${pDiff >= 0 ? '+' : ''}${currSign1}${pDiff.toFixed(2)} (${t1})`;
      pDeltaEl.style.color = pDiff >= 0 ? 'var(--bullish)' : 'var(--text-cyan)';
    } else {
      pDeltaEl.textContent = `${currSign1}${price1.toFixed(0)} vs ${currSign2}${price2.toFixed(0)}`;
      pDeltaEl.style.color = 'var(--text-muted)';
    }
  }

  // Populate 2: 24H PRICE CHANGE
  const c1El = document.getElementById('m-change-1');
  const c2El = document.getElementById('m-change-2');
  const cDeltaEl = document.getElementById('m-change-delta');
  if (c1El) {
    c1El.textContent = `${chg1 >= 0 ? '+' : ''}${currSign1}${chg1.toFixed(2)} (${pct1 >= 0 ? '+' : ''}${pct1.toFixed(2)}%)`;
    c1El.style.color = chg1 >= 0 ? 'var(--bullish)' : 'var(--bearish)';
  }
  if (c2El) {
    c2El.textContent = `${chg2 >= 0 ? '+' : ''}${currSign2}${chg2.toFixed(2)} (${pct2 >= 0 ? '+' : ''}${pct2.toFixed(2)}%)`;
    c2El.style.color = chg2 >= 0 ? 'var(--bullish)' : 'var(--bearish)';
  }
  if (cDeltaEl) {
    const pctDiff = pct1 - pct2;
    cDeltaEl.textContent = `${pctDiff >= 0 ? '+' : ''}${pctDiff.toFixed(2)}% (${pctDiff >= 0 ? t1 : t2})`;
    cDeltaEl.style.color = pctDiff >= 0 ? 'var(--bullish)' : 'var(--bearish)';
  }

  // Populate 3: TECHNICAL TREND
  const tr1El = document.getElementById('m-trend-1');
  const tr2El = document.getElementById('m-trend-2');
  const trDeltaEl = document.getElementById('m-trend-delta');
  if (tr1El) {
    tr1El.textContent = trend1.toUpperCase();
    tr1El.className = `wl-label ${trend1 === 'bullish' ? 'positive' : trend1 === 'bearish' ? 'negative' : 'neutral'}`;
  }
  if (tr2El) {
    tr2El.textContent = trend2.toUpperCase();
    tr2El.className = `wl-label ${trend2 === 'bullish' ? 'positive' : trend2 === 'bearish' ? 'negative' : 'neutral'}`;
  }
  if (trDeltaEl) {
    trDeltaEl.textContent = trend1 === trend2 ? `BOTH ${trend1.toUpperCase()}` : `${trend1.toUpperCase()} vs ${trend2.toUpperCase()}`;
    trDeltaEl.style.color = (trend1 === 'bullish' && trend2 !== 'bullish') ? 'var(--bullish)' : (trend2 === 'bullish' && trend1 !== 'bullish') ? 'var(--bearish)' : 'var(--text-cyan)';
  }

  // Populate 4: RSI (14-DAY)
  const rsi1El = document.getElementById('m-rsi-1');
  const rsi2El = document.getElementById('m-rsi-2');
  const rsiDeltaEl = document.getElementById('m-rsi-delta');
  if (rsi1El) rsi1El.textContent = `${rsi1.toFixed(2)} (${rsi1 >= 70 ? 'OVERBOUGHT' : rsi1 <= 30 ? 'OVERSOLD' : 'NEUTRAL'})`;
  if (rsi2El) rsi2El.textContent = `${rsi2.toFixed(2)} (${rsi2 >= 70 ? 'OVERBOUGHT' : rsi2 <= 30 ? 'OVERSOLD' : 'NEUTRAL'})`;
  if (rsiDeltaEl) {
    const rsiDiff = rsi1 - rsi2;
    rsiDeltaEl.textContent = `${rsiDiff >= 0 ? '+' : ''}${rsiDiff.toFixed(2)} (${rsiDiff >= 0 ? t1 : t2})`;
    rsiDeltaEl.style.color = 'var(--text-cyan)';
  }

  // Populate 5: SMA (20-DAY)
  const sma20_1El = document.getElementById('m-sma20-1');
  const sma20_2El = document.getElementById('m-sma20-2');
  const sma20DeltaEl = document.getElementById('m-sma20-delta');
  if (sma20_1El) sma20_1El.textContent = sma20_1 != null ? `${currSign1}${sma20_1.toFixed(2)}` : '--';
  if (sma20_2El) sma20_2El.textContent = sma20_2 != null ? `${currSign2}${sma20_2.toFixed(2)}` : '--';
  if (sma20DeltaEl) {
    const p1Above = sma20_1 ? price1 >= sma20_1 : null;
    const p2Above = sma20_2 ? price2 >= sma20_2 : null;
    if (p1Above != null && p2Above != null) {
      sma20DeltaEl.textContent = `${t1}: ${p1Above ? 'ABOVE' : 'BELOW'} | ${t2}: ${p2Above ? 'ABOVE' : 'BELOW'}`;
      sma20DeltaEl.style.color = p1Above && !p2Above ? 'var(--bullish)' : !p1Above && p2Above ? 'var(--bearish)' : 'var(--text-muted)';
    } else {
      sma20DeltaEl.textContent = '--';
    }
  }

  // Populate 6: SMA (50-DAY)
  const sma50_1El = document.getElementById('m-sma50-1');
  const sma50_2El = document.getElementById('m-sma50-2');
  const sma50DeltaEl = document.getElementById('m-sma50-delta');
  if (sma50_1El) sma50_1El.textContent = sma50_1 != null ? `${currSign1}${sma50_1.toFixed(2)}` : '--';
  if (sma50_2El) sma50_2El.textContent = sma50_2 != null ? `${currSign2}${sma50_2.toFixed(2)}` : '--';
  if (sma50DeltaEl) {
    const golden1 = sma20_1 && sma50_1 ? sma20_1 >= sma50_1 : null;
    const golden2 = sma20_2 && sma50_2 ? sma20_2 >= sma50_2 : null;
    if (golden1 != null && golden2 != null) {
      sma50DeltaEl.textContent = `${t1}: ${golden1 ? 'GOLDEN' : 'BEARISH'} | ${t2}: ${golden2 ? 'GOLDEN' : 'BEARISH'}`;
      sma50DeltaEl.style.color = golden1 && !golden2 ? 'var(--bullish)' : !golden1 && golden2 ? 'var(--bearish)' : 'var(--text-muted)';
    } else {
      sma50DeltaEl.textContent = '--';
    }
  }

  // Populate 7: EMA (20-DAY)
  const ema20_1El = document.getElementById('m-ema20-1');
  const ema20_2El = document.getElementById('m-ema20-2');
  const ema20DeltaEl = document.getElementById('m-ema20-delta');
  if (ema20_1El) ema20_1El.textContent = ema20_1 != null ? `${currSign1}${ema20_1.toFixed(2)}` : '--';
  if (ema20_2El) ema20_2El.textContent = ema20_2 != null ? `${currSign2}${ema20_2.toFixed(2)}` : '--';
  if (ema20DeltaEl) {
    ema20DeltaEl.textContent = 'MOMENTUM PROXY';
    ema20DeltaEl.style.color = 'var(--text-muted)';
  }

  // Populate 8: Sentiment Rating
  document.getElementById('m-rating-1').textContent = label1.toUpperCase();
  document.getElementById('m-rating-1').className = `wl-label ${label1}`;
  document.getElementById('m-rating-2').textContent = label2.toUpperCase();
  document.getElementById('m-rating-2').className = `wl-label ${label2}`;
  document.getElementById('m-rating-delta').textContent = label1 === label2 ? 'MATCHING' : `${label1.toUpperCase()} vs ${label2.toUpperCase()}`;
  document.getElementById('m-rating-delta').style.color = label1 === label2 ? 'var(--text-muted)' : 'var(--text-cyan)';

  // Populate 9: Scores Matrix
  document.getElementById('m-score-1').textContent = `${score1 >= 0 ? '+' : ''}${score1.toFixed(2)}`;
  document.getElementById('m-score-2').textContent = `${score2 >= 0 ? '+' : ''}${score2.toFixed(2)}`;
  const scoreDelta = score1 - score2;
  document.getElementById('m-score-delta').textContent = scoreDelta >= 0 ? `+${scoreDelta.toFixed(2)} (${t1})` : `${scoreDelta.toFixed(2)} (${t2})`;
  document.getElementById('m-score-delta').style.color = scoreDelta >= 0 ? 'var(--bullish)' : 'var(--bearish)';

  // Populate 10: Bullish Ratio Matrix
  document.getElementById('m-bull-1').textContent = `${pos1.toFixed(0)}%`;
  document.getElementById('m-bull-2').textContent = `${pos2.toFixed(0)}%`;
  const bullDelta = pos1 - pos2;
  document.getElementById('m-bull-delta').textContent = bullDelta >= 0 ? `+${bullDelta.toFixed(0)}% (${t1})` : `${bullDelta.toFixed(0)}% (${t2})`;
  document.getElementById('m-bull-delta').style.color = bullDelta >= 0 ? 'var(--bullish)' : 'var(--bearish)';

  // Populate 11: Bearish Ratio Matrix
  document.getElementById('m-bear-1').textContent = `${neg1.toFixed(0)}%`;
  document.getElementById('m-bear-2').textContent = `${neg2.toFixed(0)}%`;
  const bearDelta = neg1 - neg2;
  document.getElementById('m-bear-delta').textContent = bearDelta >= 0 ? `+${bearDelta.toFixed(0)}% (${t1})` : `${bearDelta.toFixed(0)}% (${t2})`;
  document.getElementById('m-bear-delta').style.color = bearDelta >= 0 ? 'var(--bearish)' : 'var(--bullish)';

  // Populate 12: Headline Count Matrix
  const count1 = news1.length;
  const count2 = news2.length;
  document.getElementById('m-count-1').textContent = count1;
  document.getElementById('m-count-2').textContent = count2;
  const countDelta = count1 - count2;
  document.getElementById('m-count-delta').textContent = countDelta >= 0 ? `+${countDelta} (${t1})` : `${countDelta} (${t2})`;
  document.getElementById('m-count-delta').style.color = 'var(--text-cyan)';

  // 2. Comprehensive AI Agent Comparative Explanation Synthesis
  let summaryText = "";
  const strongerSentiment = score1 >= score2 ? t1 : t2;
  const weakerSentiment = score1 >= score2 ? t2 : t1;
  const higherScore = Math.max(score1, score2);
  const lowerScore = Math.min(score1, score2);
  const scoreDiff = Math.abs(score1 - score2).toFixed(2);

  // Technical posture description
  let techAssessment = "";
  if (trend1 === 'bullish' && trend2 !== 'bullish') {
    techAssessment = `${t1} holds a distinct technical advantage over ${t2}, trading in a confirmed bullish structure (RSI: ${rsi1.toFixed(1)}${sma20_1 ? `, above SMA-20 of ${currSign1}${sma20_1.toFixed(1)}` : ''}), whereas ${t2} exhibits a ${trend2} posture (RSI: ${rsi2.toFixed(1)}).`;
  } else if (trend2 === 'bullish' && trend1 !== 'bullish') {
    techAssessment = `${t2} demonstrates stronger technical momentum than ${t1}, maintaining a bullish posture (RSI: ${rsi2.toFixed(1)}${sma20_2 ? `, above SMA-20 of ${currSign2}${sma20_2.toFixed(1)}` : ''}), compared to ${t1}'s ${trend1} technical profile (RSI: ${rsi1.toFixed(1)}).`;
  } else if (trend1 === 'bullish' && trend2 === 'bullish') {
    techAssessment = `Both ${t1} and ${t2} are exhibiting robust bullish technical trends. ${t1}'s RSI stands at ${rsi1.toFixed(1)} while ${t2}'s RSI is ${rsi2.toFixed(1)}, indicating strong upward momentum across both assets.`;
  } else {
    techAssessment = `Both ${t1} and ${t2} are currently navigating defensive or consolidating territory (${trend1} vs ${trend2}), with RSI readings of ${rsi1.toFixed(1)} and ${rsi2.toFixed(1)} respectively.`;
  }

  // Sentiment synthesis
  let sentAssessment = "";
  if (parseFloat(scoreDiff) < 0.15) {
    sentAssessment = `From a news sentiment standpoint, both assets show aligned market perception with negligible spread (delta: ${scoreDiff}). ${t1} has a bullish ratio of ${pos1}% while ${t2} records ${pos2}%.`;
  } else {
    sentAssessment = `FinBERT news sentiment strongly favors ${strongerSentiment} (score ${higherScore >= 0 ? '+' : ''}${higherScore.toFixed(2)}, ${strongerSentiment === t1 ? pos1 : pos2}% bullish) over ${weakerSentiment} (score ${lowerScore >= 0 ? '+' : ''}${lowerScore.toFixed(2)}, ${weakerSentiment === t1 ? pos1 : pos2}% bullish), creating a +${scoreDiff} sentiment spread.`;
  }

  // Strategic conclusion
  let conclusion = "";
  if (trend1 === 'bullish' && label1 === 'positive' && (trend2 !== 'bullish' || label2 !== 'positive')) {
    conclusion = `Overall, ${t1} presents the more compelling setup with both technical momentum and institutional news sentiment pointing in harmony, outperforming ${t2}.`;
  } else if (trend2 === 'bullish' && label2 === 'positive' && (trend1 !== 'bullish' || label1 !== 'positive')) {
    conclusion = `Overall, ${t2} presents the superior composite profile, backed by convergent technical strength and positive news tailwinds relative to ${t1}.`;
  } else if (higherScore > 0.2 && (trend1 === 'bullish' || trend2 === 'bullish')) {
    conclusion = `While ${strongerSentiment} enjoys the sentiment edge, cross-market correlations suggest monitoring RSI levels for short-term overbought conditions before taking momentum positions.`;
  } else {
    conclusion = `Neither asset presents an uninhibited breakout; investors should observe SMA-20 support levels and upcoming news catalysts before committing capital.`;
  }

  summaryText = `${techAssessment} ${sentAssessment} ${conclusion}`;
  document.getElementById('compare-summary-text').textContent = summaryText;

  // Key Drivers & Signals List
  const driversList = document.getElementById('compare-drivers-list');
  if (driversList) {
    driversList.innerHTML = '';
    const items = [
      `Price Momentum: ${t1} is at ${currSign1}${price1.toFixed(2)} (${pct1 >= 0 ? '+' : ''}${pct1.toFixed(2)}%) vs ${t2} at ${currSign2}${price2.toFixed(2)} (${pct2 >= 0 ? '+' : ''}${pct2.toFixed(2)}%).`,
      `Oscillator Check: ${t1} RSI(14) is ${rsi1.toFixed(1)} (${rsi1 >= 70 ? 'Overbought' : rsi1 <= 30 ? 'Oversold' : 'Neutral range'}) vs ${t2} RSI(14) of ${rsi2.toFixed(1)} (${rsi2 >= 70 ? 'Overbought' : rsi2 <= 30 ? 'Oversold' : 'Neutral range'}).`,
      `Moving Averages: ${t1} SMA-20 is ${sma20_1 ? `${currSign1}${sma20_1.toFixed(2)}` : 'N/A'} (SMA-50: ${sma50_1 ? `${currSign1}${sma50_1.toFixed(2)}` : 'N/A'}) | ${t2} SMA-20 is ${sma20_2 ? `${currSign2}${sma20_2.toFixed(2)}` : 'N/A'} (SMA-50: ${sma50_2 ? `${currSign2}${sma50_2.toFixed(2)}` : 'N/A'}).`,
      `Institutional Sentiment: ${t1} scored ${score1 >= 0 ? '+' : ''}${score1.toFixed(2)} (${pos1}% bullish / ${neg1}% bearish) vs ${t2} scored ${score2 >= 0 ? '+' : ''}${score2.toFixed(2)} (${pos2}% bullish / ${neg2}% bearish).`
    ];
    items.forEach(it => {
      const li = document.createElement('li');
      li.textContent = it;
      driversList.appendChild(li);
    });
  }

  // 3. Render Side-by-Side News Headlines with sentiment badges
  renderCompareHeadlines('comp-t1-hl-title', 'comp-t1-hl-list', t1, news1);
  renderCompareHeadlines('comp-t2-hl-title', 'comp-t2-hl-list', t2, news2);

  compareResults.classList.remove('hidden');
}

function renderCompareHeadlines(titleId, listId, ticker, headlines) {
  document.getElementById(titleId).textContent = `${ticker} LATEST HEADLINES`;
  const list = document.getElementById(listId);
  list.innerHTML = '';

  const subset = (headlines || []).slice(0, 5);
  if (subset.length === 0) {
    list.innerHTML = `<div class="empty-state" style="padding: 12px; font-size:11px;">No news reports available.</div>`;
    return;
  }

  subset.forEach(h => {
    const hasUrl = h.url && h.url !== '#' && h.url !== '';
    const row = document.createElement(hasUrl ? 'a' : 'div');
    if (hasUrl) {
      row.href = h.url;
      row.target = '_blank';
    }
    const label = (h.label || 'neutral').toLowerCase();
    row.className = `headline-row label-${label}`;
    const scoreBadge = h.score ? ` · ${(h.score * 100).toFixed(0)}%` : '';
    row.innerHTML = `
      <span class="headline-text" style="font-size: 11.5px;">${escapeHtml(h.title || h.headline || '')}</span>
      <div style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
        <span class="headline-score">${label.toUpperCase()}${scoreBadge}</span>
        <span style="font-size: 9px; color: var(--text-muted);">${escapeHtml((h.source || 'NEWS').toUpperCase())}</span>
      </div>
    `;
    list.appendChild(row);
  });
}

function setCompareBar(tickerNum, kind, value) {
  const v = value ?? 0;
  document.getElementById(`comp-bar-${kind}-${tickerNum}`).style.width = `${v}%`;
  document.getElementById(`comp-val-${kind}-${tickerNum}`).textContent = `${v.toFixed(0)}%`;
}

/* ==========================================================================
   Query History Viewer Log Loader
   ========================================================================== */
async function loadHistory() {
  const tbody = document.getElementById('history-tbody');
  const emptyState = document.getElementById('history-empty');
  tbody.innerHTML = '';

  try {
    const res = await authedFetch('/api/stocks/history');
    if (!res.ok) throw new Error("History fetch failed");

    const history = await res.json();
    if (!history || history.length === 0) {
      emptyState.classList.remove('hidden');
      document.querySelector('.history-table').classList.add('hidden');
      return;
    }

    emptyState.classList.add('hidden');
    document.querySelector('.history-table').classList.remove('hidden');

    history.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td><span class="wl-time">${formatDate(item.createdAt)}</span></td>
        <td><span class="wl-ticker">${escapeHtml(item.symbol)}</span></td>
        <td><span style="color: var(--text-muted); font-size: 0.9em;">"${escapeHtml(item.query)}"</span></td>
        <td style="text-align: right;">
          <button class="btn btn-ghost wl-btn-reload" data-symbol="${escapeHtml(item.symbol)}" data-query="${escapeHtml(item.query)}">RELOAD</button>
        </td>
      `;
      tbody.appendChild(row);
    });

  } catch (err) {
    console.error('Failed to load query history:', err);
    emptyState.classList.remove('hidden');
    document.querySelector('.history-table').classList.add('hidden');
  }
}

document.getElementById('history-tbody').addEventListener('click', async (e) => {
  const reloadBtn = e.target.closest('.wl-btn-reload');
  if (reloadBtn) {
    const symbol = reloadBtn.dataset.symbol;
    const query = reloadBtn.dataset.query;
    
    tickerInput.value = query; // Insert original query into input box
    switchView('dashboard');
    await runSearch(query);
  }
});

/* ==========================================================================
   Keyboard-focused Command Console Prompt & CLI
   ========================================================================== */
const terminalInput = document.getElementById('terminal-input');

window.addEventListener('keydown', (e) => {
  if ((e.key === '/' || e.key === '`') && document.activeElement !== terminalInput && document.activeElement.tagName !== 'INPUT') {
    e.preventDefault();
    terminalInput.focus();
    terminalInput.value = '';
  }
});

terminalInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const rawVal = terminalInput.value.trim();
    terminalInput.value = '';
    if (!rawVal) return;

    await executeCliCommand(rawVal);
  }
});

async function executeCliCommand(cmdStr) {
  if (!cmdStr.startsWith('/')) {
    return;
  }

  const parts = cmdStr.split(' ').filter(p => p.length > 0);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  if (command === '/help') {
    alert("STOCKSENSE CLI MANUAL:\n" +
          "/analyze [TICKER]       - Runs sentiment report on ticker.\n" +
          "/compare [T1] [T2]      - Open side-by-side comparison screen.\n" +
          "/watchlist             - Switches terminal to Watchlist view.\n" +
          "/history               - Switches terminal to History Logs view.\n" +
          "/dashboard             - Switches terminal to main Dashboard view.\n" +
          "/clear                 - Resets analysis panels.\n" +
          "Press ` (backtick) or / key at any time to focus command prompt.");
    return;
  }

  if (command === '/analyze') {
    if (!args[0]) {
      alert("SYS ERROR: SPECIFY SYMBOL PROMPT, e.g. /analyze AAPL");
      return;
    }
    const symbol = args[0].toUpperCase();
    switchView('dashboard');
    tickerInput.value = symbol;
    runSearch();
    return;
  }

  if (command === '/compare') {
    if (!args[0] || !args[1]) {
      alert("SYS ERROR: SPECIFY DUAL SYMBOLS, e.g. /compare AAPL TSLA");
      return;
    }
    const t1 = args[0].toUpperCase();
    const t2 = args[1].toUpperCase();
    switchView('compare');
    compareT1Input.value = t1;
    compareT2Input.value = t2;
    runComparison();
    return;
  }

  if (command === '/watchlist') {
    switchView('watchlist');
    return;
  }

  if (command === '/history') {
    switchView('history');
    return;
  }

  if (command === '/dashboard') {
    switchView('dashboard');
    return;
  }

  if (command === '/clear') {
    switchView('dashboard');
    tickerInput.value = '';
    resultSection.style.display = 'none';
    setStatus('');
    return;
  }

  alert(`SYS ERROR: COMMAND "${command}" NOT INITIALIZED. TYPE /help FOR MANUAL.`);
}

/* ==========================================================================
   Indices Fluctuation Simulation (Real-time Live feeling)
   ========================================================================== */
function simulateIndicesFluctuation() {
  setInterval(() => {
    updateIndexItem('idx-nifty', 24310.20, 142.15, 0.59);
    updateIndexItem('idx-sensex', 79480.35, 420.80, 0.53);
    updateIndexItem('idx-nasdaq', 17895.40, -85.20, -0.47);
    updateIndexItem('idx-sp500', 5572.10, 12.45, 0.22);
  }, 4000);
}

function updateIndexItem(elementId, baseVal, baseChg, basePct) {
  const item = document.getElementById(elementId);
  if (!item) return;

  const flux = (Math.random() - 0.5) * 5;
  const val = baseVal + flux;
  const chg = baseChg + flux;
  const pct = basePct + (flux / baseVal) * 100;
  
  const isUp = chg >= 0;
  
  item.querySelector('.val').textContent = val.toLocaleString([], { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  
  const chgSpan = item.querySelector('.chg');
  chgSpan.className = isUp ? 'chg up' : 'chg down';
  chgSpan.textContent = `${isUp ? '▲' : '▼'} ${isUp ? '+' : ''}${chg.toFixed(2)} (${isUp ? '+' : ''}${pct.toFixed(2)}%)`;
}

simulateIndicesFluctuation();

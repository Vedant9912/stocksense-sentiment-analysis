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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ==========================================================================
   Live TradingView Technical Chart Integration with Studies
   ========================================================================== */
let tradingViewScriptLoaded = false;

function loadTradingViewWidget(ticker) {
  // Clear previous chart container
  const chartDiv = document.getElementById('tradingview-chart');
  chartDiv.innerHTML = '';

  // Determine correct exchange format for ticker
  // Indian stocks fallback to NSE, US stocks to NASDAQ
  let exchangeTicker = ticker.toUpperCase();
  if (['RELIANCE', 'TCS', 'INFY'].includes(exchangeTicker)) {
    exchangeTicker = `NSE:${exchangeTicker}`;
  } else {
    exchangeTicker = `NASDAQ:${exchangeTicker}`;
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
      // Pre-apply 10-15 key indicators inside basic studies (EMA, SMA, RSI, MACD, Bollinger Bands)
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
   Search Dashboard Logic
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
searchBtn.addEventListener('click', runSearch);

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

async function runSearch() {
  const ticker = tickerInput.value.trim().toUpperCase();
  if (!ticker) return;

  searchBtn.disabled = true;
  resultSection.style.display = 'none';
  setLoadingStatus(`SYS: FETCHING CACHED SENTIMENT FOR ${ticker}...`);

  try {
    const res = await authedFetch(`/api/stocks/sentiment/${ticker}`);

    if (res.status === 200) {
      const data = await res.json();
      setStatus(`SYS: CACHE HIT · LAST SECURED RECORD ${formatTime(data.lastUpdated)}`);
      currentTicker = ticker;
      currentData = data;
      renderResult(ticker, data);
      updateWatchlistStar(ticker);
      loadTradingViewWidget(ticker);
      return;
    }

    if (res.status === 202) {
      setLoadingStatus(`SYS: CACHE MISS -- DISPATCHING AI RSS SCRAPER FOR ${ticker}...`);
      await pollForResult(ticker);
      return;
    }

    const errData = await res.json().catch(() => ({}));
    setStatus(errData.error || `SYS ERROR: CANNOT COMPUTE FOR ${ticker}`, true);
  } catch (err) {
    if (err.message !== 'Session expired') {
      setStatus('SYS ERROR: NETWORK EXCEPTION IN COMPILING SENTIMENT', true);
    }
  } finally {
    searchBtn.disabled = false;
  }
}

async function pollForResult(ticker) {
  for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
    await sleep(POLL_INTERVAL_MS);

    let res;
    try {
      res = await authedFetch(`/api/stocks/sentiment/${ticker}/status`);
    } catch (err) {
      return;
    }

    if (res.status === 200) {
      const data = await res.json();
      setStatus(`SYS: COMPILE DONE · AI ANALYSIS MERGED FOR ${ticker}`);
      currentTicker = ticker;
      currentData = data;
      renderResult(ticker, data);
      updateWatchlistStar(ticker);
      loadTradingViewWidget(ticker);
      return;
    }

    if (res.status === 502) {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || `SYS ERROR: MODEL PIPELINE CRASHED FOR ${ticker}`, true);
      return;
    }

    setLoadingStatus(`SYS: CLASSIFYING RSS HEADLINES VIA FinBERT MODEL... (${attempt + 1})`);
  }

  setStatus('SYS ERROR: COMPUTATION TIME EXCEEDED THRESHOLD. RETRY.', true);
}

function renderResult(ticker, data) {
  document.getElementById('result-ticker').textContent = ticker;
  document.getElementById('result-meta').textContent =
    `${data.headlineCount ?? data.headlines?.length ?? 0} HEADLINES ANALYZED · FEED SOURCE: ${data.source.toUpperCase()}`;

  const score = Math.max(-1, Math.min(1, data.overallScore ?? 0));
  const angle = score * 90;
  document.getElementById('gauge-needle').setAttribute('transform', `rotate(${angle} 110 110)`);

  const label = data.overallLabel || 'neutral';
  document.getElementById('gauge-label').textContent = label;
  document.getElementById('gauge-label').style.color =
    label === 'positive' ? 'var(--bullish)' : label === 'negative' ? 'var(--bearish)' : 'var(--neutral)';
  document.getElementById('gauge-score').textContent = `SCORE: ${score.toFixed(2)}`;

  setBar('positive', data.positive);
  setBar('negative', data.negative);
  setBar('neutral', data.neutral);

  const list = document.getElementById('headline-list');
  list.innerHTML = '';
  (data.headlines || []).forEach(h => {
    const hasUrl = h.url && h.url !== '#' && h.url !== '';
    const row = document.createElement(hasUrl ? 'a' : 'div');
    if (hasUrl) {
      row.href = h.url;
      row.target = '_blank';
    }
    row.className = `headline-row label-${h.label}`;
    row.innerHTML = `
      <span class="headline-text">${escapeHtml(h.headline)}</span>
      <span class="headline-score">${h.label.toUpperCase()} · ${(h.score * 100).toFixed(0)}%</span>
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
   Watchlist Persistence using localStorage
   ========================================================================== */
function getWatchlistKey() {
  return 'stocksense_watchlist_' + (username || 'default');
}

function getWatchlist() {
  const stored = localStorage.getItem(getWatchlistKey());
  return stored ? JSON.parse(stored) : [];
}

function saveWatchlist(list) {
  localStorage.setItem(getWatchlistKey(), JSON.stringify(list));
}

function updateWatchlistStar(ticker) {
  const list = getWatchlist();
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

function toggleWatchlist(ticker) {
  let list = getWatchlist();
  if (list.includes(ticker)) {
    list = list.filter(t => t !== ticker);
    saveWatchlist(list);
  } else {
    list.push(ticker);
    saveWatchlist(list);
  }
  updateWatchlistStar(ticker);
}

async function loadWatchlist() {
  const list = getWatchlist();
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

document.getElementById('watchlist-tbody').addEventListener('click', (e) => {
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
    toggleWatchlist(ticker);
    loadWatchlist();
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
compareBtn.addEventListener('click', runComparison);

function setCompareStatus(text, isError) {
  compareStatus.textContent = text;
  compareStatus.className = isError ? 'error' : '';
}

function setCompareLoading(text) {
  compareStatus.innerHTML = `<span class="spinner"></span>${text}`;
  compareStatus.className = '';
}

async function runComparison() {
  const t1 = compareT1Input.value.trim().toUpperCase();
  const t2 = compareT2Input.value.trim().toUpperCase();

  if (!t1 || !t2) {
    setCompareStatus('SYS: INCORRECT PARAMETERS. SPECIFY DUAL TICKERS.', true);
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
  const res = await authedFetch(`/api/stocks/sentiment/${ticker}`);
  if (res.status === 200) {
    return await res.json();
  }

  if (res.status === 202) {
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const statusRes = await authedFetch(`/api/stocks/sentiment/${ticker}/status`);

      if (statusRes.status === 200) {
        return await statusRes.json();
      }
      if (statusRes.status === 502) {
        throw new Error(`SYS ERROR: MODEL PIPELINE CRASHED FOR ${ticker}`);
      }
      setCompareLoading(`SYS: RESOLVING CACHE-MISS ON ${ticker}... (attempt ${attempt + 1})`);
    }
    throw new Error(`SYS ERROR: ANALYSIS TIMEOUT EXCEEDED FOR ${ticker}`);
  }

  throw new Error(`SYS ERROR: HTTP GATEWAY EXCEPTION ON ${ticker}`);
}

function renderCompareResults(t1, d1, t2, d2) {
  document.getElementById('comp-t1-name').textContent = t1;
  const score1 = Math.max(-1, Math.min(1, d1.overallScore ?? 0));
  const angle1 = score1 * 90;
  document.getElementById('comp-needle-1').setAttribute('transform', `rotate(${angle1} 110 110)`);
  const label1 = d1.overallLabel || 'neutral';
  document.getElementById('comp-label-1').textContent = label1.toUpperCase();
  document.getElementById('comp-label-1').className = `gauge-readout comp-readout wl-label ${label1}`;
  document.getElementById('comp-score-1').textContent = `SCORE: ${score1.toFixed(2)}`;

  setCompareBar(1, 'pos', d1.positive);
  setCompareBar(1, 'neg', d1.negative);
  setCompareBar(1, 'neu', d1.neutral);

  document.getElementById('comp-t2-name').textContent = t2;
  const score2 = Math.max(-1, Math.min(1, d2.overallScore ?? 0));
  const angle2 = score2 * 90;
  document.getElementById('comp-needle-2').setAttribute('transform', `rotate(${angle2} 110 110)`);
  const label2 = d2.overallLabel || 'neutral';
  document.getElementById('comp-label-2').textContent = label2.toUpperCase();
  document.getElementById('comp-label-2').className = `gauge-readout comp-readout wl-label ${label2}`;
  document.getElementById('comp-score-2').textContent = `SCORE: ${score2.toFixed(2)}`;

  setCompareBar(2, 'pos', d2.positive);
  setCompareBar(2, 'neg', d2.negative);
  setCompareBar(2, 'neu', d2.neutral);

  // 1. Populate H2H Table Columns
  document.getElementById('comp-t1-header').textContent = t1;
  document.getElementById('comp-t2-header').textContent = t2;

  // Rating Matrix
  document.getElementById('m-rating-1').textContent = label1.toUpperCase();
  document.getElementById('m-rating-1').className = `wl-label ${label1}`;
  document.getElementById('m-rating-2').textContent = label2.toUpperCase();
  document.getElementById('m-rating-2').className = `wl-label ${label2}`;
  document.getElementById('m-rating-delta').textContent = label1 === label2 ? 'MATCHING' : `${label1.toUpperCase()} vs ${label2.toUpperCase()}`;
  document.getElementById('m-rating-delta').style.color = label1 === label2 ? 'var(--text-muted)' : 'var(--text-cyan)';

  // Scores Matrix
  document.getElementById('m-score-1').textContent = score1.toFixed(2);
  document.getElementById('m-score-2').textContent = score2.toFixed(2);
  const scoreDelta = score1 - score2;
  document.getElementById('m-score-delta').textContent = scoreDelta >= 0 ? `+${scoreDelta.toFixed(2)} (${t1})` : `${scoreDelta.toFixed(2)} (${t2})`;
  document.getElementById('m-score-delta').style.color = scoreDelta >= 0 ? 'var(--bullish)' : 'var(--bearish)';

  // Bullish Ratio Matrix
  document.getElementById('m-bull-1').textContent = `${(d1.positive || 0).toFixed(0)}%`;
  document.getElementById('m-bull-2').textContent = `${(d2.positive || 0).toFixed(0)}%`;
  const bullDelta = (d1.positive || 0) - (d2.positive || 0);
  document.getElementById('m-bull-delta').textContent = bullDelta >= 0 ? `+${bullDelta.toFixed(0)}% (${t1})` : `${bullDelta.toFixed(0)}% (${t2})`;
  document.getElementById('m-bull-delta').style.color = bullDelta >= 0 ? 'var(--bullish)' : 'var(--bearish)';

  // Bearish Ratio Matrix
  document.getElementById('m-bear-1').textContent = `${(d1.negative || 0).toFixed(0)}%`;
  document.getElementById('m-bear-2').textContent = `${(d2.negative || 0).toFixed(0)}%`;
  const bearDelta = (d1.negative || 0) - (d2.negative || 0);
  document.getElementById('m-bear-delta').textContent = bearDelta >= 0 ? `+${bearDelta.toFixed(0)}% (${t1})` : `${bearDelta.toFixed(0)}% (${t2})`;
  document.getElementById('m-bear-delta').style.color = bearDelta >= 0 ? 'var(--bearish)' : 'var(--bullish)';

  // Headline Count Matrix
  const count1 = d1.headlineCount ?? d1.headlines?.length ?? 0;
  const count2 = d2.headlineCount ?? d2.headlines?.length ?? 0;
  document.getElementById('m-count-1').textContent = count1;
  document.getElementById('m-count-2').textContent = count2;
  const countDelta = count1 - count2;
  document.getElementById('m-count-delta').textContent = countDelta >= 0 ? `+${countDelta} (${t1})` : `${countDelta} (${t2})`;
  document.getElementById('m-count-delta').style.color = 'var(--text-cyan)';

  // 2. Generate H2H Context Summary Paragraph
  let summaryText = "";
  const stronger = score1 > score2 ? t1 : t2;
  const weaker = score1 > score2 ? t2 : t1;
  const diffAbs = Math.abs(score1 - score2).toFixed(2);

  if (diffAbs < 0.15) {
    summaryText = `Both ${t1} and ${t2} exhibit a closely matched sentiment profile. The difference in their aggregate sentiment scores is negligible (${diffAbs}). ${t1} is rated as ${label1.toUpperCase()} (score ${score1.toFixed(2)}) and ${t2} is rated as ${label2.toUpperCase()} (score ${score2.toFixed(2)}).`;
  } else {
    summaryText = `${stronger} displays a noticeably more positive sentiment profile compared to ${weaker}. The sentiment delta is ${diffAbs}. ${stronger} has a bullish ratio of ${score1 > score2 ? (d1.positive || 0).toFixed(0) : (d2.positive || 0).toFixed(0)}% (vs ${score1 > score2 ? (d2.positive || 0).toFixed(0) : (d1.positive || 0).toFixed(0)}%), indicating stronger overall market optimism.`;
  }
  document.getElementById('compare-summary-text').textContent = summaryText;

  // 3. Render Side-by-Side News Headlines (max 4 per ticker)
  renderCompareHeadlines('comp-t1-hl-title', 'comp-t1-hl-list', t1, d1.headlines);
  renderCompareHeadlines('comp-t2-hl-title', 'comp-t2-hl-list', t2, d2.headlines);

  compareResults.classList.remove('hidden');
}

function renderCompareHeadlines(titleId, listId, ticker, headlines) {
  document.getElementById(titleId).textContent = `${ticker} LATEST HEADLINES`;
  const list = document.getElementById(listId);
  list.innerHTML = '';

  const subset = (headlines || []).slice(0, 4);
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
    row.className = `headline-row label-${h.label}`;
    row.innerHTML = `
      <span class="headline-text" style="font-size: 11px;">${escapeHtml(h.headline)}</span>
      <span class="headline-score">${h.label.toUpperCase()}</span>
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
   Keyboard-focused Command Console Prompt & CLI
   ========================================================================== */
const terminalInput = document.getElementById('terminal-input');

// Keypress listener to focus console instantly on `/` or backtick
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
  // Echo or process
  if (!cmdStr.startsWith('/')) {
    // Treat as notepad entry/echo if not starting with slash
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

  const flux = (Math.random() - 0.5) * 5; // tiny random fluctuation
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

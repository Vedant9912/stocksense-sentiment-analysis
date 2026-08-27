const token = localStorage.getItem('stocksense_token');
const username = localStorage.getItem('stocksense_username');

if (!token) {
  window.location.href = '/login.html';
}

document.getElementById('username-display').textContent = username ? `@${username}` : '';

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('stocksense_token');
  localStorage.removeItem('stocksense_username');
  window.location.href = '/login.html';
});

/* ==========================================================================
   Router Logic
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

  // Action hooks when switching views
  if (viewName === 'watchlist') {
    loadWatchlist();
  }
}

// Default view
switchView('dashboard');

/* ==========================================================================
   Helper Functions (API communication)
   ========================================================================== */
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 30; // ~60s ceiling before giving up

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
  if (!iso) return 'just now';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ==========================================================================
   Dashboard logic (Single Ticker Search)
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
  setLoadingStatus(`Checking cached sentiment for ${ticker}...`);

  try {
    const res = await authedFetch(`/api/stocks/sentiment/${ticker}`);

    if (res.status === 200) {
      const data = await res.json();
      setStatus(`Loaded from cache · last updated ${formatTime(data.lastUpdated)}`);
      currentTicker = ticker;
      currentData = data;
      renderResult(ticker, data);
      updateWatchlistStar(ticker);
      return;
    }

    if (res.status === 202) {
      setLoadingStatus(`No fresh data cached -- asking the AI engine to read the news on ${ticker}...`);
      await pollForResult(ticker);
      return;
    }

    const errData = await res.json().catch(() => ({}));
    setStatus(errData.error || `Could not fetch sentiment for ${ticker}`, true);
  } catch (err) {
    if (err.message !== 'Session expired') {
      setStatus('Something went wrong. Please try again.', true);
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
      return; // session expired, already redirected
    }

    if (res.status === 200) {
      const data = await res.json();
      setStatus(`Fresh sentiment fetched just now for ${ticker}`);
      currentTicker = ticker;
      currentData = data;
      renderResult(ticker, data);
      updateWatchlistStar(ticker);
      return;
    }

    if (res.status === 502) {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || `AI engine could not analyze ${ticker}`, true);
      return;
    }

    setLoadingStatus(`Reading recent headlines and scoring sentiment with FinBERT... (${attempt + 1})`);
  }

  setStatus('This is taking longer than expected. Please try again in a moment.', true);
}

function renderResult(ticker, data) {
  document.getElementById('result-ticker').textContent = ticker;
  document.getElementById('result-meta').textContent =
    `${data.headlineCount ?? data.headlines?.length ?? 0} headlines · source: ${data.source || 'live'}`;

  const score = Math.max(-1, Math.min(1, data.overallScore ?? 0));
  const angle = score * 90;
  document.getElementById('gauge-needle').setAttribute('transform', `rotate(${angle} 110 110)`);

  const label = data.overallLabel || 'neutral';
  document.getElementById('gauge-label').textContent = label;
  document.getElementById('gauge-label').style.color =
    label === 'positive' ? 'var(--bullish)' : label === 'negative' ? 'var(--bearish)' : 'var(--neutral)';
  document.getElementById('gauge-score').textContent = `score: ${score.toFixed(2)}`;

  setBar('positive', data.positive);
  setBar('negative', data.negative);
  setBar('neutral', data.neutral);

  const list = document.getElementById('headline-list');
  list.innerHTML = '';
  (data.headlines || []).forEach(h => {
    const row = document.createElement('div');
    row.className = `headline-row label-${h.label}`;
    row.innerHTML = `
      <span class="headline-text">${escapeHtml(h.headline)}</span>
      <span class="headline-score">${h.label} · ${(h.score * 100).toFixed(0)}%</span>
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
   Watchlist Persistence and View Logic
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

  // Load cached values or trigger fetch in list
  for (const ticker of list) {
    const row = document.createElement('tr');
    row.id = `wl-row-${ticker}`;
    row.innerHTML = `
      <td><span class="wl-ticker">${ticker}</span></td>
      <td class="wl-label-cell"><span class="wl-label neutral">Loading...</span></td>
      <td>
        <div class="wl-bar-track">
          <div class="wl-bar-fill fill-neutral" style="width: 50%"></div>
        </div>
      </td>
      <td><span class="wl-time">-</span></td>
      <td style="text-align: right;">
        <button class="btn btn-ghost wl-btn-analyze" data-ticker="${ticker}">Analyze</button>
        <button class="btn btn-ghost wl-btn-remove" data-ticker="${ticker}" style="color: var(--bearish);">Remove</button>
      </td>
    `;
    tbody.appendChild(row);

    // Fetch and populate (async)
    fetchWatchlistTicker(ticker);
  }
}

// Delegated events for Watchlist actions
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
      // Not cached, show fallback
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
    labelCell.innerHTML = `<span class="wl-label neutral" style="background: transparent; border: 1px dashed var(--border);">No Cache</span>`;
    barFill.className = 'wl-bar-fill fill-neutral';
    barFill.style.width = '0%';
    timeSpan.textContent = 'Click Analyze';
    return;
  }

  const label = data.overallLabel || 'neutral';
  labelCell.innerHTML = `<span class="wl-label ${label}">${label}</span>`;

  barFill.className = `wl-bar-fill fill-${label}`;
  const score = data.overallScore ?? 0; // -1 to 1
  const pct = ((score + 1) / 2) * 100; // translate -1..1 to 0..100%
  barFill.style.width = `${pct}%`;

  timeSpan.textContent = formatTime(data.lastUpdated);
}

/* ==========================================================================
   Ticker Comparison View Logic
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
    setCompareStatus('Please specify both stock tickers to compare.', true);
    return;
  }

  if (t1 === t2) {
    setCompareStatus('Cannot compare the same stock ticker.', true);
    return;
  }

  compareBtn.disabled = true;
  compareResults.classList.add('hidden');
  setCompareLoading(`Preparing comparison between ${t1} and ${t2}...`);

  try {
    const data1 = await fetchOrPollCompare(t1);
    const data2 = await fetchOrPollCompare(t2);

    renderCompareResults(t1, data1, t2, data2);
    setCompareStatus(`Showing side-by-side comparison for ${t1} vs ${t2}`);
  } catch (err) {
    setCompareStatus(err.message || 'Failed to complete comparison.', true);
  } finally {
    compareBtn.disabled = false;
  }
}

async function fetchOrPollCompare(ticker) {
  // Try normal cache first
  const res = await authedFetch(`/api/stocks/sentiment/${ticker}`);
  if (res.status === 200) {
    return await res.json();
  }

  if (res.status === 202) {
    // Poll for result
    for (let attempt = 0; attempt < MAX_POLLS; attempt++) {
      await sleep(POLL_INTERVAL_MS);
      const statusRes = await authedFetch(`/api/stocks/sentiment/${ticker}/status`);

      if (statusRes.status === 200) {
        return await statusRes.json();
      }
      if (statusRes.status === 502) {
        throw new Error(`AI engine analysis failed for ticker ${ticker}`);
      }
      setCompareLoading(`AI engine is scraping & analyzing ${ticker}... (attempt ${attempt + 1})`);
    }
    throw new Error(`Timeout waiting for AI response for ${ticker}`);
  }

  throw new Error(`Could not connect to service for ticker ${ticker}`);
}

function renderCompareResults(t1, d1, t2, d2) {
  // Render Ticker 1
  document.getElementById('comp-t1-name').textContent = t1;
  const score1 = Math.max(-1, Math.min(1, d1.overallScore ?? 0));
  const angle1 = score1 * 90;
  document.getElementById('comp-needle-1').setAttribute('transform', `rotate(${angle1} 110 110)`);
  const label1 = d1.overallLabel || 'neutral';
  document.getElementById('comp-label-1').textContent = label1;
  document.getElementById('comp-label-1').className = `gauge-readout comp-readout wl-label ${label1}`;
  document.getElementById('comp-score-1').textContent = `score: ${score1.toFixed(2)}`;

  setCompareBar(1, 'pos', d1.positive);
  setCompareBar(1, 'neg', d1.negative);
  setCompareBar(1, 'neu', d1.neutral);

  // Render Ticker 2
  document.getElementById('comp-t2-name').textContent = t2;
  const score2 = Math.max(-1, Math.min(1, d2.overallScore ?? 0));
  const angle2 = score2 * 90;
  document.getElementById('comp-needle-2').setAttribute('transform', `rotate(${angle2} 110 110)`);
  const label2 = d2.overallLabel || 'neutral';
  document.getElementById('comp-label-2').textContent = label2;
  document.getElementById('comp-label-2').className = `gauge-readout comp-readout wl-label ${label2}`;
  document.getElementById('comp-score-2').textContent = `score: ${score2.toFixed(2)}`;

  setCompareBar(2, 'pos', d2.positive);
  setCompareBar(2, 'neg', d2.negative);
  setCompareBar(2, 'neu', d2.neutral);

  compareResults.classList.remove('hidden');
}

function setCompareBar(tickerNum, kind, value) {
  const v = value ?? 0;
  document.getElementById(`comp-bar-${kind}-${tickerNum}`).style.width = `${v}%`;
  document.getElementById(`comp-val-${kind}-${tickerNum}`).textContent = `${v.toFixed(0)}%`;
}

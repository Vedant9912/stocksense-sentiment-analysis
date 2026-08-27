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

const tickerInput = document.getElementById('ticker-input');
const searchBtn = document.getElementById('search-btn');
const statusLine = document.getElementById('status-line');
const resultSection = document.getElementById('result-section');

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
      renderResult(ticker, data);
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
      renderResult(ticker, data);
      return;
    }

    if (res.status === 502) {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || `AI engine could not analyze ${ticker}`, true);
      return;
    }

    // still 202 / in progress
    setLoadingStatus(`Reading recent headlines and scoring sentiment with FinBERT... (${attempt + 1})`);
  }

  setStatus('This is taking longer than expected. Please try again in a moment.', true);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatTime(iso) {
  if (!iso) return 'just now';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

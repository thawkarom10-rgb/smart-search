/* ═══════════════════════════════════════════════════════════════
   Smart Search v2 — app.js
   ═══════════════════════════════════════════════════════════════ */

'use strict';

const API_BASE = (typeof window !== 'undefined' && window.location && window.location.protocol.startsWith('http'))
  ? window.location.origin
  : 'http://localhost:3000';

/* ── UTILITY FUNCTIONS ────────────────────────────────────────── */

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightTerms(rawText, query) {
  if (!rawText) return '';
  const escaped = escapeHtml(rawText);
  if (!query || typeof query !== 'string') return escaped;

  const words = query
    .trim()
    .split(/\s+/)
    .map(w => w.replace(/[^\w]/g, ''))
    .filter(w => w.length >= 2);

  if (words.length === 0) return escaped;

  try {
    const pattern = new RegExp('(' + words.map(w => w.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|') + ')', 'gi');
    return escaped.replace(pattern, '<mark class="query-highlight">$1</mark>');
  } catch (_) {
    return escaped;
  }
}

function relativeTime(isoString) {
  if (!isoString) return '';
  const now = Date.now();
  const then = new Date(isoString).getTime();
  if (isNaN(then)) return '';
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr  = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  if (diffSec < 60)  return 'just now';
  if (diffMin < 60)  return diffMin + 'm ago';
  if (diffHr  < 24)  return diffHr  + 'h ago';
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7)   return diffDay + ' days ago';
  return formatDate(isoString);
}

function formatDate(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function groupByDate(historyItems) {
  const groups = { today: [], yesterday: [], lastWeek: [], older: [] };
  const now = new Date();
  const startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday - 86400000);
  const startOfLastWeek  = new Date(startOfToday - 7 * 86400000);

  for (const item of historyItems) {
    const d = new Date(item.timestamp || 0);
    if (d >= startOfToday)     groups.today.push(item);
    else if (d >= startOfYesterday) groups.yesterday.push(item);
    else if (d >= startOfLastWeek)  groups.lastWeek.push(item);
    else                            groups.older.push(item);
  }
  return groups;
}

function animateBar(el, targetPct, duration) {
  if (!el) return;
  const start = performance.now();
  function step(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.style.width = (eased * targetPct) + '%';
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function getTrustClass(trustLabel) {
  if (!trustLabel) return 'low';
  const l = trustLabel.toLowerCase();
  if (l === 'high')   return 'high';
  if (l === 'medium') return 'medium';
  return 'low';
}

function getTrustClassFromScore(score) {
  const n = Number(score) || 0;
  if (n >= 70) return 'high';
  if (n >= 40) return 'medium';
  return 'low';
}

function showElement(el) {
  if (el) el.classList.remove('hidden');
}

function hideElement(el) {
  if (el) el.classList.add('hidden');
}

/* ── MAIN ─────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {

  /* ── DOM REFERENCES ─────────────────────────────────────────── */

  const $searchInput          = document.getElementById('search-input');
  const $searchBtn            = document.getElementById('search-btn');
  const $autocompleteDropdown = document.getElementById('autocomplete-dropdown');
  const $resultsSection       = document.getElementById('results-section');
  const $resultsContainer     = document.getElementById('results-container');
  const $resultsCountHeading  = document.getElementById('results-count-heading');
  const $verifiedPanel        = document.getElementById('verified-panel');
  const $confidenceBarFill    = document.getElementById('confidence-bar-fill');
  const $confidenceBarLabel   = document.getElementById('confidence-bar-label');
  const $verifiedConfLabel    = document.getElementById('verified-confidence-label');
  const $verifiedContent      = document.getElementById('verified-content');
  const $conflictBanner       = document.getElementById('conflict-banner');
  const $conflictBannerDetail = document.getElementById('conflict-banner-detail');
  const $spinner              = document.getElementById('spinner');
  const $errorMsg             = document.getElementById('error-msg');
  const $historyToggleBtn     = document.getElementById('history-toggle-btn');
  const $historySidebar       = document.getElementById('history-sidebar');
  const $closeSidebarBtn      = document.getElementById('close-sidebar-btn');
  const $historyListContainer = document.getElementById('history-list-container');
  const $clearHistoryBtn      = document.getElementById('clear-history-btn');
  const $historyFilterInput   = document.getElementById('history-filter-input');
  const $historyEmptyMsg      = document.getElementById('history-empty-msg');
  const $statsBtn             = document.getElementById('stats-btn');
  const $statsModal           = document.getElementById('stats-modal');
  const $closeStatsBtn        = document.getElementById('close-stats-btn');
  const $statsContent         = document.getElementById('stats-content');
  const $themeToggleBtn       = document.getElementById('theme-toggle-btn');
  const $themeIconDark        = document.getElementById('theme-icon-dark');
  const $themeIconLight       = document.getElementById('theme-icon-light');
  const $demoBanner           = document.getElementById('demo-banner');
  const $seedBtn              = document.getElementById('seed-btn');
  const $resultsHeader        = document.querySelector('.results-header');
  const $chips                = document.querySelectorAll('.chip');
  const $providersList        = document.getElementById('providers-list');
  const $categoryTabs         = document.getElementById('category-tabs');
  const $verifiedSourceBadge  = document.getElementById('verified-source-badge');
  const $verifiedSourceFooter = document.getElementById('verified-source-footer');
  const $sourcesSummaryBar    = document.getElementById('sources-summary-bar');
  const $searchClearBtn       = document.getElementById('search-clear-btn');
  const $searchKbdHint        = document.getElementById('search-kbd-hint');
  const $copyAnswerBtn        = document.getElementById('copy-answer-btn');
  const $resultsSortSelect    = document.getElementById('results-sort-select');
  const $exportResultsBtn     = document.getElementById('export-results-btn');
  const $officialPortalCard   = document.getElementById('official-portal-card');
  const $portalBadgeText      = document.getElementById('portal-badge-text');
  const $portalDomainChip     = document.getElementById('portal-domain-chip');
  const $portalTitle          = document.getElementById('portal-title');
  const $portalDesc           = document.getElementById('portal-desc');
  const $portalPrimaryLink    = document.getElementById('portal-primary-link');
  const $portalSublinks       = document.getElementById('portal-sublinks');
  const $verifiedKeyPoints    = document.getElementById('verified-key-points');
  const $keyPointsList        = document.getElementById('key-points-list');

  /* ── SIDEBAR OVERLAY (create once) ─────────────────────────── */

  let $sidebarOverlay = document.querySelector('.sidebar-overlay');
  if (!$sidebarOverlay) {
    $sidebarOverlay = document.createElement('div');
    $sidebarOverlay.className = 'sidebar-overlay';
    document.body.appendChild($sidebarOverlay);
  }

  /* ── STATE ──────────────────────────────────────────────────── */

  let lastQuery          = '';
  let autocompleteIndex  = -1;
  let sidebarOpen        = false;
  let autocompleteItems  = [];
  let latestSearchToken  = 0;
  let latestSuggestionToken = 0;
  let currentCategory    = 'all';
  let currentSourceFilter = 'all';
  let currentSort        = 'composite';
  let allLoadedResults   = [];
  let currentResultData  = null;

  function getProviderBadgeClass(sourceName) {
    if (!sourceName) return 'badge-demo';
    const s = String(sourceName).toLowerCase();
    if (s.includes('official') || s.includes('government') || s.includes('authority')) return 'badge-official';
    if (s.includes('wikipedia')) return 'badge-wikipedia';
    if (s.includes('duckduckgo')) return 'badge-duckduckgo';
    if (s.includes('hacker news')) return 'badge-hackernews';
    if (s.includes('crossref')) return 'badge-crossref';
    if (s.includes('stack overflow') || s.includes('stackoverflow')) return 'badge-stackoverflow';
    if (s.includes('arxiv')) return 'badge-arxiv';
    if (s.includes('wikinews')) return 'badge-wikinews';
    if (s.includes('google')) return 'badge-google';
    if (s.includes('brave')) return 'badge-brave';
    if (s.includes('tavily')) return 'badge-tavily';
    return 'badge-demo';
  }

  /* ── ERROR HELPERS ──────────────────────────────────────────── */

  function showError(message, retryFn) {
    $errorMsg.innerHTML = '';

    const p = document.createElement('p');
    p.textContent = message;
    $errorMsg.appendChild(p);

    if (typeof retryFn === 'function') {
      const btn = document.createElement('button');
      btn.className = 'retry-btn';
      btn.textContent = 'Retry';
      btn.addEventListener('click', retryFn);
      $errorMsg.appendChild(btn);
    }

    showElement($errorMsg);
  }

  function hideError() {
    hideElement($errorMsg);
    $errorMsg.innerHTML = '';
  }

  /* ── THEME ──────────────────────────────────────────────────── */

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('smartsearch_theme', theme);
    if (theme === 'dark') {
      showElement($themeIconDark);
      hideElement($themeIconLight);
    } else {
      hideElement($themeIconDark);
      showElement($themeIconLight);
    }
  }

  (function initTheme() {
    const saved = localStorage.getItem('smartsearch_theme') || 'dark';
    applyTheme(saved);
  })();

  $themeToggleBtn.addEventListener('click', function () {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  /* ── HEALTH CHECK ───────────────────────────────────────────── */

  (async function checkHealth() {
    try {
      const res = await fetch(API_BASE + '/api/health');
      if (!res.ok) return;
      const data = await res.json();
      if (data.demoMode) {
        showElement($demoBanner);
      } else {
        hideElement($demoBanner);
      }
      if ($providersList && Array.isArray(data.activeProviders) && data.activeProviders.length > 0) {
        $providersList.innerHTML = '';
        data.activeProviders.forEach(function (name) {
          const pill = document.createElement('span');
          pill.className = 'provider-pill';
          pill.textContent = name;
          $providersList.appendChild(pill);
        });
      }
    } catch (e) {
      showError(
        'Cannot connect to Smart Search server. Make sure it is running (node server.js).',
        checkHealth
      );
    }
  })();

  /* ── SEARCH ─────────────────────────────────────────────────── */

  async function performSearch(rawQuery) {
    const query = (rawQuery || '').trim();
    const searchToken = ++latestSearchToken;

    if (query.length < 2) {
      showError('Please enter at least 2 characters to search.');
      return;
    }

    hideError();
    hideAutocomplete();
    lastQuery = query;
    $searchInput.value = query;
    updateSearchInputState();

    showElement($spinner);
    hideElement($resultsSection);
    $searchBtn.disabled = true;

    try {
      const res = await fetch(API_BASE + '/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query })
      });

      if (res.status === 429) {
        throw new Error('__429__');
      }
      if (res.status >= 500) {
        throw new Error('__5xx__');
      }
      if (!res.ok) {
        let errMsg = 'Search failed.';
        try {
          const errData = await res.json();
          errMsg = errData.error || errMsg;
        } catch (_) { /* ignore */ }
        throw new Error(errMsg);
      }

      const data = await res.json();

      if (searchToken !== latestSearchToken) {
        return;
      }

      currentResultData = data;
      allLoadedResults = (data.results || []).slice().sort(function (a, b) {
        const aScore = typeof a.compositeScore === 'number' ? a.compositeScore : (a.trustScore || 0);
        const bScore = typeof b.compositeScore === 'number' ? b.compositeScore : (b.trustScore || 0);
        return bScore - aScore;
      });
      currentCategory = 'all';
      currentSourceFilter = 'all';

      if ($categoryTabs) {
        $categoryTabs.querySelectorAll('.cat-tab').forEach(function (tab) {
          const isAll = tab.getAttribute('data-category') === 'all';
          tab.classList.toggle('active', isAll);
          tab.setAttribute('aria-selected', isAll ? 'true' : 'false');
        });
      }

      renderFilteredResults();
      showElement($resultsSection);
      renderVerifiedPanel(query, searchToken);

      // Refresh sidebar if open
      if (sidebarOpen) loadHistory();

      // Smooth scroll to results
      setTimeout(function () {
        if (searchToken !== latestSearchToken) return;
        if ($resultsSection) {
          $resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);

    } catch (err) {
      if (searchToken !== latestSearchToken) {
        return;
      }
      if (err.message === '__429__') {
        showError('Too many requests. Please wait a moment and try again.', function () { performSearch(query); });
      } else if (err.message === '__5xx__') {
        showError('Server error. Please try again.', function () { performSearch(query); });
      } else if (err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
        showError('Cannot connect to Smart Search server. Make sure it is running (node server.js).', function () { performSearch(query); });
      } else {
        showError(err.message || 'Search failed. Please try again.', function () { performSearch(query); });
      }
    } finally {
      if (searchToken === latestSearchToken) {
        hideElement($spinner);
        $searchBtn.disabled = false;
      }
    }
  }

  $searchBtn.addEventListener('click', function () {
    performSearch($searchInput.value);
  });

  $searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const activeItem = $autocompleteDropdown.querySelector('.active');
      if (activeItem) {
        const text = activeItem.querySelector('.autocomplete-item-text');
        if (text) {
          $searchInput.value = text.textContent;
          hideAutocomplete();
          performSearch($searchInput.value);
          return;
        }
      }
      performSearch($searchInput.value);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveAutocompleteSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveAutocompleteSelection(-1);
    } else if (e.key === 'Escape') {
      hideAutocomplete();
    }
  });

  /* ── CATEGORY & SOURCE FILTERING & RENDERING ────────────────── */

  function filterResultsByCategory(items, category) {
    if (!category || category === 'all') return items;

    return items.filter(function (r) {
      const cat = (r.category || '').toLowerCase();
      const domain = (r.domain || '').toLowerCase();
      const src = (r.sourceName || '').toLowerCase();

      if (category === 'web') {
        return cat === 'web' || src.includes('duckduckgo') || src.includes('google') || src.includes('brave') || (!domain.includes('wikipedia') && !domain.includes('arxiv') && !domain.includes('crossref') && !domain.includes('stackoverflow'));
      }
      if (category === 'encyclopedia') {
        return cat === 'encyclopedia' || domain.includes('wikipedia') || src.includes('wikipedia');
      }
      if (category === 'academic') {
        return cat === 'academic' || domain.includes('arxiv') || domain.includes('crossref') || domain.includes('doi');
      }
      if (category === 'tech') {
        return cat === 'tech' || domain.includes('stackoverflow') || domain.includes('github') || domain.includes('ycombinator');
      }
      if (category === 'news') {
        return cat === 'news' || domain.includes('news') || domain.includes('bbc') || domain.includes('reuters');
      }
      return true;
    });
  }

  function renderSourcesSummaryBar() {
    if (!$sourcesSummaryBar) return;
    $sourcesSummaryBar.innerHTML = '';

    const sourceCounts = {};
    allLoadedResults.forEach(function (r) {
      const name = r.sourceName || (r.domain ? r.domain : 'Web');
      sourceCounts[name] = (sourceCounts[name] || 0) + 1;
    });

    const sourceNames = Object.keys(sourceCounts);
    if (sourceNames.length === 0) return;

    const label = document.createElement('span');
    label.className = 'sources-summary-label';
    label.textContent = 'Filter by Source:';
    $sourcesSummaryBar.appendChild(label);

    const allBtn = document.createElement('button');
    allBtn.className = 'source-pill-btn' + (currentSourceFilter === 'all' ? ' active' : '');
    allBtn.textContent = 'All (' + allLoadedResults.length + ')';
    allBtn.addEventListener('click', function () {
      currentSourceFilter = 'all';
      renderFilteredResults();
    });
    $sourcesSummaryBar.appendChild(allBtn);

    sourceNames.forEach(function (name) {
      const btn = document.createElement('button');
      btn.className = 'source-pill-btn' + (currentSourceFilter === name ? ' active' : '');
      const badgeClass = getProviderBadgeClass(name);
      btn.innerHTML = '<span class="result-source-badge ' + badgeClass + '" style="padding:1px 6px;font-size:10px;">' + escapeHtml(name) + '</span> ' + sourceCounts[name];
      btn.addEventListener('click', function () {
        currentSourceFilter = (currentSourceFilter === name ? 'all' : name);
        renderFilteredResults();
      });
      $sourcesSummaryBar.appendChild(btn);
    });
  }

  function renderFilteredResults() {
    $resultsContainer.innerHTML = '';
    let filtered = filterResultsByCategory(allLoadedResults, currentCategory);
    if (currentSourceFilter !== 'all') {
      filtered = filtered.filter(function (r) {
        const sName = r.sourceName || (r.domain ? r.domain : 'Web');
        return sName.toLowerCase() === currentSourceFilter.toLowerCase();
      });
    }

    // Apply sorting
    if (currentSort === 'trust') {
      filtered.sort(function (a, b) { return (b.trustScore || 0) - (a.trustScore || 0); });
    } else if (currentSort === 'relevance') {
      filtered.sort(function (a, b) { return (b.relevanceScore || 0) - (a.relevanceScore || 0); });
    } else if (currentSort === 'title') {
      filtered.sort(function (a, b) { return (a.title || '').localeCompare(b.title || ''); });
    } else {
      // Default: composite score (relevance + trust)
      filtered.sort(function (a, b) {
        const aScore = typeof a.compositeScore === 'number' ? a.compositeScore : (a.trustScore || 0);
        const bScore = typeof b.compositeScore === 'number' ? b.compositeScore : (b.trustScore || 0);
        return bScore - aScore;
      });
    }

    const total = filtered.length;
    const query = (currentResultData && currentResultData.query) || lastQuery;
    const sources = (currentResultData && currentResultData.sources) || [];

    let countText = total + ' result' + (total !== 1 ? 's' : '') + " for '" + query + "'";
    if (sources.length > 0) {
      countText += ' • ' + sources.length + ' sources searched';
    }
    $resultsCountHeading.textContent = countText;

    renderSourcesSummaryBar();

    if (filtered.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'empty-category-msg';
      emptyCard.textContent = 'No results for current filter. Select "All Sources" or "All" above to see all results.';
      $resultsContainer.appendChild(emptyCard);
      return;
    }

    filtered.forEach(function (result, index) {
      const card = buildResultCard(result, index);
      $resultsContainer.appendChild(card);
    });
  }

  if ($categoryTabs) {
    $categoryTabs.addEventListener('click', function (e) {
      const tab = e.target.closest('.cat-tab');
      if (!tab) return;
      $categoryTabs.querySelectorAll('.cat-tab').forEach(function (t) {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      currentCategory = tab.getAttribute('data-category') || 'all';
      renderFilteredResults();
    });
  }

  function renderResults(data) {
    currentResultData = data;
    allLoadedResults = (data.results || []).slice().sort(function (a, b) {
      const aScore = typeof a.compositeScore === 'number' ? a.compositeScore : (a.trustScore || 0);
      const bScore = typeof b.compositeScore === 'number' ? b.compositeScore : (b.trustScore || 0);
      return bScore - aScore;
    });

    // Conflict banner
    const hasConflict = allLoadedResults.some(function (r) { return r.conflict; });
    if (hasConflict) {
      const conflictCount = allLoadedResults.filter(function (r) { return r.conflict; }).length;
      $conflictBannerDetail.textContent =
        conflictCount + ' result' + (conflictCount !== 1 ? 's contain' : ' contains') +
        ' contradictory claims. Review carefully.';
      showElement($conflictBanner);
    } else {
      hideElement($conflictBanner);
    }

    renderFilteredResults();
  }

  function buildResultCard(result, index) {
    const trustClass = getTrustClass(result.trustLabel);
    const domain     = result.domain || '';
    const url        = result.url    || '#';

    /* ── card shell ── */
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = (index * 50) + 'ms';

    /* ── header ── */
    const header = document.createElement('div');
    header.className = 'result-card-header';

    // Favicon
    const favicon = document.createElement('img');
    favicon.className = 'result-favicon';
    favicon.alt = '';
    favicon.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=32';
    favicon.addEventListener('error', function () { this.style.display = 'none'; });

    // Title link
    const titleLink = document.createElement('a');
    titleLink.className = 'result-title-link';
    titleLink.href = url;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    titleLink.innerHTML = highlightTerms(result.title || url, lastQuery);
    titleLink.addEventListener('click', function (e) { e.stopPropagation(); });

    // Domain
    const domainSpan = document.createElement('span');
    domainSpan.className = 'result-domain';
    domainSpan.textContent = domain;

    // Source Name Pill (API Badge)
    const sourceName = result.sourceName || (domain ? domain : 'Web');
    const srcBadge = document.createElement('span');
    const badgeClass = getProviderBadgeClass(sourceName);
    srcBadge.className = 'result-source-badge ' + badgeClass;
    srcBadge.textContent = sourceName;
    srcBadge.title = 'Provided by ' + sourceName;

    if (result.isOfficial) {
      card.style.borderColor = 'rgba(34, 197, 94, 0.45)';
      card.style.background = 'color-mix(in srgb, var(--surface) 96%, rgba(34, 197, 94, 0.08))';
      srcBadge.className = 'result-source-badge badge-official';
      srcBadge.textContent = '🏛 Official Portal';
    }

    // Trust badge & score wrapper
    const scoreWrapper = document.createElement('div');
    scoreWrapper.className = 'trust-score-wrapper';
    scoreWrapper.setAttribute('tabindex', '0');
    scoreWrapper.setAttribute('role', 'button');
    scoreWrapper.setAttribute('aria-label', 'Trust score breakdown');
    scoreWrapper.addEventListener('click', function (e) { e.stopPropagation(); });

    const badge = document.createElement('span');
    badge.className = 'trust-badge ' + trustClass;
    badge.textContent = result.trustLabel || 'Low';

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'result-score';
    scoreSpan.textContent = (result.trustScore || 0) + '/100';

    scoreWrapper.appendChild(badge);
    scoreWrapper.appendChild(scoreSpan);

    const breakdown = result.trustBreakdown || {
      domainScore: 15,
      citationScore: 10,
      contentLengthScore: 15,
      recencyScore: 10
    };

    const popover = document.createElement('div');
    popover.className = 'trust-breakdown-popover';
    popover.innerHTML =
      '<div class="breakdown-title">Trust Score Breakdown</div>' +
      '<div class="breakdown-row"><span class="breakdown-label">Domain Authority:</span><span class="breakdown-val">' + (breakdown.domainScore || 0) + '/25</span></div>' +
      '<div class="breakdown-row"><span class="breakdown-label">Citations & Depth:</span><span class="breakdown-val">' + (breakdown.citationScore || 0) + '/25</span></div>' +
      '<div class="breakdown-row"><span class="breakdown-label">Content Length:</span><span class="breakdown-val">' + (breakdown.contentLengthScore || 0) + '/25</span></div>' +
      '<div class="breakdown-row"><span class="breakdown-label">Recency Freshness:</span><span class="breakdown-val">' + (breakdown.recencyScore || 0) + '/25</span></div>';
    scoreWrapper.appendChild(popover);

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'result-copy-btn';
    copyBtn.type = 'button';
    copyBtn.title = 'Copy link and snippet';
    copyBtn.setAttribute('aria-label', 'Copy link and snippet');
    copyBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
      '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
      '</svg>';

    const copyFeedback = document.createElement('span');
    copyFeedback.className = 'copy-feedback';
    copyFeedback.textContent = 'Copied!';
    copyBtn.appendChild(copyFeedback);

    copyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      const text = url + '\n\n' + (result.snippet || '');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          showCopyFeedback(copyFeedback);
        }).catch(function () {
          fallbackCopy(text, copyFeedback);
        });
      } else {
        fallbackCopy(text, copyFeedback);
      }
    });

    // Expand icon
    const expandIcon = document.createElement('svg');
    expandIcon.className = 'result-expand-icon';
    expandIcon.setAttribute('viewBox', '0 0 24 24');
    expandIcon.setAttribute('fill', 'none');
    expandIcon.setAttribute('stroke', 'currentColor');
    expandIcon.setAttribute('stroke-width', '2');
    expandIcon.setAttribute('stroke-linecap', 'round');
    expandIcon.setAttribute('stroke-linejoin', 'round');
    expandIcon.setAttribute('aria-hidden', 'true');
    expandIcon.innerHTML = '<polyline points="6 9 12 15 18 9"/>';

    header.appendChild(favicon);
    header.appendChild(titleLink);
    header.appendChild(domainSpan);
    header.appendChild(srcBadge);
    header.appendChild(scoreWrapper);
    header.appendChild(copyBtn);
    header.appendChild(expandIcon);

    /* ── body ── */
    const body = document.createElement('div');
    body.className = 'result-body';

    const snippet = document.createElement('p');
    snippet.className = 'result-snippet';
    snippet.innerHTML = highlightTerms(result.snippet || '', lastQuery);

    const footer = document.createElement('div');
    footer.className = 'result-footer';

    const openLink = document.createElement('a');
    openLink.className = 'result-link';
    openLink.href = url;
    openLink.target = '_blank';
    openLink.rel = 'noopener noreferrer';
    openLink.textContent = 'Open source \u2197';

    footer.appendChild(openLink);

    if (result.conflict) {
      const conflictTag = document.createElement('span');
      conflictTag.className = 'conflict-tag';
      conflictTag.textContent = '\u26A1 Conflicting';
      footer.appendChild(conflictTag);
    }

    body.appendChild(snippet);
    body.appendChild(footer);

    if (result.conflict && result.conflictReason) {
      const reason = document.createElement('p');
      reason.style.fontSize = '12px';
      reason.style.color = '#f59e0b';
      reason.style.marginTop = '6px';
      reason.style.lineHeight = '1.5';
      reason.textContent = result.conflictReason;
      body.appendChild(reason);
    }

    /* ── toggle expand ── */
    header.addEventListener('click', function () {
      card.classList.toggle('open');
    });

    card.appendChild(header);
    card.appendChild(body);

    return card;
  }

  function showCopyFeedback(el) {
    el.classList.add('visible');
    setTimeout(function () { el.classList.remove('visible'); }, 2000);
  }

  function fallbackCopy(text, feedbackEl) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showCopyFeedback(feedbackEl);
    } catch (_) { /* silent */ }
  }

  /* ── VERIFIED PANEL ─────────────────────────────────────────── */

  async function renderVerifiedPanel(query, searchToken) {
    try {
      const res = await fetch(API_BASE + '/api/verified?' + new URLSearchParams({ q: query }));
      if (!res.ok) return;
      const data = await res.json();

      if (searchToken !== latestSearchToken) {
        return;
      }

      if (!data.found) {
        hideElement($verifiedPanel);
        return;
      }

      const trustClass = getTrustClass(data.trustLabel || data.confidence || '');
      const score      = typeof data.trustScore === 'number' ? data.trustScore : 0;

      // Content
      $verifiedContent.textContent = data.answer || '';

      // Official Portal Spotlight Card
      if ($officialPortalCard) {
        if (data.officialPortal && data.officialPortal.url) {
          const portal = data.officialPortal;
          if ($portalBadgeText) $portalBadgeText.textContent = portal.badge || 'Official Government Portal';
          if ($portalDomainChip) $portalDomainChip.textContent = portal.domain || '';
          if ($portalTitle) $portalTitle.textContent = portal.title || portal.name || 'Official Portal';
          if ($portalDesc) $portalDesc.textContent = portal.description || '';
          if ($portalPrimaryLink) {
            $portalPrimaryLink.href = portal.url;
            const btnSpan = $portalPrimaryLink.querySelector('span');
            if (btnSpan) btnSpan.textContent = 'Open ' + (portal.name || portal.domain || 'Official Portal');
          }

          // Sublinks / related official links
          if ($portalSublinks) {
            $portalSublinks.innerHTML = '';
            const links = data.relatedLinks || [];
            if (links.length > 0) {
              links.forEach(function (link) {
                const a = document.createElement('a');
                a.className = 'portal-sublink-btn';
                a.href = link.url;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                a.textContent = link.title + ' ↗';
                $portalSublinks.appendChild(a);
              });
              showElement($portalSublinks);
            } else {
              hideElement($portalSublinks);
            }
          }

          showElement($officialPortalCard);
        } else {
          hideElement($officialPortalCard);
        }
      }

      // Key points & steps
      if ($verifiedKeyPoints && $keyPointsList) {
        $keyPointsList.innerHTML = '';
        if (Array.isArray(data.keyPoints) && data.keyPoints.length > 0) {
          data.keyPoints.forEach(function (pt) {
            const li = document.createElement('li');
            li.className = 'key-point-item';
            li.textContent = pt;
            $keyPointsList.appendChild(li);
          });
          showElement($verifiedKeyPoints);
        } else {
          hideElement($verifiedKeyPoints);
        }
      }

      // Source attribution badge
      if ($verifiedSourceBadge) {
        const srcName = data.sourceName || (data.domain ? data.domain : 'Web');
        $verifiedSourceBadge.textContent = 'via ' + srcName;
        $verifiedSourceBadge.className = 'verified-source-badge ' + getProviderBadgeClass(srcName);
        showElement($verifiedSourceBadge);
      }

      // Confidence label
      $verifiedConfLabel.textContent = data.trustLabel || data.confidence || '';
      $verifiedConfLabel.className   = 'confidence-label ' + trustClass;

      // Bar
      $confidenceBarFill.className = 'confidence-bar-fill ' + trustClass;
      $confidenceBarFill.style.width = '0%';
      $confidenceBarFill.setAttribute('aria-valuenow', score);
      $confidenceBarLabel.textContent = score + '% confidence';

      // Source footer with link
      if ($verifiedSourceFooter) {
        $verifiedSourceFooter.innerHTML = '';
        if (data.source || data.title) {
          const prefix = document.createElement('span');
          prefix.textContent = 'Verified from: ';
          const link = document.createElement('a');
          link.href = data.source || '#';
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.textContent = data.title || data.source || 'Original source';
          $verifiedSourceFooter.appendChild(prefix);
          $verifiedSourceFooter.appendChild(link);
          if (data.sourceName) {
            const via = document.createElement('span');
            via.style.color = 'var(--text-muted)';
            via.textContent = ' (via ' + data.sourceName + ')';
            $verifiedSourceFooter.appendChild(via);
          }
          showElement($verifiedSourceFooter);
        } else {
          hideElement($verifiedSourceFooter);
        }
      }

      showElement($verifiedPanel);

      // Animate bar after small delay so transition fires
      setTimeout(function () {
        if (searchToken !== latestSearchToken) return;
        $confidenceBarFill.style.width = score + '%';
      }, 80);

    } catch (_) {
      if (searchToken === latestSearchToken) {
        hideElement($verifiedPanel);
      }
    }
  }

  /* ── AUTOCOMPLETE ───────────────────────────────────────────── */

  const fetchSuggestions = debounce(async function (value) {
    const suggestionToken = ++latestSuggestionToken;
    if (value.length < 2) {
      hideAutocomplete();
      return;
    }
    try {
      const res = await fetch(API_BASE + '/api/suggestions?' + new URLSearchParams({ q: value }));
      if (!res.ok) return;
      const data = await res.json();
      if (suggestionToken !== latestSuggestionToken) {
        return;
      }
      autocompleteItems = data.suggestions || [];
      renderAutocomplete(autocompleteItems);
    } catch (_) {
      if (suggestionToken === latestSuggestionToken) {
        hideAutocomplete();
      }
    }
  }, 200);

  function updateSearchInputState() {
    const val = $searchInput.value;
    if ($searchClearBtn) {
      if (val && val.length > 0) {
        showElement($searchClearBtn);
      } else {
        hideElement($searchClearBtn);
      }
    }
    if ($searchKbdHint) {
      $searchKbdHint.style.opacity = (val && val.length > 0) ? '0' : '1';
    }
  }

  function renderAutocomplete(suggestions, isRecent) {
    $autocompleteDropdown.innerHTML = '';
    autocompleteIndex = -1;

    if (!suggestions || suggestions.length === 0) {
      hideAutocomplete();
      return;
    }

    if (isRecent) {
      const header = document.createElement('li');
      header.className = 'autocomplete-section-title';
      header.textContent = 'Recent Searches';
      header.setAttribute('aria-hidden', 'true');
      $autocompleteDropdown.appendChild(header);
    }

    suggestions.forEach(function (text) {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.setAttribute('role', 'option');

      // Clock icon
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '2');
      icon.setAttribute('stroke-linecap', 'round');
      icon.setAttribute('stroke-linejoin', 'round');
      icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML =
        '<circle cx="12" cy="12" r="10"/>' +
        '<polyline points="12 6 12 12 16 14"/>';

      const span = document.createElement('span');
      span.className = 'autocomplete-item-text';
      span.textContent = text;

      li.appendChild(icon);
      li.appendChild(span);

      li.addEventListener('mousedown', function (e) {
        e.preventDefault(); // prevent blur
        $searchInput.value = text;
        updateSearchInputState();
        hideAutocomplete();
        performSearch(text);
      });

      $autocompleteDropdown.appendChild(li);
    });

    showElement($autocompleteDropdown);
    $searchInput.setAttribute('aria-expanded', 'true');
  }

  function hideAutocomplete() {
    hideElement($autocompleteDropdown);
    $autocompleteDropdown.innerHTML = '';
    autocompleteIndex = -1;
    $searchInput.setAttribute('aria-expanded', 'false');
  }

  function moveAutocompleteSelection(direction) {
    const items = $autocompleteDropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    items.forEach(function (item) { item.classList.remove('active'); });

    autocompleteIndex += direction;
    if (autocompleteIndex < 0)            autocompleteIndex = items.length - 1;
    if (autocompleteIndex >= items.length) autocompleteIndex = 0;

    const active = items[autocompleteIndex];
    if (active) {
      active.classList.add('active');
      const textEl = active.querySelector('.autocomplete-item-text');
      if (textEl) {
        $searchInput.value = textEl.textContent;
        updateSearchInputState();
      }
    }
  }

  $searchInput.addEventListener('input', function () {
    updateSearchInputState();
    fetchSuggestions($searchInput.value);
  });

  $searchInput.addEventListener('focus', function () {
    if (!$searchInput.value.trim()) {
      fetch(API_BASE + '/api/history')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          const hist = (data.history || []).slice(0, 5).map(function (h) { return h.query; });
          if (hist.length > 0 && !$searchInput.value.trim()) {
            renderAutocomplete(hist, true);
          }
        })
        .catch(function () {});
    }
  });

  $searchInput.addEventListener('blur', function () {
    setTimeout(hideAutocomplete, 150);
  });

  if ($searchClearBtn) {
    $searchClearBtn.addEventListener('click', function () {
      $searchInput.value = '';
      updateSearchInputState();
      hideAutocomplete();
      $searchInput.focus();
    });
  }

  // Keyboard shortcut: Press '/' or Ctrl+K / Cmd+K to focus search input
  document.addEventListener('keydown', function (e) {
    if ((e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) &&
        document.activeElement !== $searchInput &&
        document.activeElement.tagName !== 'INPUT' &&
        document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      $searchInput.focus();
      $searchInput.select();
    }
  });

  // Results Sorting Listener
  if ($resultsSortSelect) {
    $resultsSortSelect.addEventListener('change', function () {
      currentSort = $resultsSortSelect.value;
      renderFilteredResults();
    });
  }

  // Export Results to Markdown
  if ($exportResultsBtn) {
    $exportResultsBtn.addEventListener('click', function () {
      if (!allLoadedResults || allLoadedResults.length === 0) return;
      const q = (currentResultData && currentResultData.query) || lastQuery;
      let md = '# Search Results: ' + q + '\n\n';
      md += '*Generated by Smart Search v2 on ' + new Date().toLocaleString() + '*\n\n---\n\n';

      allLoadedResults.forEach(function (r, i) {
        md += '### ' + (i + 1) + '. [' + (r.title || 'Untitled') + '](' + (r.url || '#') + ')\n';
        md += '- **Source:** ' + (r.sourceName || r.domain || 'Web') + '\n';
        md += '- **Trust Score:** ' + (r.trustScore || 0) + '/100 (' + (r.trustLabel || 'N/A') + ')\n';
        if (r.conflict) {
          md += '- **Conflict Alert:** ' + (r.conflictReason || 'Contradictory claims detected') + '\n';
        }
        md += '- **Summary:** ' + (r.snippet || '') + '\n\n';
      });

      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'search-' + q.replace(/[^a-z0-9]/gi, '-').toLowerCase() + '.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Copy Verified Answer Button
  if ($copyAnswerBtn) {
    $copyAnswerBtn.addEventListener('click', function () {
      const text = $verifiedContent.textContent || '';
      if (!text) return;
      const footerText = $verifiedSourceFooter ? $verifiedSourceFooter.textContent : '';
      const fullText = text + (footerText ? '\n\n' + footerText : '');
      const btnSpan = $copyAnswerBtn.querySelector('span');

      function onCopied() {
        if (btnSpan) btnSpan.textContent = 'Copied!';
        setTimeout(function () { if (btnSpan) btnSpan.textContent = 'Copy'; }, 2000);
      }

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(fullText).then(onCopied).catch(function () {
          fallbackCopy(fullText, $copyAnswerBtn);
          onCopied();
        });
      } else {
        fallbackCopy(fullText, $copyAnswerBtn);
        onCopied();
      }
    });
  }

  document.addEventListener('click', function (e) {
    if (!$searchInput.contains(e.target) && !$autocompleteDropdown.contains(e.target)) {
      hideAutocomplete();
    }
  });

  /* ── EXAMPLE CHIPS ──────────────────────────────────────────── */

  $chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      const query = chip.getAttribute('data-query') || '';
      $searchInput.value = query;
      updateSearchInputState();
      performSearch(query);
    });
  });

  /* ── SEED BUTTON ────────────────────────────────────────────── */

  $seedBtn.addEventListener('click', async function () {
    showElement($spinner);
    hideElement($resultsSection);
    hideError();
    $seedBtn.disabled = true;

    try {
      const res = await fetch(API_BASE + '/api/seed', { method: 'POST' });
      if (!res.ok) throw new Error('Seeding failed.');
      $searchInput.value = 'demo results';
      await performSearch('demo results');
    } catch (err) {
      showError(err.message || 'Seeding failed. Make sure the server is running.');
    } finally {
      hideElement($spinner);
      $seedBtn.disabled = false;
    }
  });

  /* ── HISTORY SIDEBAR ────────────────────────────────────────── */

  function openSidebar() {
    $historySidebar.classList.add('open');
    $sidebarOverlay.classList.add('visible');
    sidebarOpen = true;
    loadHistory();

    if (window.innerWidth >= 768) {
      document.querySelector('.main-content').classList.add('sidebar-open-desktop');
    }
  }

  function closeSidebar() {
    $historySidebar.classList.remove('open');
    $sidebarOverlay.classList.remove('visible');
    sidebarOpen = false;

    document.querySelector('.main-content').classList.remove('sidebar-open-desktop');
  }

  $historyToggleBtn.addEventListener('click', function () {
    if (sidebarOpen) closeSidebar();
    else openSidebar();
  });

  $closeSidebarBtn.addEventListener('click', closeSidebar);
  $sidebarOverlay.addEventListener('click', closeSidebar);

  async function loadHistory() {
    try {
      const res = await fetch(API_BASE + '/api/history');
      if (!res.ok) throw new Error('Could not load history.');
      const data = await res.json();
      renderHistory(data.history || []);
    } catch (_) {
      $historyListContainer.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'history-empty';
      p.textContent = 'Could not load history.';
      $historyListContainer.appendChild(p);
    }
  }

  function renderHistory(historyItems) {
    $historyListContainer.innerHTML = '';

    if (!historyItems || historyItems.length === 0) {
      showElement($historyEmptyMsg);
      $historyListContainer.appendChild($historyEmptyMsg);
      return;
    }

    hideElement($historyEmptyMsg);

    const groups = groupByDate(historyItems);
    const groupDefs = [
      { key: 'today',     label: 'Today'     },
      { key: 'yesterday', label: 'Yesterday' },
      { key: 'lastWeek',  label: 'Last Week' },
      { key: 'older',     label: 'Older'     }
    ];

    let hasAny = false;

    groupDefs.forEach(function (def) {
      const items = groups[def.key];
      if (!items || items.length === 0) return;
      hasAny = true;

      const label = document.createElement('div');
      label.className = 'history-group-label';
      label.textContent = def.label;
      $historyListContainer.appendChild(label);

      items.forEach(function (item) {
        $historyListContainer.appendChild(buildHistoryItem(item));
      });
    });

    if (!hasAny) {
      showElement($historyEmptyMsg);
      $historyListContainer.appendChild($historyEmptyMsg);
    }
  }

  function buildHistoryItem(item) {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.setAttribute('data-query', item.query || '');

    // Clock icon
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'history-item-icon');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML =
      '<circle cx="12" cy="12" r="10"/>' +
      '<polyline points="12 6 12 12 16 14"/>';

    // Text
    const text = document.createElement('span');
    text.className = 'history-item-text';
    text.textContent = item.query || '';

    // Time
    const time = document.createElement('span');
    time.className = 'history-item-time';
    time.textContent = relativeTime(item.timestamp);

    // Delete button
    const del = document.createElement('button');
    del.className = 'history-item-del';
    del.type = 'button';
    del.setAttribute('aria-label', 'Delete history item');
    del.textContent = '\u00D7'; // ×

    del.addEventListener('click', async function (e) {
      e.stopPropagation();
      try {
        await fetch(API_BASE + '/api/history/' + item.id, { method: 'DELETE' });
        div.remove();
        // Show empty message if nothing left
        const remaining = $historyListContainer.querySelectorAll('.history-item');
        if (remaining.length === 0) {
          $historyListContainer.innerHTML = '';
          showElement($historyEmptyMsg);
          $historyListContainer.appendChild($historyEmptyMsg);
        }
      } catch (_) { /* silent */ }
    });

    div.appendChild(icon);
    div.appendChild(text);
    div.appendChild(time);
    div.appendChild(del);

    div.addEventListener('click', function () {
      const q = div.getAttribute('data-query');
      if (!q) return;
      $searchInput.value = q;
      closeSidebar();
      performSearch(q);
    });

    return div;
  }

  $historyFilterInput.addEventListener('input', function () {
    const filter = this.value.toLowerCase().trim();
    const items = $historyListContainer.querySelectorAll('.history-item');
    let visibleCount = 0;

    items.forEach(function (item) {
      const query = (item.getAttribute('data-query') || '').toLowerCase();
      if (!filter || query.includes(filter)) {
        item.style.display = '';
        visibleCount++;
      } else {
        item.style.display = 'none';
      }
    });

    // Hide/show group labels based on whether their items are visible
    const labels = $historyListContainer.querySelectorAll('.history-group-label');
    labels.forEach(function (label) {
      let sibling = label.nextElementSibling;
      let hasVisible = false;
      while (sibling && !sibling.classList.contains('history-group-label')) {
        if (sibling.style.display !== 'none') hasVisible = true;
        sibling = sibling.nextElementSibling;
      }
      label.style.display = hasVisible ? '' : 'none';
    });
  });

  $clearHistoryBtn.addEventListener('click', async function () {
    if (!confirm('Clear all search history?')) return;
    try {
      await fetch(API_BASE + '/api/history', { method: 'DELETE' });
      $historyListContainer.innerHTML = '';
      showElement($historyEmptyMsg);
      $historyListContainer.appendChild($historyEmptyMsg);
    } catch (_) { /* silent */ }
  });

  /* ── STATS MODAL ────────────────────────────────────────────── */

  $statsBtn.addEventListener('click', async function () {
    showElement($statsModal);
    $statsContent.innerHTML = '<p class="loading-text">Loading statistics\u2026</p>';
    try {
      const res = await fetch(API_BASE + '/api/stats');
      if (!res.ok) throw new Error('Could not load stats.');
      const data = await res.json();
      renderStats(data);
    } catch (err) {
      $statsContent.innerHTML = '<p class="loading-text">' + escapeHtml(err.message) + '</p>';
    }
  });

  function closeStatsModal() {
    hideElement($statsModal);
  }

  $closeStatsBtn.addEventListener('click', closeStatsModal);

  $statsModal.addEventListener('click', function (e) {
    if (e.target === $statsModal) closeStatsModal();
  });

  function renderStats(data) {
    const totalSearches  = data.totalSearches  || 0;
    const uniqueQueries  = data.uniqueQueries  || 0;
    const topQueries     = data.topQueries     || [];
    const recentActivity = data.recentActivity || [];

    // Calculate average results (if tracked — use total searches as fallback)
    const avgResults = totalSearches > 0 ? Math.round(totalSearches / Math.max(uniqueQueries, 1)) : 0;

    let html = '';

    /* stat grid */
    html +=
      '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-value">' + totalSearches + '</div><div class="stat-label">Total Searches</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + uniqueQueries + '</div><div class="stat-label">Unique Queries</div></div>' +
        '<div class="stat-card"><div class="stat-value">' + avgResults + '</div><div class="stat-label">Avg&nbsp;Searches / Query</div></div>' +
      '</div>';

    /* top queries */
    if (topQueries.length > 0) {
      html += '<div class="top-queries-title">Top Queries</div>';
      topQueries.forEach(function (q, i) {
        html +=
          '<div class="top-query-item" data-query="' + escapeHtml(q.query) + '">' +
            '<div class="top-query-rank">' + (i + 1) + '</div>' +
            '<div class="top-query-text">' + escapeHtml(q.query) + '</div>' +
            '<div class="top-query-count">' + q.count + 'x</div>' +
          '</div>';
      });
    }

    /* activity chart */
    if (recentActivity.length > 0) {
      const maxCount = Math.max.apply(null, recentActivity.map(function (d) { return d.count; })) || 1;
      html += '<div class="activity-bar-chart"><div class="activity-title">Last 7 Days</div><div class="activity-bars">';
      recentActivity.forEach(function (day) {
        const heightPct = Math.round((day.count / maxCount) * 100);
        const label     = day.date ? day.date.slice(5) : ''; // MM-DD
        html +=
          '<div class="activity-bar-col">' +
            '<div class="activity-bar" style="height:' + heightPct + '%" title="' + day.count + ' searches"></div>' +
            '<div class="activity-bar-label">' + escapeHtml(label) + '</div>' +
          '</div>';
      });
      html += '</div></div>';
    }

    $statsContent.innerHTML = html;

    // Wire top query clicks
    $statsContent.querySelectorAll('.top-query-item').forEach(function (item) {
      item.addEventListener('click', function () {
        const q = item.getAttribute('data-query');
        if (!q) return;
        closeStatsModal();
        $searchInput.value = q;
        performSearch(q);
      });
    });
  }

  /* ── KEYBOARD SHORTCUTS ─────────────────────────────────────── */

  document.addEventListener('keydown', function (e) {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    // Escape: close modal > sidebar > autocomplete
    if (e.key === 'Escape') {
      if (!$statsModal.classList.contains('hidden')) {
        closeStatsModal();
        return;
      }
      if (sidebarOpen) {
        closeSidebar();
        return;
      }
      if (!$autocompleteDropdown.classList.contains('hidden')) {
        hideAutocomplete();
        return;
      }
    }

    // '/' key when not in input: focus search
    if (e.key === '/' && !inInput) {
      e.preventDefault();
      $searchInput.focus();
      $searchInput.select();
      return;
    }

    // Ctrl+K: focus search
    if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      $searchInput.focus();
      $searchInput.select();
    }
  });

});

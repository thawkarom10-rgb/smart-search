'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const trustScorer = require('./trustScorer');
const conflictDetector = require('./conflictDetector');
const verifiedAnswer = require('./verifiedAnswer');
const db = require('./db');
const demoData = require('./demoData');
const searchProviders = require('./searchProviders');
const relevanceScorer = require('./relevanceScorer');
const officialServices = require('./officialServices');
const pythonBridge = require('./pythonBridge');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));

// Rate limiter for /api routes
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});

app.use('/api', apiLimiter);

// ─── Search Config & Helpers ──────────────────────────────────────────────────

function getSearchConfig() {
  return {
    googleApiKey: process.env.GOOGLE_API_KEY || '',
    googleCx: process.env.GOOGLE_SEARCH_ENGINE_ID || '',
    braveApiKey: process.env.BRAVE_SEARCH_API_KEY || '',
    serperApiKey: process.env.SERPER_API_KEY || '',
    tavilyApiKey: process.env.TAVILY_API_KEY || ''
  };
}

function isDemoMode() {
  const cfg = getSearchConfig();
  const hasKey = Boolean(
    (cfg.googleApiKey && cfg.googleCx && cfg.googleApiKey !== 'your_google_api_key_here') ||
    (cfg.braveApiKey && cfg.braveApiKey !== 'your_brave_api_key_here') ||
    (cfg.serperApiKey && cfg.serperApiKey !== 'your_serper_api_key_here') ||
    (cfg.tavilyApiKey && cfg.tavilyApiKey !== 'your_tavily_api_key_here')
  );
  // We have 7 built-in live free APIs active by default, so demo mode is false
  return false;
}

/**
 * Run the search pipeline: fetch/filter → score relevance & trust → composite rank → detect conflicts → cache → log.
 * @param {string} query
 * @param {boolean} forceRefresh
 * @returns {Promise<object[]>}
 */
async function runSearchPipeline(query, forceRefresh) {
  const normQuery = query.trim();

  // Check cache first
  if (!forceRefresh) {
    const cached = db.getCachedResults(normQuery);
    if (cached && cached.length > 0) {
      // Verify cached results are relevant to this query
      const relevantCached = cached.filter(r => {
        const rel = typeof r.relevanceScore === 'number'
          ? r.relevanceScore
          : relevanceScorer.scoreRelevance(normQuery, r);
        return rel > 0;
      });

      if (relevantCached.length > 0) {
        relevantCached.source = cached.source || 'cache';
        relevantCached.sources = cached.sources || [];
        return relevantCached;
      }
    }
  }

  let rawResults = [];
  let sources = [];
  let source = 'multi-api';

  try {
    const agg = await searchProviders.aggregateSearch(normQuery, getSearchConfig());
    rawResults = agg.results || [];
    sources = agg.sources || [];
    if (rawResults.length > 0) {
      source = 'live-web';
    }
  } catch (err) {
    console.warn('Search aggregator warning: ' + err.message);
  }

  // Resilient Python fallback: If live APIs returned 0 results, query Python Resilient Search Providers
  if (rawResults.length === 0) {
    try {
      const pySearch = await pythonBridge.runPythonSearch(normQuery);
      if (pySearch && Array.isArray(pySearch.results) && pySearch.results.length > 0) {
        rawResults = pySearch.results;
        sources = pySearch.sources || ['Python Resilience Engine'];
        source = 'python-resilient-web';
      }
    } catch (_) {}
  }

  // Fallback to demo data only if all live and Python APIs returned 0 results
  if (rawResults.length === 0) {
    rawResults = demoData.getDemoResults(normQuery);
    if (rawResults.length > 0) {
      source = 'demo';
      sources = ['Demo Knowledgebase'];
    }
  }

  // ── High Reliability: Process with Python Reliability Engine if available ──
  try {
    const pyEnhanced = await pythonBridge.enhanceResultsWithPython(normQuery, rawResults);
    if (pyEnhanced && Array.isArray(pyEnhanced.results) && pyEnhanced.results.length > 0) {
      const annotated = pyEnhanced.results;
      annotated.source = source;
      annotated.sources = sources;
      annotated.engine = pyEnhanced.engine;

      if (annotated.length > 0) {
        db.cacheResults(normQuery, annotated);
      }
      db.logSearch(normQuery, annotated.length);
      return annotated;
    }
  } catch (err) {
    console.warn('Python engine notice (falling back to native JS):', err.message);
  }

  // Check for official government / authoritative service and prepend to results
  const official = officialServices.findOfficialService(normQuery) || officialServices.detectOfficialFromResults(normQuery, rawResults);
  if (official) {
    const officialItem = officialServices.getOfficialSearchResultItem(official);
    rawResults = rawResults.filter(r => (r.domain || '').toLowerCase() !== (official.domain || '').toLowerCase());
    rawResults.unshift(officialItem);
    if (!sources.includes(official.portalName)) {
      sources.unshift(official.portalName);
    }
  }

  // Score each result for trust, relevance, and composite ranking
  const scored = rawResults.map(r => {
    const isOff = Boolean(r.isOfficial);
    const trustScore = isOff ? 100 : trustScorer.scoreResult(r);
    const relScore = isOff ? 100 : (typeof r.relevanceScore === 'number'
      ? r.relevanceScore
      : relevanceScorer.scoreRelevance(normQuery, r));
    const compScore = isOff ? 100 : relevanceScorer.calculateCompositeScore(relScore, trustScore);

    return Object.assign({}, r, {
      trustScore: trustScore,
      trustLabel: isOff ? 'High' : trustScorer.getTrustLabel(trustScore),
      trustBreakdown: isOff
        ? { domainScore: 25, citationScore: 25, contentLengthScore: 25, recencyScore: 25, totalScore: 100 }
        : trustScorer.getScoreBreakdown(r),
      relevanceScore: relScore,
      compositeScore: compScore,
      isOfficial: isOff,
      sourceName: r.sourceName || (r.domain ? r.domain : 'Web')
    });
  });

  // Filter out any results that have 0 relevance to the search query
  let ranked = scored.filter(r => r.relevanceScore > 0);
  if (ranked.length === 0) {
    ranked = scored;
  }

  // Sort by composite score (relevance + trust) descending
  ranked.sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));

  // Detect conflicts (protect official portals from conflict flags)
  const annotated = conflictDetector.detectConflicts(ranked).map(r => {
    if (r.isOfficial) {
      return Object.assign({}, r, { conflict: false, conflictReason: '' });
    }
    return r;
  });
  annotated.source = source;
  annotated.sources = sources;

  // Cache and log
  if (annotated.length > 0) {
    db.cacheResults(normQuery, annotated);
  }
  db.logSearch(normQuery, annotated.length);

  return annotated;
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/search
 * Body: { q: string }
 * OR
 * GET /api/search?q=<query>
 */
async function handleSearch(req, res) {
  const q = (req.body && req.body.q) || req.query.q || '';
  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  try {
    const results = await runSearchPipeline(q.trim(), false);
    const searchSource = results.source || 'multi-api';
    return res.json({
      query: q.trim(),
      results: results,
      total: results.length,
      searchSource: searchSource,
      sources: results.sources || [],
      demoMode: searchSource === 'demo'
    });
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Search failed. Please try again.' });
  }
}

app.post('/api/search', handleSearch);
app.get('/api/search', handleSearch);

/**
 * GET /api/verified?q=<query>
 * Returns the single best verified answer.
 */
app.get('/api/verified', async (req, res) => {
  const q = req.query.q || '';
  if (!q || q.trim().length === 0) {
    return res.status(400).json({ error: 'Query parameter "q" is required.' });
  }

  try {
    const results = await runSearchPipeline(q.trim(), false);

    // Try Python verified synthesizer first
    try {
      const pyAnswer = await pythonBridge.getPythonVerifiedAnswer(q.trim(), results);
      if (pyAnswer && pyAnswer.found) {
        return res.json(pyAnswer);
      }
    } catch (_) {}

    const answer = verifiedAnswer.getVerifiedAnswer(q.trim(), results);
    return res.json(answer);
  } catch (err) {
    console.error('Verified answer error:', err);
    return res.status(500).json({ error: 'Could not retrieve verified answer.' });
  }
});

/**
 * GET /api/suggestions?q=<prefix>
 * Returns autocomplete suggestions combining history and live suggestion APIs.
 */
app.get('/api/suggestions', async (req, res) => {
  const prefix = req.query.q || '';
  if (!prefix || prefix.trim().length === 0) {
    return res.json({ suggestions: [] });
  }

  const historySuggestions = db.getSuggestions(prefix);
  let liveSuggestions = [];
  try {
    liveSuggestions = await searchProviders.fetchAutocompleteSuggestions(prefix);
  } catch (_) {}

  // Augment with static example chips if prefix matches
  const examples = [
    'how to apply for driving license',
    'driving license online apply',
    'parivahan sewa driving licence',
    'passport seva online apply',
    'download aadhaar card',
    'income tax return filing',
    'what is climate change',
    'who invented the internet',
    'is coffee good for health',
    'what is ai',
    'how does vaccine work',
    'what is artificial intelligence',
    'how does the immune system work',
    'what causes global warming',
    'is social media harmful',
    'how does machine learning work'
  ];

  const lowerPrefix = prefix.toLowerCase().trim();
  const exampleMatches = examples.filter(e => e.startsWith(lowerPrefix));

  // Merge and deduplicate
  const merged = [...new Set([...historySuggestions, ...liveSuggestions, ...exampleMatches])].slice(0, 8);
  return res.json({ suggestions: merged });
});

/**
 * GET /api/history
 * Returns search history.
 */
app.get('/api/history', (req, res) => {
  try {
    return res.json({ history: db.getHistory() });
  } catch (err) {
    return res.status(500).json({ error: 'Could not retrieve history.' });
  }
});

/**
 * DELETE /api/history/:id
 * Delete a specific history entry.
 */
app.delete('/api/history/:id', (req, res) => {
  try {
    db.deleteHistory(req.params.id);
    return res.json({ message: 'History entry deleted.' });
  } catch (err) {
    return res.status(500).json({ error: 'Could not delete history entry.' });
  }
});

/**
 * DELETE /api/history
 * Clear all history.
 */
app.delete('/api/history', (req, res) => {
  try {
    db.clearHistory();
    return res.json({ message: 'History cleared.' });
  } catch (err) {
    return res.status(500).json({ error: 'Could not clear history.' });
  }
});

/**
 * GET /api/stats
 * Returns usage statistics.
 */
app.get('/api/stats', (req, res) => {
  try {
    return res.json(db.getStats());
  } catch (err) {
    return res.status(500).json({ error: 'Could not retrieve stats.' });
  }
});

/**
 * POST /api/seed
 * Seed the database with all demo data.
 */
app.post('/api/seed', (req, res) => {
  try {
    const allResults = demoData.ALL_RESULTS;

    // Score all
    const scored = allResults.map(r => {
      const score = trustScorer.scoreResult(r);
      return Object.assign({}, r, {
        trustScore: score,
        trustLabel: trustScorer.getTrustLabel(score),
        trustBreakdown: trustScorer.getScoreBreakdown(r),
        relevanceScore: 100,
        compositeScore: score,
        sourceName: r.sourceName || 'Demo Knowledgebase'
      });
    });

    // Detect conflicts
    const annotated = conflictDetector.detectConflicts(scored);
    annotated.source = 'demo';
    annotated.sources = ['Demo Knowledgebase'];

    // Cache under __seed__ key
    db.cacheResults('__seed__', annotated);

    return res.json({
      message: 'Demo data seeded.',
      count: annotated.length
    });
  } catch (err) {
    console.error('Seed error:', err);
    return res.status(500).json({ error: 'Seeding failed.' });
  }
});

/**
 * GET /api/health
 * Health check — reports status of all active and configured search providers.
 */
app.get('/api/health', async (req, res) => {
  const cfg = getSearchConfig();
  const hasGoogle = Boolean(cfg.googleApiKey && cfg.googleCx && cfg.googleApiKey !== 'your_google_api_key_here');
  const hasBrave = Boolean(cfg.braveApiKey && cfg.braveApiKey !== 'your_brave_api_key_here');
  const hasSerper = Boolean(cfg.serperApiKey && cfg.serperApiKey !== 'your_serper_api_key_here');
  const hasTavily = Boolean(cfg.tavilyApiKey && cfg.tavilyApiKey !== 'your_tavily_api_key_here');

  const activeProviders = [
    'DuckDuckGo Web Search',
    'Wikipedia REST API',
    'DuckDuckGo Instant Answers',
    'Hacker News Algolia',
    'Crossref Academic DOI',
    'Stack Overflow / StackExchange',
    'ArXiv Preprints',
    'Wikinews',
    'Google & DDG Autocomplete Suggest'
  ];
  if (hasGoogle) activeProviders.push('Google Custom Search');
  if (hasBrave) activeProviders.push('Brave Web Search');
  if (hasSerper) activeProviders.push('Google (via Serper)');
  if (hasTavily) activeProviders.push('Tavily AI Search');

  let pyHealth = null;
  try {
    pyHealth = await pythonBridge.getPythonHealth();
    if (pyHealth && pyHealth.available) {
      activeProviders.push(`Python 3 Reliability Engine (${pyHealth.mode})`);
    }
  } catch (_) {}

  return res.json({
    status: 'ok',
    demoMode: false,
    activeProviders: activeProviders,
    totalProviders: activeProviders.length,
    pythonReliabilityEngine: pyHealth,
    timestamp: new Date().toISOString()
  });
});

// ─── 404 handler for API routes ───────────────────────────────────────────────

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// ─── Start server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  const cfg = getSearchConfig();
  console.log('');
  console.log('  Smart Search v2 (Multi-API Engine)');
  console.log('  ──────────────────────────────────────────────────────────');
  console.log(`  Server running at http://localhost:${PORT}`);
  console.log('  Live Free APIs: Wikipedia, DuckDuckGo, HackerNews, Crossref,');
  console.log('                  StackOverflow, ArXiv, Wikinews, Multi-Suggest');
  if (cfg.googleApiKey && cfg.googleApiKey !== 'your_google_api_key_here') console.log('  Keyed Provider: Google Custom Search active');
  if (cfg.braveApiKey) console.log('  Keyed Provider: Brave Search active');
  if (cfg.serperApiKey) console.log('  Keyed Provider: Serper.dev active');
  if (cfg.tavilyApiKey) console.log('  Keyed Provider: Tavily AI active');
  console.log('  ──────────────────────────────────────────────────────────');
  console.log('');
});

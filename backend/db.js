'use strict';

const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const dbPath = path.join(__dirname, 'db.json');
const adapter = new FileSync(dbPath);
const db = low(adapter);

// Initialize defaults
db.defaults({
  searchHistory: [],
  results: [],
  suggestions: []
}).write();

/**
 * Log a search query to history.
 * @param {string} query
 * @param {number} resultCount
 */
function logSearch(query, resultCount) {
  db.get('searchHistory')
    .push({
      id: Date.now(),
      query: query,
      resultCount: resultCount || 0,
      timestamp: new Date().toISOString()
    })
    .write();

  // Also update suggestions
  const existing = db.get('suggestions').find({ query: query.toLowerCase() }).value();
  if (!existing) {
    db.get('suggestions').push({ query: query.toLowerCase(), count: 1 }).write();
  } else {
    db.get('suggestions')
      .find({ query: query.toLowerCase() })
      .assign({ count: (existing.count || 1) + 1 })
      .write();
  }
}

/**
 * Get search history, newest first.
 * @returns {object[]}
 */
function getHistory() {
  return db.get('searchHistory').value().slice().reverse();
}

/**
 * Delete a single history entry by id.
 * @param {number|string} id
 */
function deleteHistory(id) {
  const numId = Number(id);
  db.get('searchHistory')
    .remove(entry => entry.id === numId || entry.id === id)
    .write();
}

/**
 * Clear all search history.
 */
function clearHistory() {
  db.set('searchHistory', []).write();
}

/**
 * Get autocomplete suggestions for a given prefix.
 * @param {string} prefix
 * @returns {string[]}
 */
function getSuggestions(prefix) {
  if (!prefix || prefix.trim().length < 1) return [];
  const lower = prefix.toLowerCase().trim();
  return db.get('suggestions')
    .filter(s => s.query.startsWith(lower))
    .sortBy('count')
    .reverse()
    .map(s => s.query)
    .take(8)
    .value();
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache TTL

/**
 * Cache search results for a query.
 * @param {string} query
 * @param {object[]} results
 */
function cacheResults(query, results) {
  const normQuery = (query || '').trim().toLowerCase();
  // Remove any existing entry for this query (case-insensitive)
  db.get('results')
    .remove(entry => (entry.query || '').toLowerCase() === normQuery)
    .write();

  db.get('results')
    .push({
      query: query,
      results: results,
      sources: results.sources || [],
      source: results.source || 'multi-api',
      cachedAt: new Date().toISOString()
    })
    .write();
}

/**
 * Get cached results for a query if not expired.
 * @param {string} query
 * @returns {object[]|null}
 */
function getCachedResults(query) {
  const normQuery = (query || '').trim().toLowerCase();
  const entry = db.get('results')
    .find(e => (e.query || '').toLowerCase() === normQuery)
    .value();

  if (!entry || !Array.isArray(entry.results) || entry.results.length === 0) {
    return null;
  }

  // Check TTL expiration
  if (entry.cachedAt) {
    const age = Date.now() - new Date(entry.cachedAt).getTime();
    if (age > CACHE_TTL_MS) {
      // Stale cache: remove it
      db.get('results')
        .remove(e => (e.query || '').toLowerCase() === normQuery)
        .write();
      return null;
    }
  }

  const results = entry.results.slice();
  results.source = entry.source || 'cache';
  results.sources = entry.sources || [];
  return results;
}

/**
 * Get usage statistics.
 * @returns {object}
 */
function getStats() {
  const history = db.get('searchHistory').value();
  const totalSearches = history.length;

  if (totalSearches === 0) {
    return {
      totalSearches: 0,
      uniqueQueries: 0,
      topQueries: [],
      recentActivity: []
    };
  }

  // Count queries
  const queryCounts = {};
  for (const entry of history) {
    const q = (entry.query || '').toLowerCase();
    queryCounts[q] = (queryCounts[q] || 0) + 1;
  }

  const topQueries = Object.entries(queryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([query, count]) => ({ query, count }));

  // Last 7 days activity
  const now = new Date();
  const recentActivity = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const dateStr = day.toISOString().slice(0, 10);
    const count = history.filter(e => (e.timestamp || '').startsWith(dateStr)).length;
    recentActivity.push({ date: dateStr, count });
  }

  return {
    totalSearches,
    uniqueQueries: Object.keys(queryCounts).length,
    topQueries,
    recentActivity
  };
}

module.exports = {
  logSearch,
  getHistory,
  deleteHistory,
  clearHistory,
  getSuggestions,
  cacheResults,
  getCachedResults,
  getStats
};

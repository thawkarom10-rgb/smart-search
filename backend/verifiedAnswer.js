'use strict';

const relevanceScorer = require('./relevanceScorer');
const officialServices = require('./officialServices');

/**
 * Clean snippet text: remove cut-off clauses, ensure ending punctuation and readable capitalization.
 * @param {string} text
 * @returns {string}
 */
function cleanAnswerText(text) {
  if (!text || typeof text !== 'string') return '';
  let s = text.trim();

  // Remove leading punctuation or ellipsis
  s = s.replace(/^[.\s,-]+/, '');

  // If text was cut off in middle of sentence, clean it up
  if (!/[.!?]$/.test(s)) {
    const lastPunc = Math.max(s.lastIndexOf('.'), s.lastIndexOf('!'), s.lastIndexOf('?'));
    if (lastPunc > 70) {
      s = s.slice(0, lastPunc + 1);
    } else {
      s = s.replace(/[,;:\s-]+$/, '') + '.';
    }
  }

  // Capitalize first letter
  if (s.length > 0) {
    s = s.charAt(0).toUpperCase() + s.slice(1);
  }

  return s;
}

/**
 * Extract bullet-point highlights or key sentences from snippets.
 * @param {string} text
 * @returns {string[]}
 */
function extractKeyPoints(text) {
  if (!text || typeof text !== 'string') return [];
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 25 && s.length < 220);

  return sentences.slice(0, 4);
}

/**
 * Synthesise a summary paragraph from top high-trust, non-conflicting, relevant snippets.
 * @param {string} query
 * @param {object[]} scoredResults
 * @returns {string}
 */
function synthesise(query, scoredResults) {
  if (!Array.isArray(scoredResults) || scoredResults.length === 0) {
    return 'No information available.';
  }

  const relevant = scoredResults.filter(r => {
    const rel = r.relevanceScore != null ? r.relevanceScore : relevanceScorer.scoreRelevance(query, r);
    return rel > 0;
  });

  const pool = relevant.length > 0 ? relevant : scoredResults;

  const sorted = pool.slice().sort((a, b) => {
    const aComp = a.compositeScore != null ? a.compositeScore : relevanceScorer.calculateCompositeScore(a.relevanceScore || 0, a.trustScore || 0);
    const bComp = b.compositeScore != null ? b.compositeScore : relevanceScorer.calculateCompositeScore(b.relevanceScore || 0, b.trustScore || 0);
    return bComp - aComp;
  });

  const topSnippets = sorted
    .slice(0, 3)
    .map(r => cleanAnswerText(r.snippet || ''))
    .filter(s => s.length > 0);

  if (topSnippets.length === 0) return 'No summary available.';

  return topSnippets.join(' ');
}

/**
 * Get the best verified answer from scored, annotated results.
 * Priority:
 * 1. Official Government & Public Services Registry (e.g. Parivahan, Passport, UIDAI, etc.)
 * 2. Dynamic Official Government / Authoritative Portals in search results (.gov, .nic.in, .edu)
 * 3. Highest Composite (Relevance + Trust) non-conflicting authoritative answer.
 *
 * @param {string} query
 * @param {object[]} results - results with trustScore, trustLabel, conflict
 * @returns {object} VerifiedAnswer
 */
function getVerifiedAnswer(query, results) {
  const normQuery = (query || '').trim();

  // 1. Check for registered official service (e.g. "driving license" -> Parivahan Sewa)
  const official = officialServices.findOfficialService(normQuery) || officialServices.detectOfficialFromResults(normQuery, results);
  if (official) {
    return {
      query: normQuery,
      answer: cleanAnswerText(official.directAnswer || official.description),
      keyPoints: official.keyPoints || [],
      officialPortal: {
        title: official.portalName,
        name: official.name,
        url: official.directServiceUrl || official.url,
        domain: official.domain,
        badge: official.badge || 'Official Government Portal',
        authority: official.authority || official.domain,
        description: official.description
      },
      relatedLinks: official.relatedLinks || [],
      source: official.directServiceUrl || official.url,
      title: official.portalName,
      domain: official.domain,
      sourceName: official.badge || 'Official Government Portal',
      trustScore: 100,
      trustLabel: 'High',
      confidence: 'High',
      isOfficial: true,
      found: true
    };
  }

  if (!Array.isArray(results) || results.length === 0) {
    return {
      query: normQuery,
      answer: 'No answer found.',
      source: '',
      title: '',
      domain: '',
      sourceName: '',
      trustScore: 0,
      trustLabel: 'N/A',
      confidence: 'None',
      found: false
    };
  }

  // Ensure each result has relevance and composite scores computed
  const scored = results.map(r => {
    const rel = typeof r.relevanceScore === 'number'
      ? r.relevanceScore
      : relevanceScorer.scoreRelevance(normQuery, r);
    const trust = typeof r.trustScore === 'number' ? r.trustScore : 0;
    const comp = typeof r.compositeScore === 'number'
      ? r.compositeScore
      : relevanceScorer.calculateCompositeScore(rel, trust);

    return Object.assign({}, r, {
      relevanceScore: rel,
      trustScore: trust,
      compositeScore: comp
    });
  });

  // Only consider items that have actual relevance to the query
  const relevantResults = scored.filter(r => r.relevanceScore > 0);
  const candidatePool = relevantResults.length > 0 ? relevantResults : scored;

  // Prefer non-conflicting candidates
  const nonConflicting = candidatePool.filter(r => r.conflict === false);
  const pool = nonConflicting.length > 0 ? nonConflicting : candidatePool;

  // Sort by composite score (relevance + trust) descending
  pool.sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));

  const best = pool[0];
  if (!best) {
    return {
      query: normQuery,
      answer: 'No relevant verified answer found.',
      source: '',
      title: '',
      domain: '',
      sourceName: '',
      trustScore: 0,
      trustLabel: 'N/A',
      confidence: 'None',
      found: false
    };
  }

  const rawAnswer = best.snippet || best.title || 'No answer available.';
  const cleanedAnswer = cleanAnswerText(rawAnswer);
  const keyPoints = extractKeyPoints(cleanedAnswer);

  const trustScore = best.trustScore || 0;
  const trustLabel = best.trustLabel || 'Low';
  let confidence = trustLabel;

  if (best.conflict) {
    confidence = 'Low';
  }

  // Check if best source is an official government or institution site
  const isGovDomain = /\.(gov|gov\.in|nic\.in|gov\.uk|gov\.au|int|edu)/i.test(best.domain || best.url);

  let officialPortal = null;
  if (isGovDomain) {
    officialPortal = {
      title: best.title || best.sourceName || best.domain,
      name: best.sourceName || best.domain,
      url: best.url,
      domain: best.domain,
      badge: 'Official Authority Portal',
      authority: best.domain,
      description: cleanedAnswer
    };
  }

  return {
    query: normQuery,
    answer: cleanedAnswer,
    keyPoints: keyPoints.length > 1 ? keyPoints : [],
    officialPortal: officialPortal,
    source: best.url || best.domain || '',
    title: best.title || '',
    domain: best.domain || '',
    sourceName: best.sourceName || (best.domain ? best.domain : 'Web'),
    trustScore: trustScore,
    trustLabel: trustLabel,
    confidence: confidence,
    found: true
  };
}

module.exports = { getVerifiedAnswer, synthesise };

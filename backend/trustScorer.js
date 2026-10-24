'use strict';

// Reputable domains/TLDs that earn high domain score
const REPUTABLE_DOMAINS = [
  'wikipedia.org',
  'wikinews.org',
  'wikidata.org',
  'arxiv.org',
  'crossref.org',
  'doi.org',
  'bbc.com',
  'reuters.com',
  'britannica.com',
  'who.int',
  'nasa.gov',
  'cdc.gov',
  'ncbi.nlm.nih.gov',
  'nature.com',
  'nytimes.com',
  'theguardian.com',
  'apnews.com',
  'khanacademy.org',
  'nationalgeographic.com',
  'scientificamerican.com',
  'smithsonianmag.com',
  'pbs.org',
  'npr.org',
  'sciencedirect.com',
  'ieee.org',
  'acm.org',
  'springer.com',
  'jstor.org',
  'developer.mozilla.org',
  'w3.org',
  'github.com',
  'stackoverflow.com',
  'parivahan.gov.in',
  'passportindia.gov.in',
  'uidai.gov.in',
  'incometax.gov.in',
  'voters.eci.gov.in',
  'epfindia.gov.in',
  'digilocker.gov.in',
  'irctc.co.in'
];

const REPUTABLE_TLDS = ['.gov', '.gov.in', '.nic.in', '.gov.uk', '.gov.au', '.edu', '.int', '.mil'];

const LOW_QUALITY_DOMAINS = [
  'blogspot.com',
  'wordpress.com',
  'tumblr.com',
  'quora.com',
  'yahoo.answers.com',
  'answers.com'
];

/**
 * Score domain reputation: 0–25
 */
function domainScore(result) {
  const domain = (result.domain || '').toLowerCase();
  const url = (result.url || '').toLowerCase();
  const combined = domain || url;

  if (result.category === 'academic') return 25;
  if (!combined) return 5;

  // Check reputable TLDs
  for (const tld of REPUTABLE_TLDS) {
    if (combined.includes(tld)) return 25;
  }

  // Check reputable domains
  for (const rep of REPUTABLE_DOMAINS) {
    if (combined.includes(rep)) return 25;
  }

  // Check low-quality domains
  for (const low of LOW_QUALITY_DOMAINS) {
    if (combined.includes(low)) return 5;
  }

  // Unknown domain — moderate score
  return 12;
}

/**
 * Score citations count: 0–25
 * Maps citations [0..5+] linearly to [0..25]
 */
function citationScore(result) {
  const citations = typeof result.citations === 'number' ? result.citations : 0;
  return Math.round(Math.min(citations, 5) / 5 * 25);
}

/**
 * Score content length: 0–25
 * Maps contentLength [0..2000] linearly to [0..25]
 */
function contentLengthScore(result) {
  const length = typeof result.contentLength === 'number' ? result.contentLength : 0;
  const clamped = Math.max(0, Math.min(length, 2000));
  return Math.round(clamped / 2000 * 25);
}

/**
 * Score recency: 0–25
 * ≤30 days = 25, >365 days = 0, linear in between
 */
function recencyScore(result) {
  if (!result.publishedDate) return 8; // No date info — give partial credit

  const published = new Date(result.publishedDate);
  if (isNaN(published.getTime())) return 8;

  const now = new Date();
  const ageMs = now - published;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays <= 30) return 25;
  if (ageDays >= 365) return 0;

  // Linear interpolation between 30 and 365 days
  const fraction = (ageDays - 30) / (365 - 30);
  return Math.round((1 - fraction) * 25);
}

/**
 * Score a single result object, returning 0–100.
 * @param {object} result
 * @returns {number} score in [0, 100]
 */
function scoreResult(result) {
  if (!result || typeof result !== 'object') return 0;

  const total =
    domainScore(result) +
    citationScore(result) +
    contentLengthScore(result) +
    recencyScore(result);

  return Math.max(0, Math.min(100, total));
}

/**
 * Map a numeric score to a human-readable trust label.
 * @param {number} score
 * @returns {"High"|"Medium"|"Low"}
 */
function getTrustLabel(score) {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

/**
 * Return detailed breakdown of all trust score components.
 * @param {object} result
 * @returns {object}
 */
function getScoreBreakdown(result) {
  return {
    domainScore: domainScore(result),
    citationScore: citationScore(result),
    contentLengthScore: contentLengthScore(result),
    recencyScore: recencyScore(result),
    totalScore: scoreResult(result)
  };
}

module.exports = { scoreResult, getTrustLabel, getScoreBreakdown };

'use strict';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
  'been', 'being', 'in', 'on', 'at', 'to', 'for', 'with', 'about', 'against',
  'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'from', 'up', 'down', 'of', 'off', 'over', 'under', 'again', 'further',
  'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
  'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
  'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'what', 'which',
  'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'it', 'its', 'tell',
  'me', 'give', 'show', 'explain', 'meaning', 'means', 'definition', 'define',
  'find', 'look', 'search', 'like'
]);

const SYNONYMS = {
  'ai': ['artificial intelligence', 'machine learning', 'neural network'],
  'ml': ['machine learning', 'artificial intelligence'],
  'covid': ['coronavirus', 'covid-19', 'sars-cov-2', 'pandemic', 'vaccine'],
  'vaccine': ['vaccination', 'immunization', 'vaccines', 'antibodies'],
  'climate': ['global warming', 'greenhouse', 'emissions', 'temperature'],
  'internet': ['arpanet', 'web', 'world wide web', 'online', 'network'],
  'india': ['indian', 'bharat', 'delhi', 'asia'],
  'japan': ['japanese', 'tokyo'],
  'driving': ['driver', 'drivers', 'drive', 'vehicle', 'motor', 'rto', 'dl', 'licence', 'license', 'parivahan'],
  'driver': ['driving', 'drivers', 'drive', 'motor', 'vehicle', 'licence', 'license'],
  'license': ['licence', 'licenes', 'lisence', 'permit', 'dl', 'authorization'],
  'licence': ['license', 'licenes', 'lisence', 'permit', 'dl', 'authorization'],
  'licenes': ['license', 'licence', 'permit', 'dl'],
  'passport': ['passports', 'travel document', 'visa', 'pcc'],
  'aadhaar': ['aadhar', 'uidai', 'uid', 'myaadhaar'],
  'aadhar': ['aadhaar', 'uidai', 'uid', 'myaadhaar'],
  'pan': ['pancard', 'nsdl', 'uti', 'income tax'],
  'tax': ['taxes', 'taxation', 'incometax', 'itr', 'return'],
  'voter': ['election', 'vote', 'voting', 'epic', 'eci']
};

/**
 * Tokenize text into normalized alphanumeric word tokens.
 * @param {string} text
 * @returns {string[]}
 */
function tokenize(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0);
}

/**
 * Extract meaningful search keywords (excluding stop words).
 * @param {string} query
 * @returns {string[]}
 */
function extractKeywords(query) {
  const tokens = tokenize(query);
  const keywords = tokens.filter(w => w.length > 1 && !STOP_WORDS.has(w));
  return keywords.length > 0 ? keywords : tokens.filter(w => w.length > 1);
}

/**
 * Check if a word or phrase exists in text with word boundaries.
 * @param {string} text
 * @param {string} target
 * @returns {boolean}
 */
function containsWordOrPhrase(text, target) {
  if (!text || !target) return false;
  const escaped = target.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp('(?:^|\\b)' + escaped + '(?:\\b|$)', 'i');
  return regex.test(text);
}

/**
 * Check if a token set or string matches a keyword (exact word, stem, or synonym).
 * @param {Set<string>} tokenSet
 * @param {string} rawText
 * @param {string} keyword
 * @returns {boolean}
 */
function matchesKeyword(tokenSet, rawText, keyword) {
  if (tokenSet.has(keyword)) return true;

  // Check word boundary regex in raw text
  if (containsWordOrPhrase(rawText, keyword)) return true;

  // Check stem matching for words longer than 3 characters (e.g. "vaccin" matches "vaccine", "vaccines")
  if (keyword.length > 3) {
    const stem = keyword.slice(0, Math.min(keyword.length - 1, 5));
    for (const token of tokenSet) {
      if (token.length > 3 && token.startsWith(stem)) {
        return true;
      }
    }
  }

  // Check synonyms
  const syns = SYNONYMS[keyword];
  if (Array.isArray(syns)) {
    for (const syn of syns) {
      if (containsWordOrPhrase(rawText, syn)) return true;
    }
  }

  return false;
}

/**
 * Calculate the relevance score of a search result to the user query.
 * Returns a score between 0 and 100.
 *
 * @param {string} query - The search query
 * @param {object} item - Result object with title, snippet, and url/domain
 * @returns {number} 0–100
 */
function scoreRelevance(query, item) {
  if (!query || typeof query !== 'string' || !item || typeof item !== 'object') {
    return 0;
  }

  const rawQuery = query.trim().toLowerCase();
  const keywords = extractKeywords(query);

  if (keywords.length === 0) return 50;

  const rawTitle = (item.title || '').toLowerCase();
  const rawSnippet = (item.snippet || '').toLowerCase();
  const rawDomain = (item.domain || '').toLowerCase();
  const rawUrl = (item.url || '').toLowerCase();

  const titleTokens = new Set(tokenize(rawTitle));
  const snippetTokens = new Set(tokenize(rawSnippet));
  const domainTokens = new Set(tokenize(rawDomain + ' ' + rawUrl));

  let score = 0;

  // 1. Exact full query phrase match (with word boundary)
  if (containsWordOrPhrase(rawTitle, rawQuery)) {
    score += 45; // Exact query in title!
  } else if (containsWordOrPhrase(rawSnippet, rawQuery)) {
    score += 25; // Exact query in snippet!
  }

  // 2. Keyword matching in title (using word boundary / token match)
  let titleMatches = 0;
  for (const kw of keywords) {
    if (matchesKeyword(titleTokens, rawTitle, kw)) {
      titleMatches++;
    }
  }
  const titleRatio = titleMatches / keywords.length;
  score += Math.round(titleRatio * 35);

  // 3. Keyword matching in snippet
  let snippetMatches = 0;
  for (const kw of keywords) {
    if (matchesKeyword(snippetTokens, rawSnippet, kw)) {
      snippetMatches++;
    }
  }
  const snippetRatio = snippetMatches / keywords.length;
  score += Math.round(snippetRatio * 20);

  // 4. Keyword coverage across all fields
  let totalMatched = 0;
  for (const kw of keywords) {
    if (
      matchesKeyword(titleTokens, rawTitle, kw) ||
      matchesKeyword(snippetTokens, rawSnippet, kw) ||
      matchesKeyword(domainTokens, rawDomain, kw)
    ) {
      totalMatched++;
    }
  }

  // If literally ZERO keywords matched, this is completely irrelevant!
  if (totalMatched === 0) {
    return 0;
  }

  const coverage = totalMatched / keywords.length;
  if (coverage === 1.0) {
    score += 15; // 100% keyword coverage bonus
  } else if (coverage >= 0.5) {
    score += Math.round(coverage * 10);
  }

  // 5. Title starts with first keyword
  if (keywords.length > 0 && rawTitle.startsWith(keywords[0])) {
    score += 5;
  }

  return Math.min(Math.max(score, 0), 100);
}

/**
 * Calculate a balanced composite score combining Relevance and Trust.
 * Relevance dominates ranking so that irrelevant content never ranks high,
 * while Trust breaks ties and prioritizes authoritative sources among relevant results.
 *
 * @param {number} relevanceScore - 0 to 100
 * @param {number} trustScore - 0 to 100
 * @returns {number} 0 to 100
 */
function calculateCompositeScore(relevanceScore, trustScore) {
  const rel = Math.max(0, Math.min(100, Number(relevanceScore) || 0));
  const tr = Math.max(0, Math.min(100, Number(trustScore) || 0));

  // If relevance is 0, composite score is 0
  if (rel === 0) return 0;

  // If relevance is low (< 25), heavily penalize
  if (rel < 25) {
    return Math.round(rel * 0.4);
  }

  // Normal composite: 70% relevance weight, 30% credibility/trust weight
  return Math.round(rel * 0.70 + tr * 0.30);
}

/**
 * Filter out results that have 0 relevance to the query.
 * @param {string} query
 * @param {object[]} results
 * @returns {object[]}
 */
function filterIrrelevantResults(query, results) {
  if (!Array.isArray(results) || results.length === 0) return [];
  const keywords = extractKeywords(query);
  if (keywords.length === 0) return results;

  return results.filter(item => {
    const rel = scoreRelevance(query, item);
    return rel > 0;
  });
}

module.exports = {
  scoreRelevance,
  calculateCompositeScore,
  filterIrrelevantResults,
  extractKeywords,
  tokenize,
  containsWordOrPhrase
};

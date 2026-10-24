'use strict';

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'to', 'of', 'and', 'or', 'in', 'it', 'this', 'that', 'for', 'with',
  'on', 'at', 'by', 'from', 'as', 'but', 'not', 'so', 'if', 'do',
  'did', 'does', 'have', 'has', 'had', 'will', 'would', 'could', 'should',
  'may', 'might', 'can', 'about', 'more', 'also', 'than', 'into', 'its',
  'their', 'they', 'he', 'she', 'we', 'you', 'i', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'our', 'up', 'out', 'no', 'new',
  'some', 'what', 'which', 'who', 'when', 'where', 'how', 'all', 'been',
  'after', 'before', 'during', 'each', 'such', 'through', 'while', 'one',
  'two', 'three', 'many', 'most', 'other', 'over', 'between', 'both'
]);

const POSITIVE_SIGNALS = [
  'effective', 'proven', 'safe', 'beneficial', 'recommended', 'confirmed',
  'supported', 'true', 'accurate', 'yes', 'works', 'validated', 'demonstrated',
  'successful', 'helps', 'improves', 'boosts', 'increases', 'protects',
  'cures', 'treats', 'reliable', 'trustworthy', 'evidence', 'scientific',
  'study shows', 'research confirms', 'experts agree', 'consensus'
];

const NEGATIVE_SIGNALS = [
  'ineffective', 'debunked', 'dangerous', 'harmful', 'not recommended', 'denied',
  'disputed', 'false', 'inaccurate', 'no', 'fails', 'invalidated', 'disproven',
  'unsuccessful', 'hurts', 'worsens', 'decreases', 'risks', 'damages',
  'toxic', 'unproven', 'unreliable', 'untrustworthy', 'myth', 'misleading',
  'study refutes', 'research denies', 'experts disagree', 'controversy',
  'not proven', 'not effective', 'no evidence'
];

const OVERLAP_THRESHOLD = 0.3;

/**
 * Extract a normalized keyword set from a text snippet.
 * @param {string} snippet
 * @returns {Set<string>}
 */
function extractKeywords(snippet) {
  if (!snippet || typeof snippet !== 'string') return new Set();
  const words = snippet
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Compute overlap ratio between two keyword sets.
 * @param {Set} setA
 * @param {Set} setB
 * @returns {number} 0–1
 */
function overlapRatio(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const word of setA) {
    if (setB.has(word)) shared++;
  }
  return shared / Math.min(setA.size, setB.size);
}

/**
 * Check if a snippet contains any word from a signal list.
 * @param {string} snippet
 * @param {string[]} signalList
 * @returns {boolean}
 */
function hasSignal(snippet, signalList) {
  if (!snippet) return false;
  const lower = snippet.toLowerCase();
  return signalList.some(signal => lower.includes(signal));
}

/**
 * Get the matching signal phrases from a snippet for conflict reason description.
 * @param {string} snippet
 * @param {string[]} signalList
 * @returns {string[]}
 */
function getMatchedSignals(snippet, signalList) {
  if (!snippet) return [];
  const lower = snippet.toLowerCase();
  return signalList.filter(signal => lower.includes(signal));
}

/**
 * Detect conflicts in an array of search result objects.
 * Returns a new array of shallow-cloned results with conflict and conflictReason added.
 * @param {object[]} results
 * @returns {object[]}
 */
function detectConflicts(results) {
  if (!Array.isArray(results) || results.length === 0) return [];

  // Start with all results cloned, non-conflicting
  const annotated = results.map(r => Object.assign({}, r, { conflict: false, conflictReason: null }));

  // Extract keyword sets for all results
  const keywordSets = annotated.map(r => extractKeywords(r.snippet || ''));

  // Check all pairs
  for (let i = 0; i < annotated.length; i++) {
    for (let j = i + 1; j < annotated.length; j++) {
      const overlap = overlapRatio(keywordSets[i], keywordSets[j]);

      if (overlap >= OVERLAP_THRESHOLD) {
        const snippetI = annotated[i].snippet || '';
        const snippetJ = annotated[j].snippet || '';

        const iPosSignal = hasSignal(snippetI, POSITIVE_SIGNALS);
        const iNegSignal = hasSignal(snippetI, NEGATIVE_SIGNALS);
        const jPosSignal = hasSignal(snippetJ, POSITIVE_SIGNALS);
        const jNegSignal = hasSignal(snippetJ, NEGATIVE_SIGNALS);

        const isConflict =
          (iPosSignal && jNegSignal) || (iNegSignal && jPosSignal);

        if (isConflict) {
          // Find shared keywords for conflict reason
          const shared = [];
          for (const word of keywordSets[i]) {
            if (keywordSets[j].has(word)) shared.push(word);
          }
          const sharedStr = shared.slice(0, 5).join(', ');

          const iSignals = [
            ...getMatchedSignals(snippetI, POSITIVE_SIGNALS),
            ...getMatchedSignals(snippetI, NEGATIVE_SIGNALS)
          ].slice(0, 2).join(', ');

          const jSignals = [
            ...getMatchedSignals(snippetJ, POSITIVE_SIGNALS),
            ...getMatchedSignals(snippetJ, NEGATIVE_SIGNALS)
          ].slice(0, 2).join(', ');

          const reason = `Conflicting claims about: ${sharedStr}. Source 1 signals: "${iSignals}". Source 2 signals: "${jSignals}".`;

          annotated[i].conflict = true;
          annotated[i].conflictReason = reason;
          annotated[j].conflict = true;
          annotated[j].conflictReason = reason;
        }
      }
    }
  }

  return annotated;
}

module.exports = { detectConflicts, extractKeywords, overlapRatio, hasSignal };

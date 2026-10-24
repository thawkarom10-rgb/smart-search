'use strict';

const assert = require('assert');
const trustScorer = require('../trustScorer');
const conflictDetector = require('../conflictDetector');
const relevanceScorer = require('../relevanceScorer');
const verifiedAnswer = require('../verifiedAnswer');

console.log('Running Smart Search v2 unit tests...');

// 1. Test trustScorer
const academicResult = {
  domain: 'arxiv.org',
  url: 'https://arxiv.org/abs/2301.00001',
  citations: 8,
  contentLength: 2500,
  publishedDate: new Date().toISOString()
};
const score = trustScorer.scoreResult(academicResult);
assert(score >= 70, `Expected academic paper to score >= 70, got ${score}`);
assert.strictEqual(trustScorer.getTrustLabel(score), 'High');

const breakdown = trustScorer.getScoreBreakdown(academicResult);
assert(typeof breakdown.domainScore === 'number');
assert(typeof breakdown.citationScore === 'number');
assert(typeof breakdown.contentLengthScore === 'number');
assert(typeof breakdown.recencyScore === 'number');
assert(breakdown.totalScore === score);
console.log('✓ trustScorer and breakdown test passed');

// 2. Test relevanceScorer
const relResult = {
  title: 'Understanding Climate Change Causes and Effects',
  snippet: 'Climate change is primarily caused by greenhouse gas emissions from human activities.'
};
const relScore = relevanceScorer.scoreRelevance('climate change causes', relResult);
assert(relScore > 0, `Expected positive relevance score, got ${relScore}`);
const compScore = relevanceScorer.calculateCompositeScore(relScore, score);
assert(compScore > 0, `Expected composite score > 0, got ${compScore}`);
console.log('✓ relevanceScorer test passed');

// 3. Test conflictDetector
const resultA = {
  id: 1,
  snippet: 'Coffee is safe and highly beneficial for health, study shows consensus among experts.'
};
const resultB = {
  id: 2,
  snippet: 'Coffee is harmful and dangerous for health, study refutes its benefits.'
};
const annotated = conflictDetector.detectConflicts([resultA, resultB]);
assert(annotated.some(r => r.conflict), 'Expected conflict to be flagged between contradictory claims');
console.log('✓ conflictDetector test passed');

// 4. Test verifiedAnswer
const answer = verifiedAnswer.getVerifiedAnswer('coffee health', [
  {
    title: 'Health Effects of Coffee',
    snippet: 'Moderate coffee consumption is associated with lower mortality risk.',
    trustScore: 85,
    trustLabel: 'High',
    url: 'https://who.int/coffee',
    domain: 'who.int',
    sourceName: 'WHO'
  }
]);
assert(answer.found === true, 'Expected verified answer to be found');
assert(typeof answer.answer === 'string' && answer.answer.length > 0);
console.log('✓ verifiedAnswer test passed');

// 5. Test Official Services (Driving License & typo "driving licenes")
const dlAnswer = verifiedAnswer.getVerifiedAnswer('driving license', []);
assert(dlAnswer.found === true, 'Expected driving license answer to be found');
assert(dlAnswer.officialPortal, 'Expected officialPortal object');
assert.strictEqual(dlAnswer.officialPortal.domain, 'parivahan.gov.in');
assert(dlAnswer.keyPoints.length > 0, 'Expected key steps for driving license');
assert(dlAnswer.officialPortal.url.includes('parivahan.gov.in'));

// Typo tolerance: "driving licenes"
const dlTypoAnswer = verifiedAnswer.getVerifiedAnswer('driving licenes', []);
assert(dlTypoAnswer.found === true, 'Expected typo "driving licenes" to resolve to Parivahan portal');
assert.strictEqual(dlTypoAnswer.officialPortal.domain, 'parivahan.gov.in');
console.log('✓ officialServices and typo tolerance test passed (driving license -> parivahan.gov.in)');

console.log('All unit tests passed successfully!');

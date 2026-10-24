'use strict';

const assert = require('assert');
const pythonBridge = require('../pythonBridge');

(async () => {
  console.log('Running Python Reliability Engine Bridge tests...');

  // 1. Health check
  const health = await pythonBridge.getPythonHealth();
  assert(health.available === true, 'Expected Python to be detected as available');
  assert(typeof health.pythonVersion === 'string', 'Expected pythonVersion string');
  console.log(`✓ Python engine detected: ${health.pythonVersion} (mode: ${health.mode})`);

  // 2. Result enhancement and scoring
  const enhanced = await pythonBridge.enhanceResultsWithPython('climate change causes', [
    {
      title: 'Global Climate Science',
      snippet: 'Carbon emissions are the primary cause of modern climate change.',
      domain: 'climate.nasa.gov',
      citations: 5,
      contentLength: 2000
    }
  ]);
  assert(enhanced !== null, 'Expected enhanced results from Python engine');
  assert(Array.isArray(enhanced.results), 'Expected results array');
  assert(enhanced.results.length > 0, 'Expected at least 1 result');
  assert(typeof enhanced.results[0].trustScore === 'number', 'Expected trustScore number');
  assert(typeof enhanced.results[0].compositeScore === 'number', 'Expected compositeScore number');
  console.log(`✓ Python result enhancement passed (engine: ${enhanced.engine})`);

  // 3. Contradiction detection via bridge
  const conflictCheck = await pythonBridge.enhanceResultsWithPython('coffee health effects', [
    {
      id: 1,
      snippet: 'Coffee is safe and beneficial for health, consensus shows.'
    },
    {
      id: 2,
      snippet: 'Coffee is dangerous and harmful for health, study refutes its benefits.'
    }
  ]);
  assert(conflictCheck !== null, 'Expected conflict check output');
  const hasConflict = conflictCheck.results.some(r => r.conflict);
  assert(hasConflict, 'Expected contradiction to be flagged by Python conflict analyzer');
  console.log('✓ Python conflict analyzer bridge test passed');

  // 4. Official service resolution via bridge
  const verifiedDL = await pythonBridge.getPythonVerifiedAnswer('driving license', []);
  assert(verifiedDL !== null && verifiedDL.found === true, 'Expected driving license official answer');
  assert(verifiedDL.officialPortal.domain === 'parivahan.gov.in', 'Expected Parivahan portal');
  console.log('✓ Python official portal resolution bridge test passed');

  console.log('All Python Reliability Bridge tests passed successfully!');
})();

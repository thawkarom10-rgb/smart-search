'use strict';

/**
 * Python Reliability Bridge for Smart Search v2.
 * Provides resilient communication with the Python Reliability Engine via HTTP microservice
 * with automatic fallback to Python subprocess IPC and JavaScript heuristic fallback.
 */

const { spawnSync } = require('child_process');
const path = require('path');
const axios = require('axios');

const PYTHON_PORT = parseInt(process.env.PYTHON_ENGINE_PORT, 10) || 5001;
const PYTHON_HTTP_URL = `http://127.0.0.1:${PYTHON_PORT}`;
const BACKEND_DIR = __dirname;

let pythonCheckCache = null;
let pythonCheckTime = 0;

/**
 * Detect if python is executable on this machine.
 * @returns {boolean}
 */
function isPythonInstalled() {
  const now = Date.now();
  if (pythonCheckCache !== null && (now - pythonCheckTime < 60000)) {
    return pythonCheckCache;
  }

  try {
    const res = spawnSync('python', ['--version'], { encoding: 'utf8', timeout: 3000 });
    pythonCheckCache = (res.status === 0 || (res.stdout && res.stdout.includes('Python')));
  } catch (_) {
    pythonCheckCache = false;
  }
  pythonCheckTime = now;
  return pythonCheckCache;
}

/**
 * Check Python engine health via HTTP or subprocess.
 * @returns {Promise<object>}
 */
async function getPythonHealth() {
  // 1. Try HTTP microservice
  try {
    const res = await axios.get(`${PYTHON_HTTP_URL}/health`, { timeout: 800 });
    if (res.data && res.data.status === 'ok') {
      return {
        available: true,
        mode: 'http-microservice',
        url: PYTHON_HTTP_URL,
        pythonVersion: res.data.pythonVersion,
        features: res.data.features || []
      };
    }
  } catch (_) {}

  // 2. Try CLI subprocess
  if (isPythonInstalled()) {
    try {
      const res = spawnSync('python', ['-m', 'python_engine.service', '--action', 'health'], {
        cwd: BACKEND_DIR,
        encoding: 'utf8',
        timeout: 4000
      });
      if (res.status === 0 && res.stdout) {
        const parsed = JSON.parse(res.stdout.trim());
        return {
          available: true,
          mode: 'subprocess-ipc',
          pythonVersion: parsed.pythonVersion || '3.x',
          features: parsed.features || []
        };
      }
    } catch (_) {}
  }

  return {
    available: false,
    mode: 'none',
    message: 'Python reliability engine inactive; operating in pure JavaScript mode.'
  };
}

/**
 * Run resilient Python search providers as fallback or primary.
 * @param {string} query
 * @returns {Promise<{results: object[], sources: string[]}|null>}
 */
async function runPythonSearch(query) {
  if (!query) return null;

  // 1. Try HTTP
  try {
    const res = await axios.post(`${PYTHON_HTTP_URL}/search`, { query: query }, { timeout: 4500 });
    if (res.data && Array.isArray(res.data.results)) {
      return {
        results: res.data.results,
        sources: res.data.sources || ['Python Resilience Engine']
      };
    }
  } catch (_) {}

  // 2. Try Subprocess
  if (isPythonInstalled()) {
    try {
      const payload = JSON.stringify({ query: query });
      const res = spawnSync('python', ['-m', 'python_engine.service', '--action', 'search'], {
        cwd: BACKEND_DIR,
        input: payload,
        encoding: 'utf8',
        timeout: 6000
      });
      if (res.status === 0 && res.stdout) {
        const parsed = JSON.parse(res.stdout.trim());
        if (Array.isArray(parsed.results)) {
          return {
            results: parsed.results,
            sources: parsed.sources || ['Python Resilience Engine']
          };
        }
      }
    } catch (err) {
      console.warn('Python search subprocess notice:', err.message);
    }
  }

  return null;
}

/**
 * Enhance and rank results using Python's deep NLP contradiction detector,
 * trust scorer, and official portals registry.
 * @param {string} query
 * @param {object[]} results
 * @returns {Promise<{results: object[], verified: object, engine: string}|null>}
 */
async function enhanceResultsWithPython(query, results) {
  if (!query || !Array.isArray(results)) return null;

  const payload = {
    query: query,
    results: results
  };

  // 1. Try HTTP Microservice (fastest, keeps process hot)
  try {
    const res = await axios.post(`${PYTHON_HTTP_URL}/analyze`, payload, { timeout: 4000 });
    if (res.data && Array.isArray(res.data.results)) {
      return {
        results: res.data.results,
        verified: res.data.verified,
        engine: 'Python 3 Reliability Engine (HTTP Microservice)'
      };
    }
  } catch (_) {}

  // 2. Try Subprocess IPC
  if (isPythonInstalled()) {
    try {
      const inputStr = JSON.stringify(payload);
      const res = spawnSync('python', ['-m', 'python_engine.service', '--action', 'analyze'], {
        cwd: BACKEND_DIR,
        input: inputStr,
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024
      });
      if (res.status === 0 && res.stdout) {
        const parsed = JSON.parse(res.stdout.trim());
        if (Array.isArray(parsed.results)) {
          return {
            results: parsed.results,
            verified: parsed.verified,
            engine: 'Python 3 Reliability Engine (Subprocess IPC)'
          };
        }
      }
    } catch (err) {
      console.warn('Python analyze subprocess notice:', err.message);
    }
  }

  return null;
}

/**
 * Synthesize verified answer using Python.
 * @param {string} query
 * @param {object[]} results
 * @returns {Promise<object|null>}
 */
async function getPythonVerifiedAnswer(query, results) {
  if (!query) return null;

  const payload = { query: query, results: results || [] };

  try {
    const res = await axios.post(`${PYTHON_HTTP_URL}/verified`, payload, { timeout: 3000 });
    if (res.data && res.data.found !== undefined) {
      return res.data;
    }
  } catch (_) {}

  if (isPythonInstalled()) {
    try {
      const inputStr = JSON.stringify(payload);
      const res = spawnSync('python', ['-m', 'python_engine.service', '--action', 'verified'], {
        cwd: BACKEND_DIR,
        input: inputStr,
        encoding: 'utf8',
        timeout: 4000
      });
      if (res.status === 0 && res.stdout) {
        return JSON.parse(res.stdout.trim());
      }
    } catch (_) {}
  }

  return null;
}

module.exports = {
  isPythonInstalled,
  getPythonHealth,
  runPythonSearch,
  enhanceResultsWithPython,
  getPythonVerifiedAnswer
};

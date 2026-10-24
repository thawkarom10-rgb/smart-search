"""
FastAPI Microservice and CLI Bridge for Python Reliability Engine.
Provides high-availability endpoints for search resilience, trust scoring,
contradiction analysis, and verified answers.
"""

import argparse
import json
import os
import sys
from typing import Dict, List, Optional

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from . import official_data
from . import reliability_scorer
from . import conflict_analyzer
from . import search_resilience
from . import verified_synthesizer

app = FastAPI(
    title="Smart Search v2 Python Reliability Engine",
    description="High-reliability scoring, contradiction detection, and search resilience.",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AnalyzeRequest(BaseModel):
    query: str
    results: List[Dict]

class SearchRequest(BaseModel):
    query: str

class VerifiedRequest(BaseModel):
    query: str
    results: Optional[List[Dict]] = []

def process_search_pipeline(query: str, raw_results: List[Dict]) -> Dict:
    norm_query = (query or '').strip()

    # Prepend official government service if matched
    official = official_data.find_official_service(norm_query) or official_data.detect_official_from_results(norm_query, raw_results)
    working_results = list(raw_results)

    if official:
        official_item = official_data.get_official_search_result_item(official)
        working_results = [
            r for r in working_results
            if (r.get('domain') or '').lower() != (official.get('domain') or '').lower()
        ]
        working_results.insert(0, official_item)

    scored = []
    for r in working_results:
        is_off = bool(r.get('isOfficial'))
        trust = 100 if is_off else reliability_scorer.score_trust(r)
        rel = 100 if is_off else (
            r.get('relevanceScore') if isinstance(r.get('relevanceScore'), (int, float))
            else reliability_scorer.score_relevance(norm_query, r)
        )
        comp = 100 if is_off else reliability_scorer.calculate_composite_score(rel, trust)

        item = dict(r)
        item['trustScore'] = trust
        item['trustLabel'] = 'High' if is_off else reliability_scorer.get_trust_label(trust)
        item['trustBreakdown'] = {
            'domainScore': 25, 'citationScore': 25, 'contentLengthScore': 25, 'recencyScore': 25, 'totalScore': 100
        } if is_off else reliability_scorer.get_score_breakdown(r)
        item['relevanceScore'] = rel
        item['compositeScore'] = comp
        item['isOfficial'] = is_off
        item['sourceName'] = r.get('sourceName') or r.get('domain') or 'Web'
        scored.append(item)

    # Filter non-relevant results
    ranked = [r for r in scored if r.get('relevanceScore', 0) > 0]
    if not ranked:
        ranked = scored

    # Sort descending by composite score
    ranked.sort(key=lambda x: x.get('compositeScore', 0), reverse=True)

    # Detect conflicts
    annotated = conflict_analyzer.detect_conflicts(ranked)

    # Verified answer synthesis
    verified = verified_synthesizer.get_verified_answer(norm_query, annotated)

    return {
        'results': annotated,
        'verified': verified,
        'total': len(annotated),
        'engine': 'Python 3 Reliability Engine'
    }

@app.get('/health')
def health_check():
    return {
        'status': 'ok',
        'engine': 'Python Reliability Engine',
        'pythonVersion': sys.version.split()[0],
        'features': [
            'Connection Pooling & Auto-Retries',
            'Advanced Domain & Academic Trust Scoring',
            'Semantic Stance & Contradiction Detection',
            'Authoritative Public Portals Registry',
            'Verified Answer Synthesis'
        ]
    }

@app.post('/analyze')
def analyze_endpoint(req: AnalyzeRequest):
    return process_search_pipeline(req.query, req.results)

@app.post('/search')
def search_endpoint(req: SearchRequest):
    agg = search_resilience.aggregate_search(req.query)
    return {
        'query': req.query,
        'results': agg['results'],
        'sources': agg['sources'],
        'total': len(agg['results'])
    }

@app.post('/verified')
def verified_endpoint(req: VerifiedRequest):
    return verified_synthesizer.get_verified_answer(req.query, req.results or [])

@app.get('/suggestions')
def suggestions_endpoint(q: str = Query(..., min_length=1)):
    suggestions = search_resilience.fetch_suggestions(q)
    return {'suggestions': suggestions}

def main_cli():
    parser = argparse.ArgumentParser(description="Smart Search v2 Python Reliability Engine CLI")
    parser.add_argument('--serve', action='store_true', help='Run as FastAPI microservice')
    parser.add_argument('--port', type=int, default=int(os.environ.get('PYTHON_ENGINE_PORT', 5001)))
    parser.add_argument('--host', type=str, default='127.0.0.1')
    parser.add_argument('--action', type=str, choices=['analyze', 'search', 'verified', 'health'])
    parser.add_argument('--query', type=str, default='')
    parser.add_argument('--file', type=str, help='Path to JSON input file')

    args = parser.parse_args()

    if args.serve or (not args.action and len(sys.argv) == 1):
        print(f"Starting Python Reliability Engine on http://{args.host}:{args.port}")
        uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
        return

    # CLI / IPC execution
    if args.action == 'health':
        print(json.dumps(health_check()))
        return

    input_data = {}
    if args.file and os.path.exists(args.file):
        with open(args.file, 'r', encoding='utf-8') as f:
            input_data = json.load(f)
    elif not sys.stdin.isatty():
        try:
            stdin_content = sys.stdin.read()
            if stdin_content.strip():
                input_data = json.loads(stdin_content)
        except Exception:
            input_data = {}

    query = args.query or input_data.get('query') or input_data.get('q') or ''

    if args.action == 'search':
        agg = search_resilience.aggregate_search(query)
        print(json.dumps(agg))
    elif args.action == 'analyze':
        results = input_data.get('results', [])
        processed = process_search_pipeline(query, results)
        print(json.dumps(processed))
    elif args.action == 'verified':
        results = input_data.get('results', [])
        verified = verified_synthesizer.get_verified_answer(query, results)
        print(json.dumps(verified))

if __name__ == '__main__':
    main_cli()

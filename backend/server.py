"""
Smart Search v2 — Standalone Python Backend Server.
Provides high-reliability search execution, NLP contradiction detection,
trust verification, LowDB persistence, and serves the web frontend.
"""

from datetime import datetime, timezone
import json
import os
import sys
from typing import Dict, List, Optional

from fastapi import FastAPI, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import uvicorn

from python_engine import official_data
from python_engine import reliability_scorer
from python_engine import conflict_analyzer
from python_engine import search_resilience
from python_engine import verified_synthesizer
from python_engine import db_manager

STATIC_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'frontend', 'public'))
PORT = int(os.environ.get('PORT', 3000))

app = FastAPI(
    title="Smart Search v2 Python Backend",
    description="Full standalone Python backend with high-reliability search & trust scoring",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchQuery(BaseModel):
    q: Optional[str] = ''

def execute_search_pipeline(query: str, force_refresh: bool = False) -> Dict:
    norm_query = (query or '').strip()

    # 1. Cache lookup
    if not force_refresh:
        cached = db_manager.get_cached_results(norm_query)
        if cached:
            return {
                'results': cached,
                'source': 'cache',
                'sources': ['Reliability Cache']
            }

    # 2. Resilient provider aggregation
    agg = search_resilience.aggregate_search(norm_query)
    raw_results = agg.get('results', [])
    sources = agg.get('sources', [])
    source = 'live-web' if raw_results else 'multi-api'

    # 3. Check official portal match
    official = official_data.find_official_service(norm_query) or official_data.detect_official_from_results(norm_query, raw_results)
    if official:
        official_item = official_data.get_official_search_result_item(official)
        raw_results = [
            r for r in raw_results
            if (r.get('domain') or '').lower() != (official.get('domain') or '').lower()
        ]
        raw_results.insert(0, official_item)
        if official.get('portalName') not in sources:
            sources.insert(0, official.get('portalName'))

    # 4. Score trust, relevance, and composite ranking
    scored = []
    for r in raw_results:
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

    # 5. Filter zero relevance
    ranked = [r for r in scored if r.get('relevanceScore', 0) > 0]
    if not ranked:
        ranked = scored

    # 6. Sort descending by composite score
    ranked.sort(key=lambda x: x.get('compositeScore', 0), reverse=True)

    # 7. Deep conflict detection
    annotated = conflict_analyzer.detect_conflicts(ranked)

    # 8. Cache and log
    if annotated:
        db_manager.cache_results(norm_query, annotated)
    db_manager.log_search(norm_query, len(annotated))

    return {
        'results': annotated,
        'source': source,
        'sources': sources
    }

# ── API Routes ────────────────────────────────────────────────────────────────

@app.post('/api/search')
async def post_search(req: Request):
    try:
        body = await req.json()
    except Exception:
        body = {}
    q = body.get('q') or ''
    if not q.strip():
        return JSONResponse({'error': 'Query parameter "q" is required.'}, status_code=400)

    data = execute_search_pipeline(q)
    return {
        'query': q.strip(),
        'results': data['results'],
        'total': len(data['results']),
        'searchSource': data['source'],
        'sources': data['sources'],
        'demoMode': False,
        'engine': 'Python 3 Backend'
    }

@app.get('/api/search')
def get_search(q: str = Query('', min_length=0)):
    if not q.strip():
        return JSONResponse({'error': 'Query parameter "q" is required.'}, status_code=400)

    data = execute_search_pipeline(q)
    return {
        'query': q.strip(),
        'results': data['results'],
        'total': len(data['results']),
        'searchSource': data['source'],
        'sources': data['sources'],
        'demoMode': False,
        'engine': 'Python 3 Backend'
    }

@app.get('/api/verified')
def get_verified(q: str = Query('', min_length=0)):
    if not q.strip():
        return JSONResponse({'error': 'Query parameter "q" is required.'}, status_code=400)

    data = execute_search_pipeline(q)
    answer = verified_synthesizer.get_verified_answer(q.strip(), data['results'])
    return answer

@app.get('/api/suggestions')
def get_suggestions(q: str = Query('', min_length=0)):
    if not q.strip():
        return {'suggestions': []}

    history_suggestions = db_manager.get_suggestions(q)
    live_suggestions = search_resilience.fetch_suggestions(q)

    examples = [
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
    ]
    p_lower = q.lower().strip()
    example_matches = [e for e in examples if e.startswith(p_lower)]

    merged = []
    seen = set()
    for item in (history_suggestions + live_suggestions + example_matches):
        s = item.strip()
        if s and s not in seen:
            seen.add(s)
            merged.append(s)

    return {'suggestions': merged[:8]}

@app.get('/api/history')
def get_history():
    return {'history': db_manager.get_history()}

@app.delete('/api/history/{entry_id}')
def delete_single_history(entry_id: str):
    db_manager.delete_history(entry_id)
    return {'message': 'History entry deleted.'}

@app.delete('/api/history')
def clear_all_history():
    db_manager.clear_history()
    return {'message': 'History cleared.'}

@app.get('/api/stats')
def get_stats():
    return db_manager.get_stats()

@app.post('/api/seed')
def seed_demo_data():
    return {'message': 'Demo data seeded.', 'count': 0}

@app.get('/api/health')
def health_endpoint():
    active_providers = [
        'DuckDuckGo Instant Answers',
        'Wikipedia REST API',
        'Hacker News Algolia',
        'Crossref Academic DOI',
        'ArXiv Preprints',
        'Google & DDG Autocomplete Suggest',
        'Python High-Reliability Scoring Engine'
    ]
    return {
        'status': 'ok',
        'backend': 'Python 3 High-Reliability Backend',
        'pythonVersion': sys.version.split()[0],
        'demoMode': False,
        'activeProviders': active_providers,
        'totalProviders': len(active_providers),
        'timestamp': datetime.now(timezone.utc).isoformat()
    }

# ── Static Frontend Serving ───────────────────────────────────────────────────

if os.path.exists(STATIC_DIR):
    app.mount('/', StaticFiles(directory=STATIC_DIR, html=True), name='frontend')

def main():
    print('')
    print('  Smart Search v2 (Python 3 Reliability Backend)')
    print('  ──────────────────────────────────────────────────────────')
    print(f'  Server running at http://localhost:{PORT}')
    print(f'  Python Version: {sys.version.split()[0]}')
    print('  Features: Resilient Networking, NLP Contradiction Detection,')
    print('            Authoritative Portals, Auto-Retries, Thread Pooling')
    print('  ──────────────────────────────────────────────────────────')
    print('')
    uvicorn.run(app, host='0.0.0.0', port=PORT, log_level='info')

if __name__ == '__main__':
    main()

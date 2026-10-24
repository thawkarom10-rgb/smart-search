"""
Thread-safe, atomic database manager for db.json.
Compatible with LowDB structure used by Smart Search v2.
"""

from datetime import datetime, timezone, timedelta
import json
import os
import threading
from typing import Dict, List, Optional

DB_FILE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'db.json'))
CACHE_TTL_HOURS = 1
_lock = threading.Lock()

def _ensure_db_exists():
    if not os.path.exists(DB_FILE_PATH):
        initial = {
            "searchHistory": [],
            "results": [],
            "suggestions": []
        }
        with open(DB_FILE_PATH, 'w', encoding='utf-8') as f:
            json.dump(initial, f, indent=2)

def read_db() -> Dict:
    _ensure_db_exists()
    with _lock:
        try:
            with open(DB_FILE_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if not isinstance(data, dict):
                    data = {}
                data.setdefault('searchHistory', [])
                data.setdefault('results', [])
                data.setdefault('suggestions', [])
                return data
        except Exception:
            return {'searchHistory': [], 'results': [], 'suggestions': []}

def write_db(data: Dict):
    with _lock:
        temp_file = DB_FILE_PATH + '.tmp'
        with open(temp_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        os.replace(temp_file, DB_FILE_PATH)

def log_search(query: str, result_count: int):
    q = (query or '').strip()
    if not q:
        return

    data = read_db()
    entry = {
        'id': int(datetime.now(timezone.utc).timestamp() * 1000),
        'query': q,
        'resultCount': result_count or 0,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    data['searchHistory'].append(entry)

    # Update suggestions
    q_lower = q.lower()
    sugg = next((s for s in data['suggestions'] if s.get('query', '').lower() == q_lower), None)
    if sugg:
        sugg['count'] = (sugg.get('count') or 1) + 1
    else:
        data['suggestions'].append({'query': q_lower, 'count': 1})

    write_db(data)

def get_history() -> List[Dict]:
    data = read_db()
    return list(reversed(data.get('searchHistory', [])))

def delete_history(entry_id):
    data = read_db()
    id_str = str(entry_id)
    data['searchHistory'] = [
        e for e in data['searchHistory']
        if str(e.get('id')) != id_str
    ]
    write_db(data)

def clear_history():
    data = read_db()
    data['searchHistory'] = []
    write_db(data)

def get_suggestions(prefix: str) -> List[str]:
    if not prefix or len(prefix.strip()) < 1:
        return []
    p = prefix.strip().lower()
    data = read_db()
    matching = [
        s for s in data.get('suggestions', [])
        if s.get('query', '').lower().startswith(p)
    ]
    matching.sort(key=lambda s: s.get('count', 1), reverse=True)
    return [s['query'] for s in matching[:8]]

def cache_results(query: str, results: List[Dict]):
    norm_q = (query or '').strip().lower()
    if not norm_q or not results:
        return

    data = read_db()
    data['results'] = [
        r for r in data.get('results', [])
        if (r.get('query') or '').lower() != norm_q
    ]
    data['results'].append({
        'query': query,
        'results': results,
        'sources': getattr(results, 'sources', ['Python Reliability Engine']),
        'source': getattr(results, 'source', 'multi-api'),
        'cachedAt': datetime.now(timezone.utc).isoformat()
    })
    write_db(data)

def get_cached_results(query: str) -> Optional[List[Dict]]:
    norm_q = (query or '').strip().lower()
    if not norm_q:
        return None

    data = read_db()
    entry = next(
        (r for r in data.get('results', []) if (r.get('query') or '').lower() == norm_q),
        None
    )
    if not entry or not entry.get('results'):
        return None

    cached_at_str = entry.get('cachedAt')
    if cached_at_str:
        try:
            cached_dt = datetime.fromisoformat(cached_at_str)
            if cached_dt.tzinfo is None:
                cached_dt = cached_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - cached_dt > timedelta(hours=CACHE_TTL_HOURS):
                return None
        except Exception:
            pass

    return entry['results']

def get_stats() -> Dict:
    data = read_db()
    history = data.get('searchHistory', [])
    total = len(history)
    if total == 0:
        return {
            'totalSearches': 0,
            'uniqueQueries': 0,
            'topQueries': [],
            'recentActivity': []
        }

    counts = {}
    for h in history:
        q = (h.get('query') or '').lower()
        counts[q] = counts.get(q, 0) + 1

    top_queries = sorted(
        [{'query': q, 'count': c} for q, c in counts.items()],
        key=lambda x: x['count'],
        reverse=True
    )[:5]

    now = datetime.now(timezone.utc)
    recent = []
    for i in range(6, -1, -1):
        day = (now - timedelta(days=i)).strftime('%Y-%m-%d')
        cnt = sum(1 for h in history if (h.get('timestamp') or '').startswith(day))
        recent.append({'date': day, 'count': cnt})

    return {
        'totalSearches': total,
        'uniqueQueries': len(counts),
        'topQueries': top_queries,
        'recentActivity': recent
    }

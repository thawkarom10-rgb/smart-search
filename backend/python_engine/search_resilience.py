"""
Resilient Search Engine Client for Python Backend.
Provides connection pooling, automated retry logic, exponential backoff,
concurrent provider queries, and graceful degradation.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import html
import re
from typing import Dict, List, Optional
from urllib.parse import urlparse, quote

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

REQUEST_TIMEOUT = 4.5  # seconds

def create_resilient_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=2,
        backoff_factor=0.3,
        status_forcelist=[429, 500, 502, 503, 504],
        raise_on_status=False
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=15, pool_maxsize=25)
    session.mount('https://', adapter)
    session.mount('http://', adapter)
    session.headers.update({
        'User-Agent': 'SmartSearchV2-ReliabilityEngine/2.0 (Resilient Educational Research Client)'
    })
    return session

session = create_resilient_session()

def clean_text(text: str) -> str:
    if not text or not isinstance(text, str):
        return ""
    no_html = re.sub(r'<[^>]+>', '', text)
    unescaped = html.unescape(no_html)
    return re.sub(r'\s+', ' ', unescaped).strip()

def extract_domain(url_str: str) -> str:
    try:
        parsed = urlparse(url_str)
        host = parsed.netloc or 'web'
        return re.sub(r'^www\.', '', host, flags=re.I)
    except Exception:
        return 'web'

# ── 1. Wikipedia API ───────────────────────────────────────────────────────────

def fetch_wikipedia(query: str) -> List[Dict]:
    try:
        url = 'https://en.wikipedia.org/w/api.php'
        params = {
            'action': 'query',
            'list': 'search',
            'srsearch': query,
            'utf8': '',
            'format': 'json',
            'srlimit': 6
        }
        res = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
        if res.status_code != 200:
            return []
        data = res.json()
        items = data.get('query', {}).get('search', [])
        results = []
        for item in items:
            title = item.get('title', '')
            slug = quote(title.replace(' ', '_'))
            clean_snippet = clean_text(item.get('snippet', ''))
            citations = min(max((item.get('wordcount', 2000) // 400), 3), 10)
            results.append({
                'title': title,
                'url': f'https://en.wikipedia.org/wiki/{slug}',
                'snippet': clean_snippet,
                'domain': 'wikipedia.org',
                'category': 'encyclopedia',
                'sourceName': 'Wikipedia',
                'citations': citations,
                'contentLength': item.get('size', 3500),
                'publishedDate': item.get('timestamp', '')[:10] if item.get('timestamp') else None
            })
        return results
    except Exception:
        return []

# ── 2. DuckDuckGo Instant Answers ─────────────────────────────────────────────

def fetch_duckduckgo_instant(query: str) -> List[Dict]:
    try:
        url = 'https://api.duckduckgo.com/'
        params = {
            'q': query,
            'format': 'json',
            'no_html': 1,
            'skip_disambig': 0
        }
        res = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
        if res.status_code != 200:
            return []
        data = res.json()
        results = []

        if data.get('AbstractText') and data.get('AbstractURL'):
            results.append({
                'title': data.get('Heading') or query,
                'url': data['AbstractURL'],
                'snippet': clean_text(data['AbstractText']),
                'domain': extract_domain(data['AbstractURL']),
                'category': 'web',
                'sourceName': data.get('AbstractSource') or 'DuckDuckGo Knowledge',
                'citations': 6,
                'contentLength': len(data['AbstractText']),
                'publishedDate': datetime.now(timezone.utc).strftime('%Y-%m-%d')
            })

        for topic in data.get('RelatedTopics', []):
            if 'Text' in topic and 'FirstURL' in topic and len(results) < 5:
                text = topic['Text']
                title_part = text.split(' - ')[0] if ' - ' in text else text[:50]
                results.append({
                    'title': clean_text(title_part),
                    'url': topic['FirstURL'],
                    'snippet': clean_text(text),
                    'domain': extract_domain(topic['FirstURL']),
                    'category': 'web',
                    'sourceName': 'DuckDuckGo',
                    'citations': 3,
                    'contentLength': len(text),
                    'publishedDate': datetime.now(timezone.utc).strftime('%Y-%m-%d')
                })
        return results
    except Exception:
        return []

# ── 3. Hacker News Algolia API ────────────────────────────────────────────────

def fetch_hackernews(query: str) -> List[Dict]:
    try:
        url = 'https://hn.algolia.com/api/v1/search'
        params = {'query': query, 'tags': 'story', 'hitsPerPage': 4}
        res = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
        if res.status_code != 200:
            return []
        data = res.json()
        hits = data.get('hits', [])
        results = []
        for hit in hits:
            title = hit.get('title') or ''
            hit_url = hit.get('url') or f"https://news.ycombinator.com/item?id={hit.get('objectID')}"
            points = hit.get('points', 0)
            comments = hit.get('num_comments', 0)
            snippet = f"Discussion on Hacker News with {points} points and {comments} comments."
            results.append({
                'title': title,
                'url': hit_url,
                'snippet': snippet,
                'domain': extract_domain(hit_url),
                'category': 'discussion',
                'sourceName': 'Hacker News',
                'citations': min(max(comments // 10, 1), 8),
                'contentLength': 1200,
                'publishedDate': hit.get('created_at', '')[:10] if hit.get('created_at') else None
            })
        return results
    except Exception:
        return []

# ── 4. Crossref Academic Works ────────────────────────────────────────────────

def fetch_crossref(query: str) -> List[Dict]:
    try:
        url = 'https://api.crossref.org/works'
        params = {
            'query': query,
            'rows': 4,
            'select': 'title,URL,publisher,DOI,is-referenced-by-count,abstract,published'
        }
        res = session.get(url, params=params, timeout=REQUEST_TIMEOUT)
        if res.status_code != 200:
            return []
        data = res.json()
        items = data.get('message', {}).get('items', [])
        results = []
        for item in items:
            title_list = item.get('title', [])
            title = title_list[0] if title_list else 'Academic Paper'
            abstract = item.get('abstract') or f"Published by {item.get('publisher', 'Academic Press')}."
            doi_url = item.get('URL') or f"https://doi.org/{item.get('DOI')}"
            citations = item.get('is-referenced-by-count', 4)
            results.append({
                'title': clean_text(title),
                'url': doi_url,
                'snippet': clean_text(abstract),
                'domain': 'crossref.org',
                'category': 'academic',
                'sourceName': 'Crossref Academic',
                'citations': min(max(citations, 3), 10),
                'contentLength': 3000,
                'publishedDate': None
            })
        return results
    except Exception:
        return []

# ── 5. ArXiv Preprints ────────────────────────────────────────────────────────

def fetch_arxiv(query: str) -> List[Dict]:
    try:
        clean_q = re.sub(r'[^\w\s]', '', query).strip().replace(' ', '+')
        url = f"https://export.arxiv.org/api/query?search_query=all:{clean_q}&start=0&max_results=3"
        res = session.get(url, timeout=REQUEST_TIMEOUT)
        if res.status_code != 200:
            return []
        
        results = []
        entries = re.findall(r'<entry>(.*?)</entry>', res.text, re.DOTALL)
        for entry in entries:
            title_m = re.search(r'<title>(.*?)</title>', entry, re.DOTALL)
            summary_m = re.search(r'<summary>(.*?)</summary>', entry, re.DOTALL)
            id_m = re.search(r'<id>(.*?)</id>', entry, re.DOTALL)
            pub_m = re.search(r'<published>(.*?)</published>', entry, re.DOTALL)

            title = clean_text(title_m.group(1)) if title_m else 'ArXiv Research Paper'
            summary = clean_text(summary_m.group(1)) if summary_m else ''
            arxiv_url = id_m.group(1).strip() if id_m else 'https://arxiv.org'
            pub_date = pub_m.group(1)[:10] if pub_m else None

            results.append({
                'title': title,
                'url': arxiv_url,
                'snippet': summary[:400] + '...' if len(summary) > 400 else summary,
                'domain': 'arxiv.org',
                'category': 'academic',
                'sourceName': 'ArXiv Preprints',
                'citations': 7,
                'contentLength': len(summary) * 3,
                'publishedDate': pub_date
            })
        return results
    except Exception:
        return []

# ── 6. Autocomplete Suggestions ───────────────────────────────────────────────

def fetch_suggestions(prefix: str) -> List[str]:
    if not prefix or len(prefix.strip()) < 1:
        return []
    p = prefix.strip()
    suggestions = set()

    # Google suggest
    try:
        url = 'https://suggestqueries.google.com/complete/search'
        params = {'client': 'firefox', 'q': p}
        r = session.get(url, params=params, timeout=2.0)
        if r.status_code == 200:
            data = r.json()
            if len(data) > 1 and isinstance(data[1], list):
                for s in data[1][:6]:
                    suggestions.add(str(s).lower())
    except Exception:
        pass

    # DuckDuckGo suggest
    try:
        url = 'https://duckduckgo.com/ac/'
        params = {'q': p, 'type': 'list'}
        r = session.get(url, params=params, timeout=2.0)
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, list):
                for item in data[:6]:
                    phrase = item.get('phrase') if isinstance(item, dict) else str(item)
                    if phrase:
                        suggestions.add(phrase.lower())
    except Exception:
        pass

    return list(suggestions)[:8]

# ── Concurrent Aggregator ─────────────────────────────────────────────────────

def aggregate_search(query: str, config: Optional[Dict] = None) -> Dict:
    results = []
    sources = []

    providers = [
        ('Wikipedia', fetch_wikipedia),
        ('DuckDuckGo Instant', fetch_duckduckgo_instant),
        ('Hacker News', fetch_hackernews),
        ('Crossref', fetch_crossref),
        ('ArXiv', fetch_arxiv),
    ]

    with ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {executor.submit(fn, query): name for name, fn in providers}
        for future in as_completed(future_map):
            name = future_map[future]
            try:
                items = future.result()
                if items:
                    results.extend(items)
                    sources.append(name)
            except Exception:
                pass

    # Deduplicate by URL or normalized Title
    seen_urls = set()
    deduped = []
    for r in results:
        url = r.get('url') or ''
        title = (r.get('title') or '').lower().strip()
        key = url if url else title
        if key and key not in seen_urls:
            seen_urls.add(key)
            deduped.append(r)

    return {
        'results': deduped,
        'sources': sources
    }

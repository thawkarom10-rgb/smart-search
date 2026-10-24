"""
Verified Answer Synthesizer for Python Reliability Engine.
Extracts authoritative answers, official service portals, and synthesized summaries.
"""

import re
from typing import Dict, List, Optional

from . import official_data
from . import reliability_scorer

def clean_answer_text(text: str) -> str:
    if not text or not isinstance(text, str):
        return ""
    s = text.strip()
    s = re.sub(r'^[.\s,-]+', '', s)

    if not re.search(r'[.!?]$', s):
        last_punc = max(s.rfind('.'), s.rfind('!'), s.rfind('?'))
        if last_punc > 70:
            s = s[:last_punc + 1]
        else:
            s = re.sub(r'[,;:\s-]+$', '', s) + '.'

    if s:
        s = s[0].upper() + s[1:]
    return s

def extract_key_points(text: str) -> List[str]:
    if not text or not isinstance(text, str):
        return []
    sentences = re.split(r'(?<=[.!?])\s+', text)
    cleaned = [s.strip() for s in sentences if 25 < len(s.strip()) < 220]
    return cleaned[:4]

def synthesise(query: str, scored_results: List[Dict]) -> str:
    if not scored_results:
        return 'No information available.'

    relevant = [
        r for r in scored_results
        if (r.get('relevanceScore') if r.get('relevanceScore') is not None
            else reliability_scorer.score_relevance(query, r)) > 0
    ]
    pool = relevant if relevant else scored_results

    sorted_results = sorted(
        pool,
        key=lambda r: (
            r.get('compositeScore') if r.get('compositeScore') is not None
            else reliability_scorer.calculate_composite_score(
                r.get('relevanceScore', 0), r.get('trustScore', 0)
            )
        ),
        reverse=True
    )

    top_snippets = [
        clean_answer_text(r.get('snippet', ''))
        for r in sorted_results[:3]
        if r.get('snippet')
    ]

    return " ".join(top_snippets) if top_snippets else 'No summary available.'

def get_verified_answer(query: str, results: List[Dict]) -> Dict:
    norm_query = (query or '').strip()

    # 1. Check for registered official service
    official = official_data.find_official_service(norm_query) or official_data.detect_official_from_results(norm_query, results)
    if official:
        return {
            'found': True,
            'isOfficial': True,
            'title': official.get('name', 'Official Government Service'),
            'answer': official.get('directAnswer') or official.get('description', ''),
            'description': official.get('description', ''),
            'keyPoints': official.get('keyPoints', []),
            'source': {
                'title': official.get('portalName', 'Official Government Portal'),
                'url': official.get('directServiceUrl') or official.get('url', ''),
                'domain': official.get('domain', ''),
                'sourceName': official.get('badge', 'Official Government Portal')
            },
            'officialPortal': {
                'name': official.get('name', ''),
                'portalName': official.get('portalName', ''),
                'domain': official.get('domain', ''),
                'url': official.get('directServiceUrl') or official.get('url', ''),
                'badge': official.get('badge', 'Official Government Portal'),
                'authority': official.get('authority', '')
            },
            'relatedLinks': official.get('relatedLinks', []),
            'trustScore': 100,
            'trustLabel': 'High',
            'compositeScore': 100,
            'verifiedAt': official.get('authority', 'Government / Authoritative Registry')
        }

    # 2. Check search results
    if not results or len(results) == 0:
        return {
            'found': False,
            'answer': 'No verified answer available for this query.',
            'source': None,
            'trustScore': 0,
            'trustLabel': 'None'
        }

    relevant_results = [
        r for r in results
        if (r.get('relevanceScore') if r.get('relevanceScore') is not None
            else reliability_scorer.score_relevance(norm_query, r)) > 0
    ]
    candidate_pool = relevant_results if relevant_results else results

    non_conflicting = [r for r in candidate_pool if not r.get('conflict')]
    trusted = [r for r in non_conflicting if (r.get('trustScore') or 0) >= 40]
    best_pool = trusted if trusted else (non_conflicting if non_conflicting else candidate_pool)

    best_result = max(
        best_pool,
        key=lambda r: (
            r.get('compositeScore') if r.get('compositeScore') is not None
            else reliability_scorer.calculate_composite_score(
                r.get('relevanceScore', 0), r.get('trustScore', 0)
            )
        )
    )

    summary = clean_answer_text(best_result.get('snippet') or best_result.get('title') or '')
    key_points = extract_key_points(summary)

    if not key_points and len(summary) > 60:
        key_points = [summary]

    return {
        'found': True,
        'isOfficial': bool(best_result.get('isOfficial')),
        'title': best_result.get('title', ''),
        'answer': summary,
        'description': summary,
        'keyPoints': key_points,
        'source': {
            'title': best_result.get('title', ''),
            'url': best_result.get('url', ''),
            'domain': best_result.get('domain', ''),
            'sourceName': best_result.get('sourceName', '')
        },
        'officialPortal': None,
        'relatedLinks': [],
        'trustScore': best_result.get('trustScore', 50),
        'trustLabel': best_result.get('trustLabel') or reliability_scorer.get_trust_label(best_result.get('trustScore', 50)),
        'compositeScore': best_result.get('compositeScore', 50),
        'verifiedAt': f"{best_result.get('sourceName') or best_result.get('domain')} Verified Pipeline"
    }

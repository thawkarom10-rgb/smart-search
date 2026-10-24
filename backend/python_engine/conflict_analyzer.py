"""
Semantic Conflict and Contradiction Analyzer for Smart Search v2.
Identifies contradictory scientific or empirical claims across search results
while handling negations and preserving official source integrity.
"""

import re
from typing import List, Dict, Set

STOP_WORDS = {
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'to', 'of', 'and', 'or', 'in', 'it', 'this', 'that', 'for', 'with',
    'on', 'at', 'by', 'from', 'as', 'but', 'not', 'so', 'if', 'do',
    'did', 'does', 'have', 'has', 'had', 'will', 'would', 'could', 'should',
    'may', 'might', 'can', 'about', 'more', 'also', 'than', 'into', 'its',
    'their', 'they', 'he', 'she', 'we', 'you', 'i', 'me', 'him', 'her',
    'us', 'them', 'my', 'your', 'his', 'our', 'up', 'out', 'no', 'new',
    'some', 'what', 'which', 'who', 'when', 'where', 'how', 'all',
    'after', 'before', 'during', 'each', 'such', 'through', 'while', 'one',
    'two', 'three', 'many', 'most', 'other', 'over', 'between', 'both'
}

POSITIVE_SIGNALS = [
    'effective', 'proven', 'safe', 'beneficial', 'recommended', 'confirmed',
    'supported', 'true', 'accurate', 'works', 'validated', 'demonstrated',
    'successful', 'helps', 'improves', 'boosts', 'increases', 'protects',
    'cures', 'treats', 'reliable', 'trustworthy', 'evidence', 'scientific',
    'study shows', 'research confirms', 'experts agree', 'consensus'
]

NEGATIVE_SIGNALS = [
    'ineffective', 'debunked', 'dangerous', 'harmful', 'not recommended', 'denied',
    'disputed', 'false', 'inaccurate', 'fails', 'invalidated', 'disproven',
    'unsuccessful', 'hurts', 'worsens', 'decreases', 'risks', 'damages',
    'toxic', 'unproven', 'unreliable', 'untrustworthy', 'myth', 'misleading',
    'study refutes', 'research denies', 'experts disagree', 'controversy',
    'not proven', 'not effective', 'no evidence'
]

OVERLAP_THRESHOLD = 0.28

def extract_keywords(snippet: str) -> Set[str]:
    if not snippet or not isinstance(snippet, str):
        return set()
    words = re.findall(r'[a-zA-Z0-9]+', snippet.lower())
    return {w for w in words if len(w) > 2 and w not in STOP_WORDS}

def overlap_ratio(set_a: Set[str], set_b: Set[str]) -> float:
    if not set_a or not set_b:
        return 0.0
    shared = len(set_a & set_b)
    return shared / min(len(set_a), len(set_b))

def analyze_stance(snippet: str) -> Dict[str, list]:
    if not snippet or not isinstance(snippet, str):
        return {'positive': [], 'negative': []}

    lower = snippet.lower()
    
    pos_matches = [sig for sig in POSITIVE_SIGNALS if sig in lower]
    neg_matches = [sig for sig in NEGATIVE_SIGNALS if sig in lower]

    # Negation handling adjustments
    # e.g., "no evidence of danger" / "not harmful"
    if 'not harmful' in lower or 'not dangerous' in lower or 'no evidence of harm' in lower or 'safe' in pos_matches:
        neg_matches = [m for m in neg_matches if m not in ['harmful', 'dangerous', 'no evidence']]
        if 'safe' not in pos_matches:
            pos_matches.append('safe (not harmful)')

    if 'not safe' in lower or 'not effective' in lower or 'not beneficial' in lower:
        pos_matches = [m for m in pos_matches if m not in ['safe', 'effective', 'beneficial']]
        if 'not safe' in lower and 'dangerous' not in neg_matches:
            neg_matches.append('not safe')
        if 'not effective' in lower and 'ineffective' not in neg_matches:
            neg_matches.append('not effective')

    return {'positive': pos_matches, 'negative': neg_matches}

def detect_conflicts(results: List[Dict]) -> List[Dict]:
    if not results or not isinstance(results, list):
        return []

    # Clone items and preserve official exclusion
    annotated = []
    for r in results:
        copy_r = dict(r)
        copy_r['conflict'] = False
        copy_r['conflictReason'] = ''
        annotated.append(copy_r)

    keyword_sets = [extract_keywords(r.get('snippet', '') + ' ' + r.get('title', '')) for r in annotated]
    stances = [analyze_stance(r.get('snippet', '') + ' ' + r.get('title', '')) for r in annotated]

    n = len(annotated)
    for i in range(n):
        if annotated[i].get('isOfficial'):
            continue

        stance_a = stances[i]
        is_pos_a = len(stance_a['positive']) > 0 and len(stance_a['negative']) == 0
        is_neg_a = len(stance_a['negative']) > 0 and len(stance_a['positive']) == 0

        if not is_pos_a and not is_neg_a:
            continue

        for j in range(i + 1, n):
            if annotated[j].get('isOfficial'):
                continue

            stance_b = stances[j]
            is_pos_b = len(stance_b['positive']) > 0 and len(stance_b['negative']) == 0
            is_neg_b = len(stance_b['negative']) > 0 and len(stance_b['positive']) == 0

            if not is_pos_b and not is_neg_b:
                continue

            # Check if one is positive and the other is negative
            opposing = (is_pos_a and is_neg_b) or (is_neg_a and is_pos_b)
            if not opposing:
                continue

            # Check if they discuss the same core topic
            ratio = overlap_ratio(keyword_sets[i], keyword_sets[j])
            if ratio >= OVERLAP_THRESHOLD:
                pos_signals = (stance_a['positive'] if is_pos_a else stance_b['positive'])[:2]
                neg_signals = (stance_a['negative'] if is_neg_a else stance_b['negative'])[:2]

                reason_a = f'Contradictory finding: Claims "{", ".join(stance_a["positive"] or stance_a["negative"])}" vs opposing evidence.'
                reason_b = f'Contradictory finding: Claims "{", ".join(stance_b["positive"] or stance_b["negative"])}" vs opposing evidence.'

                annotated[i]['conflict'] = True
                annotated[i]['conflictReason'] = reason_a

                annotated[j]['conflict'] = True
                annotated[j]['conflictReason'] = reason_b

    return annotated

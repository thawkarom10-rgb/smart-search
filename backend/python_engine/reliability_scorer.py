"""
Reliability and Relevance Scorer for Smart Search v2.
Evaluates trust factors (domain, citations, content depth, recency)
and semantic relevance to deliver robust composite scoring.
"""

from datetime import datetime, timezone
import math
import re

STOP_WORDS = {
    'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'in', 'on', 'at', 'to', 'for', 'with', 'about', 'against',
    'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'from', 'up', 'down', 'of', 'off', 'over', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
    'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
    's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'what', 'which',
    'who', 'whom', 'this', 'that', 'these', 'those', 'am', 'it', 'its', 'tell',
    'me', 'give', 'show', 'explain', 'meaning', 'means', 'definition', 'define',
    'find', 'look', 'search', 'like'
}

SYNONYMS = {
    'ai': ['artificial intelligence', 'machine learning', 'neural network'],
    'ml': ['machine learning', 'artificial intelligence'],
    'covid': ['coronavirus', 'covid-19', 'sars-cov-2', 'pandemic', 'vaccine'],
    'vaccine': ['vaccination', 'immunization', 'vaccines', 'antibodies'],
    'climate': ['global warming', 'greenhouse', 'emissions', 'temperature'],
    'internet': ['arpanet', 'web', 'world wide web', 'online', 'network'],
    'india': ['indian', 'bharat', 'delhi', 'asia'],
    'japan': ['japanese', 'tokyo'],
    'driving': ['driver', 'drivers', 'drive', 'vehicle', 'motor', 'rto', 'dl', 'licence', 'license', 'parivahan'],
    'driver': ['driving', 'drivers', 'drive', 'motor', 'vehicle', 'licence', 'license'],
    'license': ['licence', 'licenes', 'lisence', 'permit', 'dl', 'authorization'],
    'licence': ['license', 'licenes', 'lisence', 'permit', 'dl', 'authorization'],
    'licenes': ['license', 'licence', 'permit', 'dl'],
    'passport': ['passports', 'travel document', 'visa', 'pcc'],
    'aadhaar': ['aadhar', 'uidai', 'uid', 'myaadhaar'],
    'aadhar': ['aadhaar', 'uidai', 'uid', 'myaadhaar'],
    'pan': ['pancard', 'nsdl', 'uti', 'income tax'],
    'tax': ['taxes', 'taxation', 'incometax', 'itr', 'return'],
    'voter': ['election', 'vote', 'voting', 'epic', 'eci']
}

REPUTABLE_DOMAINS = [
    'wikipedia.org', 'wikinews.org', 'wikidata.org', 'arxiv.org', 'crossref.org',
    'doi.org', 'bbc.com', 'reuters.com', 'britannica.com', 'who.int', 'nasa.gov',
    'cdc.gov', 'ncbi.nlm.nih.gov', 'nature.com', 'nytimes.com', 'theguardian.com',
    'apnews.com', 'khanacademy.org', 'nationalgeographic.com', 'scientificamerican.com',
    'smithsonianmag.com', 'pbs.org', 'npr.org', 'sciencedirect.com', 'ieee.org',
    'acm.org', 'springer.com', 'jstor.org', 'developer.mozilla.org', 'w3.org',
    'github.com', 'stackoverflow.com', 'parivahan.gov.in', 'passportindia.gov.in',
    'uidai.gov.in', 'incometax.gov.in', 'voters.eci.gov.in', 'epfindia.gov.in',
    'digilocker.gov.in', 'irctc.co.in'
]

REPUTABLE_TLDS = ['.gov', '.gov.in', '.nic.in', '.gov.uk', '.gov.au', '.edu', '.int', '.mil']

LOW_QUALITY_DOMAINS = [
    'blogspot.com', 'wordpress.com', 'tumblr.com', 'quora.com',
    'yahoo.answers.com', 'answers.com'
]

def score_domain(result: dict) -> int:
    domain = (result.get('domain') or '').lower()
    url = (result.get('url') or '').lower()
    combined = domain or url

    if result.get('category') == 'academic':
        return 25
    if not combined:
        return 5

    for tld in REPUTABLE_TLDS:
        if tld in combined:
            return 25

    for rep in REPUTABLE_DOMAINS:
        if rep in combined:
            return 25

    for low in LOW_QUALITY_DOMAINS:
        if low in combined:
            return 5

    return 12

def score_citations(result: dict) -> int:
    citations = result.get('citations')
    if not isinstance(citations, (int, float)):
        citations = 0
    return round(min(citations, 5) / 5.0 * 25)

def score_content_length(result: dict) -> int:
    length = result.get('contentLength')
    if not isinstance(length, (int, float)):
        snippet = result.get('snippet') or ''
        length = len(snippet) * 6
    return round(min(length, 2000) / 2000.0 * 25)

def score_recency(result: dict) -> int:
    date_val = result.get('publishedDate')
    if not date_val or not isinstance(date_val, str):
        return 15

    try:
        pub = datetime.fromisoformat(date_val.replace('Z', '+00:00'))
    except Exception:
        try:
            pub = datetime.strptime(date_val[:10], "%Y-%m-%d")
        except Exception:
            return 15

    now = datetime.now(timezone.utc)
    if pub.tzinfo is None:
        pub = pub.replace(tzinfo=timezone.utc)

    diff_days = (now - pub).days

    if diff_days < 0:
        return 20
    if diff_days <= 90:
        return 25
    if diff_days <= 365:
        return 20
    if diff_days <= 730:
        return 15
    if diff_days <= 1825:
        return 10
    return 5

def get_score_breakdown(result: dict) -> dict:
    d = score_domain(result)
    c = score_citations(result)
    cl = score_content_length(result)
    r = score_recency(result)
    total = max(0, min(100, d + c + cl + r))
    return {
        'domainScore': d,
        'citationScore': c,
        'contentLengthScore': cl,
        'recencyScore': r,
        'totalScore': total
    }

def score_trust(result: dict) -> int:
    if result.get('isOfficial'):
        return 100
    bd = get_score_breakdown(result)
    return bd['totalScore']

def get_trust_label(score: int) -> str:
    if score >= 70:
        return 'High'
    if score >= 40:
        return 'Medium'
    return 'Low'

def tokenize(text: str) -> list:
    if not text or not isinstance(text, str):
        return []
    clean = re.sub(r'[^\w\s]', ' ', text.lower())
    return [w for w in clean.split() if w]

def extract_keywords(query: str) -> list:
    tokens = tokenize(query)
    kw = [w for w in tokens if len(w) > 1 and w not in STOP_WORDS]
    return kw if kw else [w for w in tokens if len(w) > 1]

def contains_word_or_phrase(text: str, target: str) -> bool:
    if not text or not target:
        return False
    escaped = re.escape(target.strip())
    pattern = rf'(?:^|\b){escaped}(?:$|\b)'
    return bool(re.search(pattern, text, re.IGNORECASE))

def matches_keyword(token_set: set, raw_text: str, keyword: str) -> bool:
    if keyword in token_set:
        return True
    if contains_word_or_phrase(raw_text, keyword):
        return True
    if len(keyword) > 3:
        stem = keyword[:min(len(keyword) - 1, 5)]
        for t in token_set:
            if len(t) > 3 and t.startswith(stem):
                return True
    syns = SYNONYMS.get(keyword, [])
    for syn in syns:
        if ' ' in syn:
            if contains_word_or_phrase(raw_text, syn):
                return True
        elif syn in token_set:
            return True
    return False

def score_relevance(query: str, result: dict) -> int:
    if not query or not isinstance(query, str):
        return 0
    if result.get('isOfficial'):
        return 100

    q_clean = query.strip().lower()
    keywords = extract_keywords(q_clean)
    if not keywords:
        return 50

    title = result.get('title') or ''
    snippet = result.get('snippet') or ''
    domain = result.get('domain') or ''
    source_name = result.get('sourceName') or ''

    title_clean = title.lower()
    snippet_clean = snippet.lower()
    combined_clean = f"{title_clean} {snippet_clean} {domain.lower()} {source_name.lower()}"

    title_tokens = set(tokenize(title))
    snippet_tokens = set(tokenize(snippet))
    all_tokens = title_tokens | snippet_tokens | set(tokenize(domain)) | set(tokenize(source_name))

    kw_matches = sum(1 for kw in keywords if matches_keyword(all_tokens, combined_clean, kw))
    coverage = kw_matches / len(keywords)

    if coverage == 0:
        return 0

    base_score = coverage * 55

    title_matches = sum(1 for kw in keywords if matches_keyword(title_tokens, title_clean, kw))
    title_boost = (title_matches / len(keywords)) * 25

    phrase_boost = 0
    if len(keywords) > 1:
        if q_clean in title_clean:
            phrase_boost = 20
        elif q_clean in snippet_clean:
            phrase_boost = 15
        else:
            first_two = " ".join(keywords[:2])
            if first_two in combined_clean:
                phrase_boost = 10

    total = round(base_score + title_boost + phrase_boost)
    return max(0, min(100, total))

def calculate_composite_score(relevance: int, trust: int) -> int:
    comp = round((0.55 * relevance) + (0.45 * trust))
    return max(0, min(100, comp))

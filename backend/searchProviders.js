'use strict';

const axios = require('axios');
const relevanceScorer = require('./relevanceScorer');

const REQUEST_TIMEOUT = 4000; // 4 seconds max per provider

/**
 * Clean HTML tags and decode common entities.
 */
function cleanText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Safely extract hostname from URL.
 */
function extractDomain(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./i, '');
  } catch (_) {
    return 'web';
  }
}

// ─── 1. Wikipedia Search API ──────────────────────────────────────────────────

async function fetchWikipedia(query) {
  try {
    const res = await axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        utf8: '',
        format: 'json',
        srlimit: 6
      },
      headers: {
        'User-Agent': 'SmartSearchV2/2.0 (Education; https://github.com/)'
      },
      timeout: REQUEST_TIMEOUT
    });

    const items = res.data?.query?.search || [];
    return items.map(item => {
      const cleanSnippet = cleanText(item.snippet || '');
      const slug = encodeURIComponent((item.title || '').replace(/\s+/g, '_'));
      return {
        title: item.title || '',
        url: `https://en.wikipedia.org/wiki/${slug}`,
        snippet: cleanSnippet,
        domain: 'wikipedia.org',
        category: 'encyclopedia',
        sourceName: 'Wikipedia',
        citations: Math.min(Math.max(Math.floor((item.wordcount || 2000) / 400), 3), 10),
        contentLength: item.size || 3500,
        publishedDate: item.timestamp ? item.timestamp.slice(0, 10) : null
      };
    });
  } catch (err) {
    return [];
  }
}

// ─── 2. DuckDuckGo Instant Answer API ─────────────────────────────────────────

async function fetchDuckDuckGoInstant(query) {
  try {
    const res = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 0
      },
      timeout: REQUEST_TIMEOUT
    });

    const data = res.data || {};
    const results = [];

    // Main abstract if available
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: cleanText(data.AbstractText),
        domain: extractDomain(data.AbstractURL),
        category: 'web',
        sourceName: 'DuckDuckGo Instant',
        citations: 3,
        contentLength: (data.AbstractText || '').length * 8,
        publishedDate: null
      });
    }

    // Related topics
    const topics = data.RelatedTopics || [];
    for (const topic of topics) {
      if (results.length >= 6) break;

      if (topic.FirstURL && topic.Text) {
        results.push({
          title: cleanText(topic.Text.split(' - ')[0] || topic.Text.slice(0, 60)),
          url: topic.FirstURL,
          snippet: cleanText(topic.Text),
          domain: extractDomain(topic.FirstURL),
          category: 'web',
          sourceName: 'DuckDuckGo Instant',
          citations: 2,
          contentLength: topic.Text.length * 6,
          publishedDate: null
        });
      } else if (Array.isArray(topic.Topics)) {
        for (const sub of topic.Topics) {
          if (results.length >= 6) break;
          if (sub.FirstURL && sub.Text) {
            results.push({
              title: cleanText(sub.Text.split(' - ')[0] || sub.Text.slice(0, 60)),
              url: sub.FirstURL,
              snippet: cleanText(sub.Text),
              domain: extractDomain(sub.FirstURL),
              category: 'web',
              sourceName: 'DuckDuckGo Instant',
              citations: 2,
              contentLength: sub.Text.length * 6,
              publishedDate: null
            });
          }
        }
      }
    }

    return results;
  } catch (err) {
    return [];
  }
}

// ─── 2b. DuckDuckGo Lite Web Search API ──────────────────────────────────────

async function fetchDuckDuckGoLite(query) {
  try {
    const res = await axios.post(
      'https://lite.duckduckgo.com/lite/',
      new URLSearchParams({ q: query }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: REQUEST_TIMEOUT
      }
    );

    const html = res.data || '';
    if (typeof html !== 'string') return [];

    const regex = /<a[^>]+href=['"]([^'"]+)['"][^>]*class=['"]result-link['"][^>]*>([\s\S]*?)<\/a>[\s\S]*?<td[^>]*class=['"]result-snippet['"][^>]*>([\s\S]*?)<\/td>/gi;
    const results = [];
    let match;

    while ((match = regex.exec(html)) !== null && results.length < 8) {
      let rawUrl = match[1];
      const uddgMatch = /uddg=([^&]+)/i.exec(rawUrl);
      let cleanUrl = uddgMatch ? decodeURIComponent(uddgMatch[1]) : rawUrl;
      if (cleanUrl.startsWith('//')) cleanUrl = 'https:' + cleanUrl;

      const title = cleanText(match[2]);
      const snippet = cleanText(match[3]);

      if (title && cleanUrl.startsWith('http')) {
        results.push({
          title: title,
          url: cleanUrl,
          snippet: snippet,
          domain: extractDomain(cleanUrl),
          category: 'web',
          sourceName: 'DuckDuckGo',
          citations: 3,
          contentLength: snippet.length * 8,
          publishedDate: null
        });
      }
    }

    return results;
  } catch (err) {
    return [];
  }
}

// ─── 3. Hacker News (Algolia Search) ──────────────────────────────────────────

async function fetchHackerNews(query) {
  try {
    const res = await axios.get('https://hn.algolia.com/api/v1/search', {
      params: {
        query: query,
        hitsPerPage: 6
      },
      timeout: REQUEST_TIMEOUT
    });

    const hits = res.data?.hits || [];
    return hits
      .filter(h => h.title)
      .map(item => {
        const itemUrl = item.url || `https://news.ycombinator.com/item?id=${item.objectID}`;
        const domain = extractDomain(itemUrl);
        const snippetText = item.story_text || item.comment_text || `Discussion with ${item.points || 0} points and ${item.num_comments || 0} comments on Hacker News.`;
        return {
          title: item.title,
          url: itemUrl,
          snippet: cleanText(snippetText),
          domain: domain,
          category: 'tech',
          sourceName: 'Hacker News',
          citations: Math.min(Math.floor((item.points || 0) / 25), 8),
          contentLength: Math.max((item.num_comments || 0) * 100, 800),
          publishedDate: item.created_at ? item.created_at.slice(0, 10) : null
        };
      });
  } catch (err) {
    return [];
  }
}

// ─── 4. Crossref (Academic & Research Papers) ─────────────────────────────────

async function fetchCrossref(query) {
  try {
    const res = await axios.get('https://api.crossref.org/works', {
      params: {
        query: query,
        rows: 5
      },
      headers: {
        'User-Agent': 'SmartSearchV2/2.0 (mailto:academic-search@smartsearch.local)'
      },
      timeout: REQUEST_TIMEOUT
    });

    const items = res.data?.message?.items || [];
    return items.map(item => {
      const rawTitle = Array.isArray(item.title) ? item.title[0] : (item.title || 'Research Paper');
      const doiUrl = item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : 'https://crossref.org');
      const authors = (item.author || []).map(a => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean).slice(0, 3).join(', ');
      const container = Array.isArray(item['container-title']) ? item['container-title'][0] : (item['container-title'] || '');
      const pubYear = item.published?.['date-parts']?.[0]?.[0] || null;

      let snippetParts = [];
      if (item.abstract) {
        snippetParts.push(cleanText(item.abstract));
      } else {
        if (authors) snippetParts.push(`Authors: ${authors}.`);
        if (container) snippetParts.push(`Published in: ${container}.`);
        if (pubYear) snippetParts.push(`Year: ${pubYear}.`);
        if (item.publisher) snippetParts.push(`Publisher: ${item.publisher}.`);
      }

      return {
        title: cleanText(rawTitle),
        url: doiUrl,
        snippet: snippetParts.join(' ') || 'Peer-reviewed academic research publication recorded in Crossref DOI index.',
        domain: 'crossref.org',
        category: 'academic',
        sourceName: 'Crossref Academic',
        citations: Math.min(Math.max(item['is-referenced-by-count'] || 3, 2), 15),
        contentLength: 4000,
        publishedDate: pubYear ? `${pubYear}-01-01` : null
      };
    });
  } catch (err) {
    return [];
  }
}

// ─── 5. StackExchange / StackOverflow ─────────────────────────────────────────

async function fetchStackExchange(query) {
  try {
    const res = await axios.get('https://api.stackexchange.com/2.3/search/advanced', {
      params: {
        order: 'desc',
        sort: 'relevance',
        q: query,
        site: 'stackoverflow',
        pagesize: 5,
        filter: '!nNPvSNPXzT'
      },
      timeout: REQUEST_TIMEOUT
    });

    const items = res.data?.items || [];
    return items.map(item => {
      const tags = (item.tags || []).slice(0, 4).join(', ');
      return {
        title: cleanText(item.title || ''),
        url: item.link || 'https://stackoverflow.com',
        snippet: `Stack Overflow question with ${item.score || 0} votes and ${item.answer_count || 0} answers. Tags: [${tags}]. ${item.is_answered ? 'Verified accepted answer available.' : ''}`,
        domain: 'stackoverflow.com',
        category: 'tech',
        sourceName: 'Stack Overflow',
        citations: Math.min(Math.max(item.score || 0, 1), 10),
        contentLength: 2000,
        publishedDate: item.creation_date ? new Date(item.creation_date * 1000).toISOString().slice(0, 10) : null
      };
    });
  } catch (err) {
    return [];
  }
}

// ─── 6. ArXiv (Science & Computer Science Preprints) ──────────────────────────

async function fetchArXiv(query) {
  try {
    const res = await axios.get('https://export.arxiv.org/api/query', {
      params: {
        search_query: `all:${query}`,
        max_results: 5,
        sortBy: 'relevance',
        sortOrder: 'descending'
      },
      timeout: REQUEST_TIMEOUT
    });

    const xml = res.data;
    if (typeof xml !== 'string' || !xml.includes('<entry>')) return [];

    const entries = xml.split('<entry>').slice(1);
    const results = [];

    for (const entry of entries) {
      const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(entry);
      const summaryMatch = /<summary>([\s\S]*?)<\/summary>/i.exec(entry);
      const idMatch = /<id>([\s\S]*?)<\/id>/i.exec(entry);
      const publishedMatch = /<published>([\s\S]*?)<\/published>/i.exec(entry);

      if (titleMatch && idMatch) {
        const title = cleanText(titleMatch[1]);
        const snippet = summaryMatch ? cleanText(summaryMatch[1]).slice(0, 300) : '';
        const url = cleanText(idMatch[1]);
        const date = publishedMatch ? cleanText(publishedMatch[1]).slice(0, 10) : null;

        results.push({
          title: title,
          url: url,
          snippet: snippet,
          domain: 'arxiv.org',
          category: 'academic',
          sourceName: 'ArXiv Preprints',
          citations: 4,
          contentLength: 4500,
          publishedDate: date
        });
      }
    }
    return results;
  } catch (err) {
    return [];
  }
}

// ─── 7. Wikinews Search API ───────────────────────────────────────────────────

async function fetchWikinews(query) {
  try {
    const res = await axios.get('https://en.wikinews.org/w/api.php', {
      params: {
        action: 'query',
        list: 'search',
        srsearch: query,
        format: 'json',
        srlimit: 4
      },
      headers: {
        'User-Agent': 'SmartSearchV2/2.0'
      },
      timeout: REQUEST_TIMEOUT
    });

    const items = res.data?.query?.search || [];
    return items.map(item => {
      const cleanSnippet = cleanText(item.snippet || '');
      const slug = encodeURIComponent((item.title || '').replace(/\s+/g, '_'));
      return {
        title: item.title || '',
        url: `https://en.wikinews.org/wiki/${slug}`,
        snippet: cleanSnippet,
        domain: 'wikinews.org',
        category: 'news',
        sourceName: 'Wikinews',
        citations: 2,
        contentLength: item.size || 2000,
        publishedDate: item.timestamp ? item.timestamp.slice(0, 10) : null
      };
    });
  } catch (err) {
    return [];
  }
}

// ─── 8. Google Custom Search (Key-based) ───────────────────────────────────────

async function fetchGoogle(query, apiKey, searchEngineId) {
  if (!apiKey || !searchEngineId || apiKey === 'your_google_api_key_here') return [];

  try {
    const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: apiKey,
        cx: searchEngineId,
        q: query,
        num: 10
      },
      timeout: REQUEST_TIMEOUT
    });

    const items = res.data.items || [];
    return items.map(item => {
      const pagemap = item.pagemap || {};
      const metatags = (pagemap.metatags || [{}])[0] || {};
      const publishedDate = metatags['article:published_time'] ||
        metatags['og:updated_time'] ||
        metatags['date'] || null;

      return {
        title: item.title || '',
        url: item.link || '',
        snippet: cleanText(item.snippet || ''),
        domain: extractDomain(item.link || ''),
        category: 'web',
        sourceName: 'Google',
        citations: 0,
        contentLength: (item.snippet || '').length * 8,
        publishedDate: publishedDate
      };
    });
  } catch (err) {
    return [];
  }
}

// ─── 9. Brave Search API (Key-based) ──────────────────────────────────────────

async function fetchBraveSearch(query, apiKey) {
  if (!apiKey || apiKey === 'your_brave_api_key_here') return [];

  try {
    const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
      params: { q: query, count: 10 },
      headers: {
        'Accept': 'application/json',
        'X-Subscription-Token': apiKey
      },
      timeout: REQUEST_TIMEOUT
    });

    const items = res.data?.web?.results || [];
    return items.map(item => ({
      title: item.title || '',
      url: item.url || '',
      snippet: cleanText(item.description || ''),
      domain: extractDomain(item.url || ''),
      category: 'web',
      sourceName: 'Brave Search',
      citations: 2,
      contentLength: (item.description || '').length * 8,
      publishedDate: item.page_age ? item.page_age.slice(0, 10) : null
    }));
  } catch (err) {
    return [];
  }
}

// ─── 10. Serper.dev Google Search API (Key-based) ─────────────────────────────

async function fetchSerper(query, apiKey) {
  if (!apiKey || apiKey === 'your_serper_api_key_here') return [];

  try {
    const res = await axios.post('https://google.serper.dev/search', {
      q: query,
      num: 10
    }, {
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
      },
      timeout: REQUEST_TIMEOUT
    });

    const organic = res.data?.organic || [];
    return organic.map(item => ({
      title: item.title || '',
      url: item.link || '',
      snippet: cleanText(item.snippet || ''),
      domain: extractDomain(item.link || ''),
      category: 'web',
      sourceName: 'Google (via Serper)',
      citations: 2,
      contentLength: (item.snippet || '').length * 8,
      publishedDate: item.date || null
    }));
  } catch (err) {
    return [];
  }
}

// ─── 11. Tavily AI Search API (Key-based) ─────────────────────────────────────

async function fetchTavily(query, apiKey) {
  if (!apiKey || apiKey === 'your_tavily_api_key_here') return [];

  try {
    const res = await axios.post('https://api.tavily.com/search', {
      api_key: apiKey,
      query: query,
      search_depth: 'basic',
      max_results: 8
    }, {
      timeout: REQUEST_TIMEOUT
    });

    const items = res.data?.results || [];
    return items.map(item => ({
      title: item.title || '',
      url: item.url || '',
      snippet: cleanText(item.content || ''),
      domain: extractDomain(item.url || ''),
      category: 'web',
      sourceName: 'Tavily AI',
      citations: 3,
      contentLength: (item.content || '').length * 6,
      publishedDate: item.published_date || null
    }));
  } catch (err) {
    return [];
  }
}

// ─── Autocomplete Suggestions (Multi-API) ─────────────────────────────────────

async function fetchAutocompleteSuggestions(prefix) {
  if (!prefix || prefix.trim().length < 1) return [];
  const q = prefix.trim();

  const suggestPromises = [
    // Google Suggest
    axios.get('https://suggestqueries.google.com/complete/search', {
      params: { client: 'firefox', q: q },
      timeout: 2000
    }).then(res => (Array.isArray(res.data?.[1]) ? res.data[1] : [])).catch(() => []),

    // DuckDuckGo Suggest
    axios.get('https://duckduckgo.com/ac/', {
      params: { q: q, type: 'list' },
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 2000
    }).then(res => (Array.isArray(res.data?.[1]) ? res.data[1] : [])).catch(() => []),

    // Wikipedia OpenSearch
    axios.get('https://en.wikipedia.org/w/api.php', {
      params: {
        action: 'opensearch',
        search: q,
        limit: 6,
        namespace: 0,
        format: 'json'
      },
      headers: { 'User-Agent': 'SmartSearchV2/2.0' },
      timeout: 2000
    }).then(res => (Array.isArray(res.data?.[1]) ? res.data[1] : [])).catch(() => [])
  ];

  const results = await Promise.allSettled(suggestPromises);
  const combined = [];
  const seen = new Set();

  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      for (const item of r.value) {
        if (typeof item === 'string' && item.trim()) {
          const lower = item.trim().toLowerCase();
          if (!seen.has(lower)) {
            seen.add(lower);
            combined.push(item.trim());
          }
        }
      }
    }
  }

  return combined.slice(0, 10);
}

// ─── Multi-Provider Aggregator ────────────────────────────────────────────────

/**
 * Run multiple search providers in parallel and combine results.
 * @param {string} query
 * @param {object} config - API keys and options
 * @returns {Promise<{results: object[], sources: string[]}>}
 */
async function aggregateSearch(query, config = {}) {
  const providers = [];

  // Keyed providers (if configured)
  if (config.googleApiKey && config.googleCx) {
    providers.push(fetchGoogle(query, config.googleApiKey, config.googleCx));
  }
  if (config.braveApiKey) {
    providers.push(fetchBraveSearch(query, config.braveApiKey));
  }
  if (config.serperApiKey) {
    providers.push(fetchSerper(query, config.serperApiKey));
  }
  if (config.tavilyApiKey) {
    providers.push(fetchTavily(query, config.tavilyApiKey));
  }

  // Free high-quality live APIs (always run in parallel)
  providers.push(fetchDuckDuckGoLite(query));
  providers.push(fetchWikipedia(query));
  providers.push(fetchDuckDuckGoInstant(query));
  providers.push(fetchHackerNews(query));
  providers.push(fetchCrossref(query));
  providers.push(fetchStackExchange(query));
  providers.push(fetchArXiv(query));
  providers.push(fetchWikinews(query));

  // Run all simultaneously with timeout protection
  const settleResults = await Promise.allSettled(providers);

  const seenUrls = new Set();
  const seenTitles = new Set();
  const rawAggregated = [];
  const successfulSources = new Set();

  for (const settle of settleResults) {
    if (settle.status === 'fulfilled' && Array.isArray(settle.value)) {
      for (const item of settle.value) {
        if (!item.url || !item.title) continue;

        // Clean & normalize URL
        const normalizedUrl = item.url.toLowerCase().replace(/\/+$/, '');
        const normalizedTitle = item.title.toLowerCase().trim();

        if (seenUrls.has(normalizedUrl) || seenTitles.has(normalizedTitle)) {
          continue;
        }

        seenUrls.add(normalizedUrl);
        seenTitles.add(normalizedTitle);

        // Compute relevance score
        const relScore = relevanceScorer.scoreRelevance(query, item);
        const enriched = Object.assign({}, item, {
          relevanceScore: relScore
        });

        rawAggregated.push(enriched);
        if (item.sourceName) {
          successfulSources.add(item.sourceName);
        }
      }
    }
  }

  // Filter out completely irrelevant results (0 keyword matches)
  let filtered = rawAggregated.filter(r => r.relevanceScore > 0);
  // If strict filter removed everything, retain raw aggregated
  if (filtered.length === 0) {
    filtered = rawAggregated;
  }

  // Initial sort by relevance
  filtered.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  return {
    results: filtered,
    sources: Array.from(successfulSources)
  };
}

module.exports = {
  aggregateSearch,
  fetchAutocompleteSuggestions,
  fetchWikipedia,
  fetchDuckDuckGoLite,
  fetchDuckDuckGoInstant,
  fetchHackerNews,
  fetchCrossref,
  fetchStackExchange,
  fetchArXiv,
  fetchWikinews,
  fetchGoogle,
  fetchBraveSearch,
  fetchSerper,
  fetchTavily
};

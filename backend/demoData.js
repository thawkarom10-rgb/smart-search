'use strict';

const relevanceScorer = require('./relevanceScorer');

const today = new Date();
function daysAgo(n) {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

// 10 realistic mock results covering various topics
// Results 0 and 1 are a deliberate CONFLICT PAIR on vaccine effectiveness
const ALL_RESULTS = [
  {
    id: 1,
    title: 'COVID-19 Vaccines: Proven Effective and Safe, Studies Confirm',
    url: 'https://www.cdc.gov/vaccines/covid-19/effectiveness-research/index.html',
    snippet: 'Multiple large-scale clinical trials have confirmed that COVID-19 vaccines are proven effective at preventing severe illness. Studies show the vaccine is safe and beneficial, with widespread consensus among medical experts recommending vaccination for all eligible individuals.',
    domain: 'cdc.gov',
    category: 'academic',
    sourceName: 'CDC Official',
    citations: 8,
    contentLength: 2800,
    publishedDate: daysAgo(15)
  },
  {
    id: 2,
    title: 'Vaccine Effectiveness Disputed and Unproven, Critics Argue',
    url: 'https://randomhealthblog.blogspot.com/2023/vaccines-disputed',
    snippet: 'Some researchers argue that vaccine effectiveness is disputed and unproven for certain populations. Critics claim the data is inaccurate and not recommended without further studies, suggesting the rushed approval process may have been harmful and dangerous for long-term health outcomes.',
    domain: 'blogspot.com',
    category: 'web',
    sourceName: 'Health Blog',
    citations: 0,
    contentLength: 450,
    publishedDate: daysAgo(20)
  },
  {
    id: 3,
    title: 'Climate Change: Causes, Effects and Solutions',
    url: 'https://www.britannica.com/science/climate-change',
    snippet: 'Climate change refers to long-term shifts in global temperatures and weather patterns. While some shifts are natural, since the mid-20th century, human activities — particularly the burning of fossil fuels — have been the main driver of climate change, increasing greenhouse gas concentrations in the atmosphere.',
    domain: 'britannica.com',
    category: 'encyclopedia',
    sourceName: 'Britannica',
    citations: 6,
    contentLength: 3200,
    publishedDate: daysAgo(45)
  },
  {
    id: 4,
    title: 'History of the Internet: From ARPANET to World Wide Web',
    url: 'https://en.wikipedia.org/wiki/History_of_the_Internet',
    snippet: 'The internet originated from ARPANET, a US Department of Defense project in the 1960s. Tim Berners-Lee invented the World Wide Web in 1989, creating the protocol that allowed the internet to become publicly accessible. Today, over 5 billion people use the internet worldwide.',
    domain: 'wikipedia.org',
    category: 'encyclopedia',
    sourceName: 'Wikipedia',
    citations: 7,
    contentLength: 4100,
    publishedDate: daysAgo(120)
  },
  {
    id: 5,
    title: 'Coffee and Health: What Science Says About Your Morning Brew',
    url: 'https://www.reuters.com/business/healthcare-pharmaceuticals/coffee-health-effects-2023',
    snippet: 'Research suggests moderate coffee consumption is beneficial for most adults. Studies have confirmed that coffee drinkers have a lower risk of type 2 diabetes, Parkinson\'s disease, and liver disease. Evidence supports that 2–4 cups per day is generally safe and may improve cognitive function.',
    domain: 'reuters.com',
    category: 'news',
    sourceName: 'Reuters Health',
    citations: 5,
    contentLength: 1800,
    publishedDate: daysAgo(30)
  },
  {
    id: 6,
    title: 'What Is Artificial Intelligence? A Beginner\'s Guide',
    url: 'https://www.khanacademy.org/computing/computers-and-internet/xcae6f4a7ff015e7d:computers/xcae6f4a7ff015e7d:intro-to-ai',
    snippet: 'Artificial intelligence (AI) is the simulation of human intelligence processes by computer systems. Key applications include machine learning, natural language processing, computer vision, and robotics. AI systems learn from data and improve their performance over time without being explicitly programmed.',
    domain: 'khanacademy.org',
    category: 'tech',
    sourceName: 'Khan Academy',
    citations: 4,
    contentLength: 2100,
    publishedDate: daysAgo(60)
  },
  {
    id: 7,
    title: 'How Do Vaccines Work? The Immune System Explained',
    url: 'https://www.who.int/news-room/feature-stories/detail/how-do-vaccines-work',
    snippet: 'Vaccines work by training the immune system to recognize and combat pathogens such as viruses or bacteria. By introducing a weakened or inactivated form of the pathogen, the vaccine stimulates the production of antibodies, creating immunological memory without causing disease.',
    domain: 'who.int',
    category: 'academic',
    sourceName: 'WHO Official',
    citations: 6,
    contentLength: 1900,
    publishedDate: daysAgo(10)
  },
  {
    id: 8,
    title: 'The Science of Sleep: Why We Need 8 Hours',
    url: 'https://www.bbc.com/future/article/20181001-why-do-we-sleep',
    snippet: 'Sleep is essential for health and cognitive function. Research demonstrates that adults need 7–9 hours of quality sleep per night. During sleep, the brain consolidates memories, the body repairs tissues, and the immune system is strengthened. Chronic sleep deprivation increases risk of heart disease and diabetes.',
    domain: 'bbc.com',
    category: 'news',
    sourceName: 'BBC Future',
    citations: 5,
    contentLength: 2300,
    publishedDate: daysAgo(180)
  },
  {
    id: 9,
    title: 'Reddit Thread: My Experience with the New Diet Trend',
    url: 'https://www.reddit.com/r/nutrition/comments/example/my_experience_with_keto',
    snippet: 'I tried the keto diet for 3 months and here\'s what happened. Some people in the comments say it works great for weight loss, others say it completely failed for them. There\'s a lot of mixed opinions in the community about whether this diet is effective long-term.',
    domain: 'reddit.com',
    category: 'web',
    sourceName: 'Reddit Community',
    citations: 0,
    contentLength: 680,
    publishedDate: daysAgo(5)
  },
  {
    id: 10,
    title: 'Space Exploration: NASA\'s Artemis Program and Moon Return',
    url: 'https://www.nasa.gov/artemisprogram',
    snippet: 'NASA\'s Artemis program aims to land the first woman and next man on the Moon by 2026. The program uses the Space Launch System (SLS), the most powerful rocket ever built, and the Orion spacecraft. Artemis represents a new era of lunar exploration with international and commercial partnerships.',
    domain: 'nasa.gov',
    category: 'academic',
    sourceName: 'NASA Official',
    citations: 3,
    contentLength: 1600,
    publishedDate: daysAgo(8)
  }
];

/**
 * Filter demo results by query relevance.
 * Matches title or snippet containing keywords from the query.
 * Only returns results that actually relate to the query.
 * @param {string} query
 * @returns {object[]}
 */
function getDemoResults(query) {
  if (!query || typeof query !== 'string') return ALL_RESULTS.slice(0, 5);

  const trimmed = query.trim();
  if (trimmed.length < 2) return ALL_RESULTS.slice(0, 5);

  // If query explicitly asks for demo/seed, return all
  if (trimmed.toLowerCase().includes('demo')) {
    return ALL_RESULTS.slice();
  }

  const scored = ALL_RESULTS.map(result => {
    const rel = relevanceScorer.scoreRelevance(trimmed, result);
    return {
      result: Object.assign({}, result, { relevanceScore: rel }),
      relevanceScore: rel
    };
  });

  // Only keep results with genuine query relevance
  const matched = scored
    .filter(s => s.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .map(s => s.result);

  return matched;
}

module.exports = ALL_RESULTS;
module.exports.getDemoResults = getDemoResults;
module.exports.ALL_RESULTS = ALL_RESULTS;

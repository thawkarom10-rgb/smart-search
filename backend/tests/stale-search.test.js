'use strict';

const assert = require('assert');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.route('**/api/search', async (route, request) => {
    const raw = request.postData();
    const body = raw ? JSON.parse(raw) : {};
    const query = body.q || '';

    if (query === 'what is climate change') {
      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    await route.continue();
  });

  try {
    await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 20000 });

    await page.fill('#search-input', 'what is climate change');
    await page.click('#search-btn');

    await page.fill('#search-input', 'who invented the internet');
    await page.click('#search-btn');

    await page.waitForFunction(() => {
      const heading = document.querySelector('#results-count-heading')?.textContent || '';
      return heading.includes('who invented the internet');
    }, { timeout: 20000 });

    const finalHeading = await page.textContent('#results-count-heading');
    assert(finalHeading.includes('who invented the internet'), `Expected latest query to remain visible, got: "${finalHeading}"`);
    console.log('stale-search regression test passed');
  } finally {
    await browser.close();
  }
})();

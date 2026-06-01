// Functional coverage for the language auto-detection on the English root "/".
// Deliberately does NOT use the makePage fixture — that pins localStorage to
// suppress the very redirect under test. It still requests the `server` fixture
// so the shared static server is running, then drives its own contexts to
// control navigator.language (via the `locale` option) and the stored preference.

const { test, expect } = require('./fixtures');

const BASE = 'http://localhost:3334';

// Visits "/" with the given browser locale / stored preference and returns the
// URL the page ends up on once the inline auto-detect script has run.
async function landingURL(browser, { locale, pref } = {}) {
	const ctx = await browser.newContext(locale ? { locale } : {});
	const page = await ctx.newPage();
	if (pref) await page.addInitScript((p) => localStorage.setItem('ftg-lang', p), pref);
	await page.goto(`${BASE}/`, { waitUntil: 'load' });
	await page.waitForLoadState('load');
	const url = page.url();
	await ctx.close();
	return url;
}

test.describe('Language auto-detection on /', () => {
	test('German browser locale redirects to /de/', async ({ browser, server: _s }) => {
		expect(await landingURL(browser, { locale: 'de-DE' })).toBe(`${BASE}/de/`);
	});

	test('a stored preference wins and redirects to that locale', async ({ browser, server: _s }) => {
		// Even with an English browser locale, the saved preference takes over
		expect(await landingURL(browser, { locale: 'en-US', pref: 'fr' })).toBe(`${BASE}/fr/`);
	});

	test('English browser locale stays on / (the default page)', async ({ browser, server: _s }) => {
		expect(await landingURL(browser, { locale: 'en-US' })).toBe(`${BASE}/`);
	});

	test('unsupported browser locale stays on /', async ({ browser, server: _s }) => {
		expect(await landingURL(browser, { locale: 'is-IS' })).toBe(`${BASE}/`);
	});
});

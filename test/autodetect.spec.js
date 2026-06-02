// Functional coverage for the language auto-detection on the English root "/".
// Deliberately does NOT use the makePage fixture — that pins localStorage to
// suppress the very redirect under test. It still requests the `serverURL`
// fixture (which starts the worker's server) and drives its own contexts to
// control navigator.language (via the `locale` option) and the stored preference.

const { test, expect } = require('./fixtures');

// Visits "/" with the given browser locale / stored preference and returns the
// URL the page ends up on once the inline auto-detect script has run.
async function landingURL(browser, base, { locale, pref } = {}) {
	const ctx = await browser.newContext(locale ? { locale } : {});
	const page = await ctx.newPage();
	if (pref) await page.addInitScript((p) => localStorage.setItem('ftg-lang', p), pref);
	await page.goto(`${base}/`, { waitUntil: 'load' });
	await page.waitForLoadState('load');
	const url = page.url();
	await ctx.close();
	return url;
}

test.describe('Language auto-detection on /', () => {
	test('German browser locale redirects to /de/', async ({ browser, serverURL }) => {
		expect(await landingURL(browser, serverURL, { locale: 'de-DE' })).toBe(`${serverURL}/de/`);
	});

	test('a stored preference wins and redirects to that locale', async ({ browser, serverURL }) => {
		// Even with an English browser locale, the saved preference takes over
		expect(await landingURL(browser, serverURL, { locale: 'en-US', pref: 'fr' })).toBe(`${serverURL}/fr/`);
	});

	test('English browser locale stays on / (the default page)', async ({ browser, serverURL }) => {
		expect(await landingURL(browser, serverURL, { locale: 'en-US' })).toBe(`${serverURL}/`);
	});

	test('unsupported browser locale stays on /', async ({ browser, serverURL }) => {
		expect(await landingURL(browser, serverURL, { locale: 'is-IS' })).toBe(`${serverURL}/`);
	});
});

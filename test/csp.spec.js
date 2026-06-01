// Every browser test already runs under the production Content-Security-Policy
// (the shared fixture server attaches it to HTML — see fixtures.js). This spec
// adds the explicit guarantee: load representative pages, exercise the dynamic
// paths, and assert the app triggers zero policy violations.

const { test, expect, localeUrl } = require('./fixtures');

// A CSP block fires a securitypolicyviolation event (and, for Trusted Types-style
// failures, throws — caught via pageerror). Console errors are intentionally not
// checked: they include benign noise (e.g. a favicon 404) and every real CSP
// block already surfaces through the two authoritative signals below.
async function collectViolations(page, urlPath, interact) {
	await page.addInitScript(() => {
		window.__csp = [];
		document.addEventListener('securitypolicyviolation', (e) => {
			window.__csp.push(`${e.violatedDirective} :: ${e.blockedURI || e.sample || ''}`);
		});
	});

	const pageErrors = [];
	page.on('pageerror', (e) => pageErrors.push(e.message));

	await page.goto(urlPath, { waitUntil: 'load' });
	await page.waitForSelector('#results.show');
	if (interact) await interact(page);

	return { cspViolations: await page.evaluate(() => window.__csp), pageErrors };
}

test.describe('Content-Security-Policy enforcement', () => {
	test('English page: no violations through calculate + switcher', async ({ makePage }) => {
		const page = await makePage('en');
		const { cspViolations, pageErrors } = await collectViolations(page, localeUrl('en'), async (p) => {
			await p.click('button.calc-btn');       // exercises the innerHTML sink
			await p.click('.lang-trigger');          // opens the language switcher
			await expect(p.locator('.lang-menu')).toBeVisible();
		});

		expect(cspViolations, cspViolations.join('\n')).toHaveLength(0);
		expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
	});

	test('RTL page (ar): no violations', async ({ makePage }) => {
		const page = await makePage('ar');
		const { cspViolations, pageErrors } = await collectViolations(page, localeUrl('ar'), async (p) => {
			await p.click('button.calc-btn');
		});

		expect(cspViolations, cspViolations.join('\n')).toHaveLength(0);
		expect(pageErrors, pageErrors.join('\n')).toHaveLength(0);
	});
});

'use strict';

// Verifies the app runs cleanly under the production Content-Security-Policy,
// including `require-trusted-types-for 'script'`. The shared fixture server in
// fixtures.js does not send security headers, so this spec runs its own server
// that applies the exact CSP shipped in public/_headers.

const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const PUB  = path.join(ROOT, 'public');
const PORT = 3336;

const MIME = {
	'.html': 'text/html;charset=utf-8',
	'.js':   'application/javascript',
	'.json': 'application/json',
	'.svg':  'image/svg+xml',
	'.css':  'text/css',
};

// Pull the exact CSP out of the built _headers so the test can never drift
// from what is actually shipped.
function shippedCSP() {
	const headers = fs.readFileSync(path.join(PUB, '_headers'), 'utf8');
	const m = headers.match(/Content-Security-Policy:\s*(.+)/);
	if (!m) throw new Error('No Content-Security-Policy found in public/_headers');
	return m[1].trim();
}

const CSP = shippedCSP();

let server;

test.beforeAll(() => new Promise((resolve, reject) => {
	server = http.createServer((req, res) => {
		let p = req.url.split('?')[0];
		if (p.endsWith('/')) p += 'index.html';
		try {
			const data = fs.readFileSync(path.join(PUB, p));
			const headers = { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' };
			if (p.endsWith('.html')) headers['Content-Security-Policy'] = CSP;
			res.writeHead(200, headers);
			res.end(data);
		} catch {
			res.writeHead(404);
			res.end();
		}
	});
	server.listen(PORT, resolve).on('error', reject);
}));

test.afterAll(() => new Promise((r) => server.close(r)));

// Loads a page and returns everything that would indicate a CSP / Trusted Types
// failure: fired securitypolicyviolation events, console errors, and page errors.
async function collectViolations(browser, urlPath, interact) {
	const ctx  = await browser.newContext();
	const page = await ctx.newPage();

	// Pin locale so the auto-detect redirect doesn't fire mid-test
	const lang = urlPath === '/' ? 'en' : urlPath.replace(/\//g, '');
	await page.addInitScript((l) => localStorage.setItem('ftg-lang', l), lang);
	await page.addInitScript(() => {
		window.__csp = [];
		document.addEventListener('securitypolicyviolation', (e) => {
			window.__csp.push(`${e.violatedDirective} :: ${e.blockedURI || e.sample || ''}`);
		});
	});

	const errors = [];
	page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
	page.on('pageerror', (e) => errors.push(e.message));

	await page.goto(`http://localhost:${PORT}${urlPath}`, { waitUntil: 'load' });
	await page.waitForSelector('#results.show');
	if (interact) await interact(page);

	const cspViolations = await page.evaluate(() => window.__csp);
	await ctx.close();
	return { cspViolations, errors };
}

// Trusted-Types failures surface as a TypeError mentioning the policy/sink;
// filter console noise down to things that actually indicate a CSP/TT problem.
function securityErrors(errors) {
	return errors.filter((e) =>
		/Trusted|TrustedHTML|TrustedScriptURL|Content Security Policy|Refused to/i.test(e),
	);
}

test.describe('Content-Security-Policy enforcement', () => {
	test('English page: no CSP or Trusted Types violations through calculate + switcher', async ({ browser }) => {
		const { cspViolations, errors } = await collectViolations(browser, '/', async (page) => {
			// Re-run calculate (exercises the innerHTML Trusted Types sink)
			await page.click('button.calc-btn');
			// Open the language switcher dropdown
			await page.click('.lang-trigger');
			await expect(page.locator('.lang-menu')).toBeVisible();
		});

		expect(cspViolations, cspViolations.join('\n')).toHaveLength(0);
		expect(securityErrors(errors), securityErrors(errors).join('\n')).toHaveLength(0);
	});

	test('RTL page (ar): no CSP or Trusted Types violations', async ({ browser }) => {
		const { cspViolations, errors } = await collectViolations(browser, '/ar/', async (page) => {
			await page.click('button.calc-btn');
		});

		expect(cspViolations, cspViolations.join('\n')).toHaveLength(0);
		expect(securityErrors(errors), securityErrors(errors).join('\n')).toHaveLength(0);
	});
});

const { test: base, expect } = require('@playwright/test');
const http = require('node:http');
const fs   = require('node:fs');
const path = require('node:path');

const MIME = {
	'.html': 'text/html;charset=utf-8',
	'.js':   'application/javascript',
	'.json': 'application/json',
	'.svg':  'image/svg+xml',
	'.css':  'text/css',
};

const ROOT    = path.join(__dirname, '..');
const PUBLIC  = path.join(ROOT, 'public');
const PORT    = 3334;

// Locale data is loaded once at module level — tests must run after `npm run publish`
const localesDir = path.join(ROOT, 'src', 'locales');
const LOCALES = fs.readdirSync(localesDir)
	.filter(f => f.endsWith('.json'))
	.map(f => JSON.parse(fs.readFileSync(path.join(localesDir, f), 'utf8')));

// The exact production Content-Security-Policy, pulled from the built _headers so
// every browser test runs with the same policy the deployed site sends. Reading
// it from the artifact keeps the tests in lock-step with what actually ships.
const CSP = (() => {
	const headers = fs.readFileSync(path.join(PUBLIC, '_headers'), 'utf8');
	const m = headers.match(/Content-Security-Policy:\s*(.+)/);
	if (!m) throw new Error('No Content-Security-Policy found in public/_headers');
	return m[1].trim();
})();

function startServer() {
	const server = http.createServer((req, res) => {
		let p = req.url.split('?')[0];
		if (p.endsWith('/')) p += 'index.html';
		// path.join normalizes `..`; confine the result to PUBLIC so a crafted
		// path can't escape the served directory
		const file = path.join(PUBLIC, p);
		if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) {
			res.writeHead(403);
			res.end();
			return;
		}
		try {
			const data = fs.readFileSync(file);
			const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' };
			// Apply the production CSP to HTML so every test exercises it
			if (file.endsWith('.html')) headers['Content-Security-Policy'] = CSP;
			res.writeHead(200, headers);
			res.end(data);
		} catch {
			res.writeHead(404);
			res.end();
		}
	});
	return new Promise((resolve, reject) =>
		server.listen(PORT, () => resolve(server)).on('error', reject),
	);
}

/** Returns the path for a locale: English → '/', others → '/de/' etc. */
function localeUrl(lang) {
	return lang === 'en' ? '/' : `/${lang}/`;
}

const test = base.extend({
	// Static file server — one instance per worker, shared across all tests in the worker
	// biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures require the (fixtures, use) signature; this fixture has no dependencies
	server: [async ({}, use) => {
		const srv = await startServer();
		await use(srv);
		await new Promise(r => srv.close(r));
	}, { scope: 'worker' }],

	/**
	 * Factory fixture: call `await makePage(lang)` to get a Playwright Page that has:
	 * - localStorage pinned to `lang` so the auto-detect script never redirects
	 * - navigator.clipboard stubbed to resolve immediately (no HTTPS/permission needed)
	 * - navigator.share removed so the clipboard branch is always exercised
	 *
	 * All contexts created through this fixture are closed after the test.
	 */
	makePage: async ({ browser, server: _srv }, use) => {
		const ctxs = [];

		const makePage = async (lang = 'en') => {
			const ctx  = await browser.newContext();
			const page = await ctx.newPage();
			await page.addInitScript(`localStorage.setItem('ftg-lang','${lang}')`);
			await page.addInitScript(() => {
				Object.defineProperty(navigator, 'clipboard', {
					value: { writeText: () => Promise.resolve() },
					configurable: true,
				});
				Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
			});
			ctxs.push(ctx);
			return page;
		};

		await use(makePage);
		for (const ctx of ctxs) await ctx.close().catch(() => {});
	},
});

module.exports = { test, expect, LOCALES, localeUrl, CSP };

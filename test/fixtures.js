'use strict';

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

function startServer() {
	const server = http.createServer((req, res) => {
		let p = req.url.split('?')[0];
		if (p.endsWith('/')) p += 'index.html';
		const file = path.join(PUBLIC, p);
		try {
			const data = fs.readFileSync(file);
			res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
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

module.exports = { test, expect, LOCALES, localeUrl };

const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');

const { minify: minifyJS }  = require('terser');
const CleanCSS               = require('clean-css');
const { minify: minifyHTML } = require('html-minifier-terser');

const SRC  = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'public');

// Content-Security-Policy applied to every response (see _headers and Caddyfile).
// 'unsafe-inline' is required because this build deliberately inlines CSS and
// emits per-page inline scripts (window.L, language auto-detect) and inline
// style/onclick attributes.
//
// Trusted Types (require-trusted-types-for) is intentionally NOT used: it blocks
// third-party innerHTML assignments site-wide, which breaks Cloudflare's own
// edge-injected bot-management script (/cdn-cgi/challenge-platform/…) as well as
// Google Translate and DOM-modifying extensions. app.js still escapes its only
// innerHTML sink, so the real XSS surface stays covered.
const CSP = [
	"default-src 'self'",
	"base-uri 'self'",
	"object-src 'none'",
	"frame-ancestors 'none'",
	"form-action 'none'",
	"img-src 'self' data:",
	"style-src 'self' 'unsafe-inline'",
	// static.cloudflareinsights.com serves the Cloudflare Web Analytics beacon
	"script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
	// cloudflareinsights.com receives the Web Analytics RUM beacon
	"connect-src 'self' https://cloudflareinsights.com",
	"worker-src 'self'",
	"manifest-src 'self'",
	"upgrade-insecure-requests",
].join('; ');

// ── Locale loading ────────────────────────────────────────────────────────────

// Right-to-left scripts: Arabic, Hebrew, Urdu, Farsi.
const RTL_LANGS = new Set(['ar', 'he', 'ur', 'fa']);

function loadLocales() {
	const localesDir = path.join(SRC, 'locales');
	return fs.readdirSync(localesDir)
		.filter(f => f.endsWith('.json'))
		.sort((a, b) => {
			// English first so it's the canonical/default
			if (a === 'en.json') return -1;
			if (b === 'en.json') return 1;
			return a.localeCompare(b);
		})
		.map(f => {
			const code = f.replace('.json', '');
			const data = JSON.parse(fs.readFileSync(path.join(localesDir, f), 'utf8'));
			// Derive text direction so every locale has a `dir` for the template.
			data.dir = RTL_LANGS.has(code) ? 'rtl' : 'ltr';
			return { code, data };
		});
}

// ── SEO tag generation ────────────────────────────────────────────────────────

function loadSiteConfig() {
	const cfgPath = path.join(__dirname, 'site.config.json');
	try {
		return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
	} catch (err) {
		throw new Error(`site.config.json: ${err.message}`);
	}
}

function esc(str) {
	return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// `siteBase` is the ROOT canonical URL (e.g. https://fixthatgap.com). hreflang
// alternates are always computed from it, never from the per-locale canonicalUrl
// in `cfg` — otherwise a /ja/ page would emit /ja/de/, /ja/ja/, etc.
function buildSeoTags(cfg, locales, siteBase) {
	const t = [];

	if (cfg.title)        t.push(`<title>${esc(cfg.title)}</title>`);
	if (cfg.description)  t.push(`<meta name="description" content="${esc(cfg.description)}">`);
	if (cfg.author)       t.push(`<meta name="author" content="${esc(cfg.author)}">`);
	if (cfg.keywords)     t.push(`<meta name="keywords" content="${esc(cfg.keywords)}">`);
	if (cfg.canonicalUrl) t.push(`<link rel="canonical" href="${esc(cfg.canonicalUrl)}">`);

	// Open Graph
	if (cfg.title || cfg.description) {
		t.push('<meta property="og:type" content="website">');
		if (cfg.title)        t.push(`<meta property="og:title" content="${esc(cfg.title)}">`);
		if (cfg.description)  t.push(`<meta property="og:description" content="${esc(cfg.description)}">`);
		if (cfg.canonicalUrl) t.push(`<meta property="og:url" content="${esc(cfg.canonicalUrl)}">`);
		if (cfg.ogImage)      t.push(`<meta property="og:image" content="${esc(cfg.ogImage)}">`);
	}

	// Twitter Card
	if (cfg.twitterCard) {
		t.push(`<meta name="twitter:card" content="${esc(cfg.twitterCard)}">`);
		if (cfg.title)       t.push(`<meta name="twitter:title" content="${esc(cfg.title)}">`);
		if (cfg.description) t.push(`<meta name="twitter:description" content="${esc(cfg.description)}">`);
		if (cfg.ogImage)     t.push(`<meta name="twitter:image" content="${esc(cfg.ogImage)}">`);
	}

	// hreflang alternates for all locales — only when a root site base is known
	if (locales && siteBase) {
		const base = siteBase.replace(/\/$/, '');
		for (const locale of locales) {
			const href = locale.code === 'en' ? `${base}/` : `${base}/${locale.code}/`;
			t.push(`<link rel="alternate" hreflang="${esc(locale.code)}" href="${esc(href)}">`);
		}
		t.push(`<link rel="alternate" hreflang="x-default" href="${esc(`${base}/`)}">`);
	}

	return t.join('\n  ');
}

// ── Language switcher HTML ────────────────────────────────────────────────────

// The switcher is a disclosure button revealing a list of navigation links —
// not a value-selection listbox, so it uses a <nav> + plain links rather than
// role="listbox"/role="option" (which would require the option itself to be the
// focusable element). The active link is marked with aria-current="page".
function buildLangSwitcher(locales, currentCode) {
	const current = locales.find(l => l.code === currentCode);
	const label   = current?.data.switchLang || 'Language';

	const items = locales.map(l => {
		const href      = l.code === 'en' ? '/' : `/${l.code}/`;
		const isCurrent = l.code === currentCode;
		const cls       = isCurrent ? 'lang-option lang-option--active' : 'lang-option';
		const ariaCur   = isCurrent ? ' aria-current="page"' : '';
		// l.code is a locale filename (e.g. "de", "pt-br"); JSON.stringify guards
		// the inline handler against any unexpected characters.
		const onclick   = esc(`localStorage.setItem('ftg-lang',${JSON.stringify(l.code)})`);
		return `<li><a href="${esc(href)}" class="${cls}"${ariaCur} onclick="${onclick}">${l.data.flag} ${esc(l.data.langName)}</a></li>`;
	}).join('');

	const trigger = `<button class="lang-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="lang-menu" aria-label="${esc(label)}">${current?.data.flag || ''}<span class="lang-chevron" aria-hidden="true">▾</span></button>`;

	return `<nav class="lang-switcher" aria-label="${esc(label)}">${trigger}<ul id="lang-menu" class="lang-menu">${items}</ul></nav>`;
}

// ── Auto-detect / locale-store scripts ───────────────────────────────────────

function buildAutoDetectScript(nonDefaultCodes) {
	const codes = JSON.stringify(nonDefaultCodes);
	// Runs before page renders: if stored preference is non-English redirect,
	// else if browser language matches a supported locale, store + redirect.
	return `<script>(function(){var p=localStorage.getItem('ftg-lang');if(p&&p!=='en'){location.replace('/'+p+'/');}else if(!p){var l=(navigator.language||'').split('-')[0];var s=${codes};if(s.indexOf(l)>-1){localStorage.setItem('ftg-lang',l);location.replace('/'+l+'/');}}}());</script>`;
}

function buildLocaleStoreScript(code) {
	// Each non-English page stores its lang so future visits to / redirect here.
	return `<script>localStorage.setItem('ftg-lang','${code}');</script>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function contentHash(str) {
	return crypto.createHash('sha256').update(str).digest('hex').slice(0, 8);
}

function kib(str) {
	return `${(Buffer.byteLength(str, 'utf8') / 1024).toFixed(1)} KiB`;
}

function ratio(before, after) {
	const pct = Math.round(100 - (Buffer.byteLength(after) / Buffer.byteLength(before)) * 100);
	return pct >= 0
		? `\x1b[32m-${pct}%\x1b[0m`
		: `\x1b[33m+${-pct}%\x1b[0m`;
}

// ── Substitute {{ KEY }} placeholders with HTML-escaped locale values ───────────

function applyLocale(html, localeData) {
	let out = html;
	for (const [key, value] of Object.entries(localeData)) {
		if (typeof value === 'string') {
			out = out.split(`{{ ${key} }}`).join(esc(value));
		}
	}
	return out;
}

// ── Build ─────────────────────────────────────────────────────────────────────

async function build() {
	const start = Date.now();
	console.log('Building src/ -> public/ ...\n');

	// ── Site config + locales ─────────────────────────────────────────────────
	const siteConfig = loadSiteConfig();
	const locales    = loadLocales();
	console.log(`  site.config.json  loaded (title: "${siteConfig.title || '(none)'}")`);
	console.log(`  locales           ${locales.map(l => l.code).join(', ')}`);

	// Clean and recreate output dir
	fs.rmSync(DIST, { recursive: true, force: true });
	fs.mkdirSync(DIST, { recursive: true });

	// ── CSS (minify, then inline — eliminates the render-blocking request) ────
	const srcCSS = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');
	const cssResult = new CleanCSS({ level: 2 }).minify(srcCSS);
	if (cssResult.errors.length) throw new Error(`CSS:\n${cssResult.errors.join('\n')}`);
	const cssHash = contentHash(cssResult.styles);
	console.log(`  style.css   ${kib(srcCSS)} -> ${kib(cssResult.styles)}  ${ratio(srcCSS, cssResult.styles)}  (inlined)`);

	// ── JS (built once, shared across all locales) ────────────────────────────
	const srcJS = fs.readFileSync(path.join(SRC, 'app.js'), 'utf8');
	const jsResult = await minifyJS(srcJS, {
		compress: { passes: 2 },
		mangle: true,
		format: { comments: false },
	});
	if (!jsResult.code) throw new Error('JS minification produced empty output');
	const jsHash = contentHash(jsResult.code);
	const jsFile = `app.${jsHash}.js`;
	fs.writeFileSync(path.join(DIST, jsFile), jsResult.code);
	console.log(`  app.js      ${kib(srcJS)} -> ${kib(jsResult.code)}  ${ratio(srcJS, jsResult.code)}  -> ${jsFile}`);

	// ── HTML template (load once, then specialise per locale) ─────────────────
	const srcHTML = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
	if (!srcHTML.includes('<!-- %SEO% -->'))         throw new Error('src/index.html missing <!-- %SEO% -->');
	if (!srcHTML.includes('<!-- %AUTO_DETECT% -->')) throw new Error('src/index.html missing <!-- %AUTO_DETECT% -->');
	if (!srcHTML.includes('<!-- %LANG_SWITCHER% -->')) throw new Error('src/index.html missing <!-- %LANG_SWITCHER% -->');
	if (!srcHTML.includes('<!-- %LOCALE% -->'))      throw new Error('src/index.html missing <!-- %LOCALE% -->');

	// Strip dev-only <title> (SEO block provides the real one) and inline CSS
	const htmlBase = srcHTML
		.replace(/<title>[^<]*<\/title>\n?/, '')
		.replace('<link rel="stylesheet" href="style.css">', `<style>${cssResult.styles}</style>`);

	const nonDefaultCodes = locales.filter(l => l.code !== 'en').map(l => l.code);
	// canonicalUrl is optional; when absent there is no root base and per-locale
	// canonical/hreflang tags are simply omitted.
	const base = siteConfig.canonicalUrl ? siteConfig.canonicalUrl.replace(/\/$/, '') : '';

	// Brand shown on the diagrams (tyre sidewall + watermark). Explicit `brand` in
	// site.config.json wins; otherwise fall back to the canonical URL's host.
	let brand = siteConfig.brand || '';
	if (!brand && siteConfig.canonicalUrl) {
		try {
			brand = new URL(siteConfig.canonicalUrl).host;
		} catch {
			brand = '';
		}
	}

	const htmlMinOptions = {
		collapseWhitespace:            true,
		removeComments:                true,
		removeAttributeQuotes:         true,
		removeRedundantAttributes:     true,
		removeScriptTypeAttributes:    true,
		removeStyleLinkTypeAttributes: true,
		minifyCSS:                     true,
		minifyJS:                      true,
		useShortDoctype:               true,
	};

	// ── Per-locale HTML generation ────────────────────────────────────────────
	for (const locale of locales) {
		const L         = locale.data;
		const isDefault = locale.code === 'en';
		const localeDir = isDefault ? DIST : path.join(DIST, locale.code);

		if (!isDefault) fs.mkdirSync(localeDir, { recursive: true });

		// Per-locale SEO config: override title, description, canonical URL.
		// When there is no root base, leave canonicalUrl undefined so no
		// canonical/og:url tag is emitted (rather than a bare relative path).
		const canonicalUrl = base
			? (isDefault ? `${base}/` : `${base}/${locale.code}/`)
			: undefined;
		const localeSEOCfg = { ...siteConfig, title: L.pageTitle, description: L.metaDescription, canonicalUrl };

		const seoTags       = buildSeoTags(localeSEOCfg, locales, base);
		const autoDetect    = isDefault
			? buildAutoDetectScript(nonDefaultCodes)
			: buildLocaleStoreScript(locale.code);
		const langSwitcher  = buildLangSwitcher(locales, locale.code);
		const localeScript  = `<script>window.L=${JSON.stringify(L)};window.SITE=${JSON.stringify({ brand })};</script>`;

		let html = htmlBase;

		// Substitute all {{ KEY }} text placeholders
		html = applyLocale(html, L);

		// Inject block placeholders
		html = html
			.replace('<!-- %SEO% -->',          seoTags)
			.replace('<!-- %AUTO_DETECT% -->',   autoDetect)
			.replace('<!-- %LANG_SWITCHER% -->', langSwitcher)
			.replace('<!-- %LOCALE% -->',        localeScript)
			.replace('src="app.js"',             `src="/${jsFile}" defer`);

		const htmlMin = await minifyHTML(html, htmlMinOptions);
		fs.writeFileSync(path.join(localeDir, 'index.html'), htmlMin);
		console.log(`  ${locale.code}/index.html  ${kib(srcHTML)} -> ${kib(htmlMin)}  ${ratio(srcHTML, htmlMin)}`);
	}

	// ── Service worker ────────────────────────────────────────────────────────
	// Precache root + all locale index pages
	const localePaths = locales.filter(l => l.code !== 'en').map(l => `/${l.code}/`);
	const precache = ['/', ...localePaths, `/${jsFile}`, '/manifest.json', '/icon.svg'];
	const cacheVersion = contentHash(cssHash + jsHash);
	const swSrc = fs.readFileSync(path.join(SRC, 'sw.js'), 'utf8');
	const swInjected = swSrc
		.replace(/"fitment-dev"/, `"fitment-${cacheVersion}"`)
		.replace(/\["\/"\]/, JSON.stringify(precache));
	const swResult = await minifyJS(swInjected, {
		compress: { passes: 2 },
		mangle: true,
		format: { comments: false },
	});
	if (!swResult.code) throw new Error('SW minification produced empty output');
	fs.writeFileSync(path.join(DIST, 'sw.js'), swResult.code);
	console.log(`  sw.js       ${kib(swSrc)} -> ${kib(swResult.code)}  ${ratio(swSrc, swResult.code)}`);

	// ── Manifest and icon (copied verbatim) ───────────────────────────────────
	fs.copyFileSync(path.join(SRC, 'manifest.json'), path.join(DIST, 'manifest.json'));
	fs.copyFileSync(path.join(SRC, 'icon.svg'),      path.join(DIST, 'icon.svg'));
	console.log('  manifest.json + icon.svg  copied');

	// ── Cloudflare _headers ───────────────────────────────────────────────────
	// Security headers go in a /* catch-all so they apply to every path —
	// including the root "/" and the locale roots "/de/" which Cloudflare Pages
	// serves without an explicit index.html in the request path.
	const headers = [
		'/*',
		`  Content-Security-Policy: ${CSP}`,
		'  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload',
		'  Cross-Origin-Opener-Policy: same-origin',
		'  X-Content-Type-Options: nosniff',
		'  X-Frame-Options: DENY',
		'  Referrer-Policy: strict-origin-when-cross-origin',
		'',
		// Cache rules (security headers above already cover these paths)
		'/sw.js',
		'  Cache-Control: no-store',
		'',
		'/manifest.json',
		'  Cache-Control: public, max-age=3600',
		'',
		'/icon.svg',
		'  Cache-Control: public, max-age=86400',
		'',
		'/app.*.js',
		'  Cache-Control: public, max-age=31536000, immutable',
		'',
		'/index.html',
		'  Cache-Control: public, max-age=0, must-revalidate',
	];
	// HTML is revalidated on every request so a new build is picked up promptly
	for (const locale of locales.filter(l => l.code !== 'en')) {
		headers.push(
			'',
			`/${locale.code}/index.html`,
			'  Cache-Control: public, max-age=0, must-revalidate',
		);
	}
	fs.writeFileSync(path.join(DIST, '_headers'), headers.join('\n'));
	console.log('  _headers    security + cache rules written');

	console.log(`\n✓ Done in ${Date.now() - start}ms`);
}

build().catch(err => {
	console.error(`\n✗ ${err.message}`);
	process.exit(1);
});

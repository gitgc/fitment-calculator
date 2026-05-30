const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');

const { minify: minifyJS }  = require('terser');
const CleanCSS               = require('clean-css');
const { minify: minifyHTML } = require('html-minifier-terser');

const SRC  = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'public');

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

function buildSeoTags(cfg) {
	const t = [];

	// Core
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

	return t.join('\n  ');
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

// ── Build ─────────────────────────────────────────────────────────────────────

async function build() {
	const start = Date.now();
	console.log('Building src/ -> public/ ...\n');

	// ── Site config (SEO) ─────────────────────────────────────────────────────
	const siteConfig = loadSiteConfig();
	const seoTags    = buildSeoTags(siteConfig);
	console.log(`  site.config.json  loaded (title: "${siteConfig.title || '(none)'}")`);

	// Clean and recreate output dir
	fs.rmSync(DIST, { recursive: true, force: true });
	fs.mkdirSync(DIST, { recursive: true });

	// ── CSS (minify, then inline — eliminates the render-blocking request) ────
	const srcCSS = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');
	const cssResult = new CleanCSS({ level: 2 }).minify(srcCSS);
	if (cssResult.errors.length) throw new Error(`CSS:\n${cssResult.errors.join('\n')}`);
	const cssHash = contentHash(cssResult.styles);
	console.log(`  style.css   ${kib(srcCSS)} -> ${kib(cssResult.styles)}  ${ratio(srcCSS, cssResult.styles)}  (inlined)`);

	// ── JS ────────────────────────────────────────────────────────────────────
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

	// ── HTML ──────────────────────────────────────────────────────────────────
	const srcHTML = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
	if (!srcHTML.includes('<!-- %SEO% -->')) throw new Error('src/index.html is missing the <!-- %SEO% --> placeholder');
	const htmlWithRefs = srcHTML
		// Strip the dev-only fallback title — the SEO block supplies the real one from site.config.json
		.replace(/<title>[^<]*<\/title>\n?/, '')
		.replace('<!-- %SEO% -->', seoTags)
		// Inline CSS — replaces the <link> with a <style> block, removing the blocking request
		.replace('<link rel="stylesheet" href="style.css">', `<style>${cssResult.styles}</style>`)
		// Hashed JS filename + defer so it never blocks the parser
		.replace('src="app.js"', `src="${jsFile}" defer`);
	const htmlMin = await minifyHTML(htmlWithRefs, {
		collapseWhitespace:            true,
		removeComments:                true,
		removeAttributeQuotes:         true,
		removeRedundantAttributes:     true,
		removeScriptTypeAttributes:    true,
		removeStyleLinkTypeAttributes: true,
		minifyCSS:                     true,
		minifyJS:                      true,
		useShortDoctype:               true,
	});
	fs.writeFileSync(path.join(DIST, 'index.html'), htmlMin);
	console.log(`  index.html  ${kib(srcHTML)} -> ${kib(htmlMin)}  ${ratio(srcHTML, htmlMin)}`);

	// ── Service worker ────────────────────────────────────────────────────────
	// CSS is now inlined, so only JS needs to be precached separately.
	const precache = ['/', `/${jsFile}`, '/manifest.json', '/icon.svg'];
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

	// -- Cloudflare wrangler json (copied verbatim) ─────────────────────────────
	fs.copyFileSync(path.join(SRC, 'wrangler.jsonc'), path.join(DIST, 'wrangler.jsonc'));
	console.log('  wrangler.jsonc  copied');

	// ── Cloudflare _headers ───────────────────────────────────────────────────
	const headers = [
		'/index.html',
		'  Cache-Control: public, max-age=0, must-revalidate',
		'  X-Content-Type-Options: nosniff',
		'  X-Frame-Options: DENY',
		'  Referrer-Policy: strict-origin-when-cross-origin',
		'',
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
	].join('\n');
	fs.writeFileSync(path.join(DIST, '_headers'), headers);
	console.log('  _headers    cache rules written');

	console.log(`\n✓ Done in ${Date.now() - start}ms`);
}

build().catch(err => {
	console.error(`\n✗ ${err.message}`);
	process.exit(1);
});

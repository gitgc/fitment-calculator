'use strict';

const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');

const { minify: minifyJS }  = require('terser');
const CleanCSS               = require('clean-css');
const { minify: minifyHTML } = require('html-minifier-terser');

const SRC  = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'public');

// ── Helpers ───────────────────────────────────────────────────────────────────

function contentHash(str) {
	return crypto.createHash('sha256').update(str).digest('hex').slice(0, 8);
}

function kib(str) {
	return `${(Buffer.byteLength(str, 'utf8') / 1024).toFixed(1)} KiB`;
}

function ratio(before, after) {
	const pct = (100 - (Buffer.byteLength(after) / Buffer.byteLength(before)) * 100).toFixed(0);
	return `\x1b[32m-${pct}%\x1b[0m`;
}

// ── Build ─────────────────────────────────────────────────────────────────────

async function build() {
	const start = Date.now();
	console.log('Building src/ → public/ …\n');

	// Clean and recreate output dir
	fs.rmSync(DIST, { recursive: true, force: true });
	fs.mkdirSync(DIST, { recursive: true });

	// ── CSS ───────────────────────────────────────────────────────────────────
	const srcCSS = fs.readFileSync(path.join(SRC, 'style.css'), 'utf8');
	const cssResult = new CleanCSS({ level: 2 }).minify(srcCSS);
	if (cssResult.errors.length) throw new Error(`CSS:\n${cssResult.errors.join('\n')}`);
	const cssHash = contentHash(cssResult.styles);
	const cssFile = `style.${cssHash}.css`;
	fs.writeFileSync(path.join(DIST, cssFile), cssResult.styles);
	console.log(`  style.css   ${kib(srcCSS)} → ${kib(cssResult.styles)}  ${ratio(srcCSS, cssResult.styles)}  → ${cssFile}`);

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
	console.log(`  app.js      ${kib(srcJS)} → ${kib(jsResult.code)}  ${ratio(srcJS, jsResult.code)}  → ${jsFile}`);

	// ── HTML (with hashed asset refs injected) ────────────────────────────────
	const srcHTML = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
	const htmlWithHashes = srcHTML
		.replace('href="style.css"', `href="${cssFile}"`)
		.replace('src="app.js"',     `src="${jsFile}"`);
	const htmlMin = await minifyHTML(htmlWithHashes, {
		collapseWhitespace:           true,
		removeComments:               true,
		removeAttributeQuotes:        true,
		removeRedundantAttributes:    true,
		removeScriptTypeAttributes:   true,
		removeStyleLinkTypeAttributes: true,
		minifyCSS:                    true,
		minifyJS:                     true,
		useShortDoctype:              true,
	});
	fs.writeFileSync(path.join(DIST, 'index.html'), htmlMin);
	console.log(`  index.html  ${kib(srcHTML)} → ${kib(htmlMin)}  ${ratio(srcHTML, htmlMin)}`);

	// ── Cloudflare _headers ───────────────────────────────────────────────────
	const headers = [
		'# index.html — no cache (always fresh)',
		'/index.html',
		'  Cache-Control: public, max-age=0, must-revalidate',
		'  X-Content-Type-Options: nosniff',
		'  X-Frame-Options: DENY',
		'  Referrer-Policy: strict-origin-when-cross-origin',
		'',
		'# hashed assets — immutable forever',
		'/*.css',
		'  Cache-Control: public, max-age=31536000, immutable',
		'/*.js',
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

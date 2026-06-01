'use strict';

const { test, expect } = require('@playwright/test');
const fs   = require('node:fs');
const path = require('node:path');

const ROOT    = path.join(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'src', 'locales');
const PUB_DIR = path.join(ROOT, 'public');

const siteConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE_BASE  = siteConfig.canonicalUrl.replace(/\/$/, '');

// Expected hreflang href for a locale, computed from the ROOT site base.
function expectedHref(code) {
	return code === 'en' ? `${SITE_BASE}/` : `${SITE_BASE}/${code}/`;
}

function escapeRegExp(s) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const REQUIRED_KEYS = [
	'lang', 'flag', 'siteTitle', 'pageTitle', 'metaDescription', 'footerText',
	'skipToMain', 'subtitle', 'currentSetup', 'newSetup',
	'rimSection', 'tireSection', 'optionalSection',
	'diameterInches', 'widthInches', 'offsetET', 'tireWidth', 'profile', 'spacer', 'camber',
	'calcBtn', 'shareBtn', 'shareBtnAriaLabel',
	'tableAriaLabel', 'colMeasurement', 'colCurrent', 'colNew', 'colDifference',
	'crossSectionTitle', 'legendCurrent', 'legendNew',
	'canvasAriaLabelStatic', 'githubAriaLabel', 'switchLang', 'langName',
	'shareCopied',
	'rowDiameter', 'rowCircumference', 'rowPoke', 'rowInset', 'rowSpeedoError',
	'rowAt1', 'rowAt2', 'rowRideHeight', 'rowArchGap',
	'refSpeed1', 'refSpeed2', 'speedUnit',
	'calcStatus', 'canvasAriaLabelDynamic',
	'canvasCurrent', 'canvasNew', 'canvasWide', 'canvasPoke',
	'tipDiameter', 'tipCircumference', 'tipPoke', 'tipInset', 'tipSpeedoError',
	'tipAt1', 'tipAt2', 'tipRideHeight', 'tipArchGap',
];

const IMPERIAL     = new Set(['en']);
const PLACEHOLDERS = ['{oDiameter}', '{nDiameter}', '{oPoke}', '{nPoke}'];

const locales = fs.readdirSync(SRC_DIR)
	.filter(f => f.endsWith('.json'))
	.map(f => ({
		file: f,
		code: f.replace('.json', ''),
		data: JSON.parse(fs.readFileSync(path.join(SRC_DIR, f), 'utf8')),
	}));

function html(code) {
	const p = code === 'en'
		? path.join(PUB_DIR, 'index.html')
		: path.join(PUB_DIR, code, 'index.html');
	return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

// ── Source locale files ───────────────────────────────────────────────────────

test.describe('Locale JSON — source files', () => {
	test('all required keys present in every locale', () => {
		for (const { file, data } of locales) {
			const missing = REQUIRED_KEYS.filter(k => !(k in data));
			expect(missing, `${file} missing keys`).toHaveLength(0);
		}
	});

	test('lang field matches filename', () => {
		for (const { file, code, data } of locales) {
			expect(data.lang, file).toBe(code);
		}
	});

	test('no duplicate lang codes', () => {
		const codes = locales.map(l => l.code);
		expect(new Set(codes).size).toBe(codes.length);
	});

	test('speed units — imperial for en, metric for all others', () => {
		for (const { file, code, data } of locales) {
			if (IMPERIAL.has(code)) {
				expect(data.speedUnit, file).toBe('mph');
				expect(data.refSpeed1,  file).toBe(30);
				expect(data.refSpeed2,  file).toBe(60);
			} else {
				expect(data.speedUnit, file).toBe('km/h');
				expect(data.refSpeed1,  file).toBe(50);
				expect(data.refSpeed2,  file).toBe(100);
			}
		}
	});

	test('canvasAriaLabelDynamic contains all 4 interpolation placeholders', () => {
		for (const { file, data } of locales) {
			for (const p of PLACEHOLDERS) {
				expect(data.canvasAriaLabelDynamic, `${file} missing ${p}`).toContain(p);
			}
		}
	});

	test('no empty string values', () => {
		for (const { file, data } of locales) {
			const empty = Object.entries(data)
				.filter(([, v]) => typeof v === 'string' && v.trim() === '')
				.map(([k]) => k);
			expect(empty, `${file} has empty strings`).toHaveLength(0);
		}
	});
});

// ── Build output ──────────────────────────────────────────────────────────────

test.describe('Build output — HTML files', () => {
	test('every locale has an index.html', () => {
		for (const { code } of locales) {
			const label = code === 'en' ? 'public/index.html' : `public/${code}/index.html`;
			expect(html(code), `${label} exists`).not.toBeNull();
		}
	});

	test('<html lang> matches locale code', () => {
		for (const { code } of locales) {
			const content = html(code);
			if (!content) return;
			expect(content, `${code} lang attr`).toMatch(new RegExp(`<html[^>]*lang=${code}[^a-z]`));
		}
	});

	test('window.L embeds correct speed values', () => {
		for (const { code } of locales) {
			const content = html(code);
			if (!content) return;
			const ref1 = IMPERIAL.has(code) ? 30 : 50;
			const ref2 = IMPERIAL.has(code) ? 60 : 100;
			const unit = IMPERIAL.has(code) ? 'mph' : 'km/h';
			expect(content, `${code} refSpeed1`).toContain(`refSpeed1:${ref1}`);
			expect(content, `${code} refSpeed2`).toContain(`refSpeed2:${ref2}`);
			expect(content, `${code} speedUnit`).toContain(`speedUnit:"${unit}"`);
		}
	});

	test('every page has hreflang tags for all locales plus x-default', () => {
		const expected = locales.length + 1;
		for (const { code } of locales) {
			const content = html(code);
			expect(content, `${code} page exists`).not.toBeNull();
			const count = (content.match(/hreflang=/g) || []).length;
			expect(count, `${code} hreflang count`).toBe(expected);
			expect(content, `${code} x-default`).toContain('hreflang=x-default');
		}
	});

	test('hreflang hrefs point at root locale paths, never nested under the current locale', () => {
		for (const { code: pageCode } of locales) {
			const content = html(pageCode);
			expect(content, `${pageCode} page exists`).not.toBeNull();

			// Every alternate href must be the ROOT path for that locale,
			// regardless of which page we're on.
			for (const { code: altCode } of locales) {
				const href = escapeRegExp(expectedHref(altCode));
				const re   = new RegExp(`hreflang=${altCode}\\s+href=${href}[\\s>"]`);
				expect(content, `${pageCode} page → hreflang ${altCode} = ${expectedHref(altCode)}`).toMatch(re);
			}

			// x-default must be the site root, not e.g. /ja/
			const xdHref = escapeRegExp(`${SITE_BASE}/`);
			expect(content, `${pageCode} x-default href`).toMatch(
				new RegExp(`hreflang=x-default\\s+href=${xdHref}[\\s>"]`),
			);

			// Regression guard: no alternate may nest one locale under another
			// (the /ja/de/ class of bug). Check every ordered pair.
			for (const { code: a } of locales) {
				for (const { code: b } of locales) {
					if (a === 'en' || b === 'en') continue;
					expect(content, `${pageCode} page must not contain nested /${a}/${b}/`)
						.not.toContain(`${SITE_BASE}/${a}/${b}/`);
				}
			}
		}
	});

	test('English has auto-detect script; other locales have locale-store script', () => {
		for (const { code } of locales) {
			const content = html(code);
			if (!content) return;
			if (code === 'en') {
				expect(content, 'en auto-detect').toContain('location.replace');
			} else {
				expect(content, `${code} locale-store`).toMatch(new RegExp(`ftg-lang.{1,4}${code}`));
			}
		}
	});

	test('all locales reference the same hashed JS bundle via an absolute path', () => {
		const bundles = new Set();
		for (const { code } of locales) {
			const content = html(code);
			if (!content) return;
			const m = content.match(/src=(\/app\.[a-f0-9]+\.js)/);
			if (m) bundles.add(m[1]);
		}
		expect(bundles.size, 'all locales share one JS file').toBe(1);
		const [bundle] = bundles;
		expect(fs.existsSync(path.join(PUB_DIR, bundle)), `${bundle} exists in public/`).toBe(true);
	});

	test('_headers has cache rules for every locale index file', () => {
		const headers = fs.readFileSync(path.join(PUB_DIR, '_headers'), 'utf8');
		expect(headers).toContain('/index.html');
		for (const { code } of locales.filter(l => l.code !== 'en')) {
			expect(headers, `/${code}/index.html rule`).toContain(`/${code}/index.html`);
		}
	});
});

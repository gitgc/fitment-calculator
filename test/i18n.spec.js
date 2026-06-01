'use strict';

const { test, expect, LOCALES, localeUrl } = require('./fixtures');

// ── Per-locale rendering ──────────────────────────────────────────────────────

for (const L of LOCALES) {
	test.describe(`${L.flag}  ${L.langName} (${L.lang})`, () => {
		let page;

		test.beforeEach(async ({ makePage }) => {
			page = await makePage(L.lang);
			await page.goto(localeUrl(L.lang), { waitUntil: 'domcontentloaded' });
		});

		test('html[lang] attribute', async () => {
			await expect(page.locator('html')).toHaveAttribute('lang', L.lang);
		});

		test('h1 matches siteTitle', async () => {
			await expect(page.locator('h1')).toHaveText(L.siteTitle);
		});

		test('calc button text is translated', async () => {
			await expect(page.locator('button.calc-btn')).toHaveText(L.calcBtn);
		});

		test('language switcher trigger shows current flag', async () => {
			await expect(page.locator('.lang-trigger')).toContainText(L.flag);
		});

		test('speed rows show the correct unit and reference value', async () => {
			await page.click('button.calc-btn');

			await expect(
				page.locator('#tbody th[scope="row"]').filter({ hasText: L.rowAt1 }),
			).toBeVisible();
			await expect(
				page.locator('#tbody th[scope="row"]').filter({ hasText: L.rowAt2 }),
			).toBeVisible();

			const ref1Cell = `${L.refSpeed1.toFixed(1)} ${L.speedUnit}`;
			await expect(page.locator('#tbody td').filter({ hasText: ref1Cell })).toBeVisible();
		});

		test('no JS errors on load', async () => {
			const errors = [];
			page.on('pageerror', e => errors.push(e.message));
			await page.reload({ waitUntil: 'domcontentloaded' });
			expect(errors).toHaveLength(0);
		});
	});
}

// ── Language switcher ─────────────────────────────────────────────────────────

test.describe('Language switcher', () => {
	let page;

	test.beforeEach(async ({ makePage }) => {
		page = await makePage('en');
		await page.goto('/', { waitUntil: 'domcontentloaded' });
	});

	test('menu is hidden on load', async () => {
		await expect(page.locator('.lang-menu')).toBeHidden();
	});

	test('trigger click opens the menu', async () => {
		await page.click('.lang-trigger');
		await expect(page.locator('.lang-menu')).toBeVisible();
	});

	test('all locales are listed', async () => {
		await page.click('.lang-trigger');
		for (const L of LOCALES) {
			await expect(
				page.locator('.lang-option').filter({ hasText: L.langName }),
			).toBeVisible();
		}
	});

	test('current locale is marked as active', async () => {
		await page.click('.lang-trigger');
		const en = LOCALES.find(l => l.lang === 'en');
		await expect(
			page.locator('.lang-option--active').filter({ hasText: en.langName }),
		).toBeVisible();
	});

	test('Escape closes menu and returns focus to trigger', async () => {
		await page.click('.lang-trigger');
		await expect(page.locator('.lang-menu')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('.lang-menu')).toBeHidden();
		await expect(page.locator('.lang-trigger')).toBeFocused();
	});

	test('clicking outside closes the menu', async () => {
		await page.click('.lang-trigger');
		await expect(page.locator('.lang-menu')).toBeVisible();
		await page.click('h1');
		await expect(page.locator('.lang-menu')).toBeHidden();
	});
});

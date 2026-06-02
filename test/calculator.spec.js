const { test, expect, localeUrl } = require('./fixtures');

// ── Shared constants ──────────────────────────────────────────────────────────

// Expected outputs for default inputs:
//   Current: 17" rim, 7.5" wide, ET45, 225/45 tyre
//   New:     18" rim, 8.5" wide, ET40, 235/40 tyre
const DEFAULTS = {
	currentOD:    '634.3 mm',   // (17×25.4) + 2×(225×0.45)
	newOD:        '645.2 mm',   // (18×25.4) + 2×(235×0.40)
	currentPoke:  '50.3 mm',    // 7.5×25.4/2 − 45 = 50.25 → toFixed(1)
	newPoke:      '67.9 mm',    // 8.5×25.4/2 − 40 = 67.95 → toFixed(1)
	currentCirc:  '1992.7 mm',  // π × 634.3
	newCirc:      '2027.0 mm',  // π × 645.2
	speedoError:  '-1.69 %',    // (oCirc − nCirc) / nCirc × 100
	reading30:    '29.5 mph',   // 30 × oCirc / nCirc
	rideHeight:   '5.5 mm',     // (nOD − oOD) / 2
};

// Required min/max attributes for every numeric input
const FIELDS = {
	d:   { min: 12,   max: 25  },
	w:   { min: 3,    max: 20  },
	et:  { min: -300, max: 300 },
	tw:  { min: 100,  max: 500 },
	pr:  { min: 10,   max: 100 },
	sp:  { min: 0,    max: 100 },
	cam: { min: -20,  max: 20  },
};

// Named indices into the flat #tbody td list (row × 3 + col)
// Row order: Diameter(0) Circumference(1) Poke(2) Inset(3) SpeedoError(4)
//            Reading1(5) Reading2(6) RideHeight(7) ArchGap(8)
// Columns: current(0) new(1) diff(2)
const TD = {
	currentOD:    0,   // Diameter     current
	newOD:        1,   // Diameter     new
	currentCirc:  3,   // Circumference current
	newCirc:      4,   // Circumference new
	currentPoke:  6,   // Poke         current
	newPoke:      7,   // Poke         new
	speedoNew:    13,  // SpeedoError  new
	reading1New:  16,  // Reading@ref1 new
	rideNew:      22,  // RideHeight   new
};

// Fills all OD-affecting fields to the same values on both setups so the
// only thing changing between tests is what we explicitly modify.
async function setIdenticalTires(page, d = 17, tw = 225, pr = 45, w = 7.5, et = 45) {
	for (const p of ['o', 'n']) {
		await page.fill(`#${p}-d`,  String(d));
		await page.fill(`#${p}-tw`, String(tw));
		await page.fill(`#${p}-pr`, String(pr));
		await page.fill(`#${p}-w`,  String(w));
		await page.fill(`#${p}-et`, String(et));
	}
}

// True if the canvas drew anything — i.e. has at least one pixel that differs from
// the #0d1117 (13,17,23) background. Scans the pixel buffer with a stride instead
// of allocating ~2.2M values (and the always-non-zero background would otherwise
// make a naive `some(v > 0)` pass even on a blank canvas).
async function drewOnCanvas(page, id) {
	return page.evaluate((elId) => {
		const cv = document.getElementById(elId);
		const { data } = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
		for (let i = 0; i < data.length; i += 40) { // every 10th pixel (4 bytes each)
			if (data[i] !== 13 || data[i + 1] !== 17 || data[i + 2] !== 23) return true;
		}
		return false;
	}, id);
}

// ── Default inputs ────────────────────────────────────────────────────────────

test.describe('Default inputs', () => {
	let page;

	test.beforeEach(async ({ makePage }) => {
		page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
	});

	test('all fields have correct default values', async () => {
		await expect(page.locator('#o-d')).toHaveValue('17');
		await expect(page.locator('#o-w')).toHaveValue('7.5');
		await expect(page.locator('#o-et')).toHaveValue('45');
		await expect(page.locator('#o-tw')).toHaveValue('225');
		await expect(page.locator('#o-pr')).toHaveValue('45');
		await expect(page.locator('#o-sp')).toHaveValue('0');
		await expect(page.locator('#n-d')).toHaveValue('18');
		await expect(page.locator('#n-w')).toHaveValue('8.5');
		await expect(page.locator('#n-et')).toHaveValue('40');
		await expect(page.locator('#n-tw')).toHaveValue('235');
		await expect(page.locator('#n-pr')).toHaveValue('40');
	});

	test('results are shown on load — calculate() runs in window.onload', async () => {
		await expect(page.locator('#results')).toBeVisible();
	});
});

// ── Input constraints ─────────────────────────────────────────────────────────

test.describe('Input constraints', () => {
	let page;

	test.beforeEach(async ({ makePage }) => {
		page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
	});

	for (const prefix of ['o', 'n']) {
		test(`${prefix === 'o' ? 'current' : 'new'} setup — all min/max attributes present`, async () => {
			for (const [field, { min, max }] of Object.entries(FIELDS)) {
				const loc = page.locator(`#${prefix}-${field}`);
				await expect(loc, `#${prefix}-${field} min`).toHaveAttribute('min', String(min));
				await expect(loc, `#${prefix}-${field} max`).toHaveAttribute('max', String(max));
			}
		});
	}
});

// ── Results table ─────────────────────────────────────────────────────────────

test.describe('Results table', () => {
	let page;

	test.beforeEach(async ({ makePage }) => {
		page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
	});

	test('has exactly 9 rows', async () => {
		await expect(page.locator('#tbody tr')).toHaveCount(9);
	});

	test('outer diameter values are correct', async () => {
		await expect(page.locator('#tbody td').filter({ hasText: DEFAULTS.currentOD })).toBeVisible();
		await expect(page.locator('#tbody td').filter({ hasText: DEFAULTS.newOD })).toBeVisible();
	});

	test('poke values are correct', async () => {
		await expect(page.locator('#tbody td').filter({ hasText: DEFAULTS.currentPoke })).toBeVisible();
		await expect(page.locator('#tbody td').filter({ hasText: DEFAULTS.newPoke })).toBeVisible();
	});

	test('derived metrics match known values for default inputs', async () => {
		// Locks the core maths: circumference, speedo correction, reading, ride height.
		const td = page.locator('#tbody td');
		await expect(td.nth(TD.currentCirc)).toHaveText(DEFAULTS.currentCirc);
		await expect(td.nth(TD.newCirc)).toHaveText(DEFAULTS.newCirc);
		await expect(td.nth(TD.speedoNew)).toHaveText(DEFAULTS.speedoError);
		await expect(td.nth(TD.reading1New)).toHaveText(DEFAULTS.reading30);
		await expect(td.nth(TD.rideNew)).toHaveText(DEFAULTS.rideHeight);
	});

	test('all 9 English row labels are present', async () => {
		const labels = [
			'Diameter', 'Circumference', 'Poke', 'Inset',
			'Speedo Error', 'Reading at 30 mph', 'Reading at 60 mph',
			'Ride Height Gain', 'Arch Gap Loss',
		];
		for (const label of labels) {
			await expect(
				page.locator('#tbody th[scope="row"]').filter({ hasText: label }),
			).toBeVisible();
		}
	});

	test('identical setups produce zero speedo error and zero ride height change', async () => {
		await page.fill('#n-d',  '17');
		await page.fill('#n-w',  '7.5');
		await page.fill('#n-et', '45');
		await page.fill('#n-tw', '225');
		await page.fill('#n-pr', '45');
		await page.click('button.calc-btn');

		await expect(page.locator('#tbody td').nth(TD.speedoNew)).toHaveText('0.00 %');
		await expect(page.locator('#tbody td').nth(TD.rideNew)).toHaveText('0.0 mm');
	});

	test('speedo error uses 2 decimal places in New and Diff columns', async () => {
		const allCells = await page.locator('#tbody td').allTextContents();
		const pctCells = allCells.filter(t => t.includes('%') && !t.startsWith('—'));
		for (const cell of pctCells) {
			const num      = cell.replace(/^[+−-]/, '').replace(' %', '').trim();
			const decimals = num.split('.')[1]?.length ?? 0;
			expect(decimals, `"${cell}" should have 2 decimal places`).toBe(2);
		}
	});
});

// ── Boundary calculations ─────────────────────────────────────────────────────

test.describe('Boundary calculations', () => {

	test('minimum values — correct OD and zero speedo error', async ({ makePage }) => {
		const page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });

		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		for (const p of ['o', 'n']) {
			await page.fill(`#${p}-d`,   '12');
			await page.fill(`#${p}-w`,   '3');
			await page.fill(`#${p}-et`,  '-300');
			await page.fill(`#${p}-tw`,  '100');
			await page.fill(`#${p}-pr`,  '10');
			await page.fill(`#${p}-sp`,  '0');
			await page.fill(`#${p}-cam`, '-20');
		}
		await page.click('button.calc-btn');

		// OD = (12×25.4) + 2×(100×0.10) = 304.8 + 20 = 324.8 mm
		await expect(page.locator('#tbody td').nth(TD.currentOD)).toHaveText('324.8 mm');
		await expect(page.locator('#tbody td').nth(TD.speedoNew)).toHaveText('0.00 %');
		expect(errors).toHaveLength(0);
	});

	test('maximum values — correct OD and zero speedo error', async ({ makePage }) => {
		const page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });

		const errors = [];
		page.on('pageerror', e => errors.push(e.message));

		for (const p of ['o', 'n']) {
			await page.fill(`#${p}-d`,   '25');
			await page.fill(`#${p}-w`,   '20');
			await page.fill(`#${p}-et`,  '300');
			await page.fill(`#${p}-tw`,  '500');
			await page.fill(`#${p}-pr`,  '100');
			await page.fill(`#${p}-sp`,  '100');
			await page.fill(`#${p}-cam`, '20');
		}
		await page.click('button.calc-btn');

		// OD = (25×25.4) + 2×(500×1.00) = 635 + 1000 = 1635.0 mm
		await expect(page.locator('#tbody td').nth(TD.currentOD)).toHaveText('1635.0 mm');
		await expect(page.locator('#tbody td').nth(TD.speedoNew)).toHaveText('0.00 %');
		expect(errors).toHaveLength(0);
	});

	test('negative ET (−300) shifts poke outward correctly', async ({ makePage }) => {
		const page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });

		await page.fill('#o-d',  '17');
		await page.fill('#o-w',  '7.5');
		await page.fill('#o-et', '-300');
		await page.fill('#o-tw', '225');
		await page.fill('#o-pr', '45');
		await page.click('button.calc-btn');

		// OD unchanged by ET; poke = 7.5×25.4/2 − (−300) = 95.25 + 300 = 395.3 mm
		await expect(page.locator('#tbody td').nth(TD.currentOD)).toHaveText('634.3 mm');
		await expect(page.locator('#tbody td').nth(TD.currentPoke)).toHaveText('395.3 mm');
	});

	test('maximum negative camber (−20°) renders without error', async ({ makePage }) => {
		const page   = await makePage('en');
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
		await page.fill('#o-cam', '-20');
		await page.fill('#n-cam', '-20');
		await page.click('button.calc-btn');
		expect(errors).toHaveLength(0);
	});

	test('maximum positive camber (+20°) renders without error', async ({ makePage }) => {
		const page   = await makePage('en');
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
		await page.fill('#o-cam', '20');
		await page.fill('#n-cam', '20');
		await page.click('button.calc-btn');
		expect(errors).toHaveLength(0);
	});
});

// ── Out-of-range clamping ─────────────────────────────────────────────────────
// Values set via page.evaluate() bypass browser validation, letting us verify
// that the JS v() function enforces limits independently of the browser UI.

test.describe('Out-of-range clamping', () => {
	let page;

	test.beforeEach(async ({ makePage }) => {
		page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
	});

	test('rim above max (26) clamps to 25', async () => {
		await setIdenticalTires(page, 25);
		await page.evaluate(() => { document.getElementById('n-d').value = '26'; });
		await page.click('button.calc-btn');
		await expect(page.locator('#tbody td').nth(TD.speedoNew)).toHaveText('0.00 %');
	});

	test('rim below min (11) clamps to 12', async () => {
		await setIdenticalTires(page, 12);
		await page.evaluate(() => { document.getElementById('n-d').value = '11'; });
		await page.click('button.calc-btn');
		await expect(page.locator('#tbody td').nth(TD.speedoNew)).toHaveText('0.00 %');
	});

	test('tyre width above max (550) clamps to 500', async () => {
		await setIdenticalTires(page, 17, 500);
		await page.evaluate(() => { document.getElementById('n-tw').value = '550'; });
		await page.click('button.calc-btn');
		await expect(page.locator('#tbody td').nth(TD.speedoNew)).toHaveText('0.00 %');
	});

	test('tyre width below min (50) clamps to 100', async () => {
		await setIdenticalTires(page, 17, 100);
		await page.evaluate(() => { document.getElementById('n-tw').value = '50'; });
		await page.click('button.calc-btn');
		await expect(page.locator('#tbody td').nth(TD.speedoNew)).toHaveText('0.00 %');
	});

	test('profile above max (110) clamps to 100', async () => {
		await setIdenticalTires(page, 17, 225, 100);
		await page.evaluate(() => { document.getElementById('n-pr').value = '110'; });
		await page.click('button.calc-btn');
		await expect(page.locator('#tbody td').nth(TD.speedoNew)).toHaveText('0.00 %');
	});

	test('profile below min (5) clamps to 10', async () => {
		await setIdenticalTires(page, 17, 225, 10);
		await page.evaluate(() => { document.getElementById('n-pr').value = '5'; });
		await page.click('button.calc-btn');
		await expect(page.locator('#tbody td').nth(TD.speedoNew)).toHaveText('0.00 %');
	});

	test('spacer above max (150) clamps to 100 — poke shift is exactly 100 mm', async () => {
		await page.fill('#n-et', '100');
		await page.fill('#n-sp', '0');
		await page.click('button.calc-btn');
		const pokeBefore = parseFloat(await page.locator('#tbody td').nth(TD.newPoke).textContent());

		await page.evaluate(() => { document.getElementById('n-sp').value = '150'; });
		await page.click('button.calc-btn');
		const pokeAfter = parseFloat(await page.locator('#tbody td').nth(TD.newPoke).textContent());

		expect(pokeAfter).toBeCloseTo(pokeBefore + 100, 1);
	});

	test('camber below min (−25°) clamps to −20° — no JS errors', async () => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluate(() => { document.getElementById('o-cam').value = '-25'; });
		await page.evaluate(() => { document.getElementById('n-cam').value = '-25'; });
		await page.click('button.calc-btn');
		expect(errors).toHaveLength(0);
	});

	test('ET above max (350) clamps to 300 — no JS errors', async () => {
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluate(() => { document.getElementById('o-et').value = '350'; });
		await page.evaluate(() => { document.getElementById('n-et').value = '350'; });
		await page.click('button.calc-btn');
		expect(errors).toHaveLength(0);
	});
});

// ── Spacer ────────────────────────────────────────────────────────────────────

test.describe('Spacer', () => {
	test('10 mm spacer shifts new poke outward by exactly 10 mm', async ({ makePage }) => {
		const page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });

		const pokeBefore = parseFloat(await page.locator('#tbody td').nth(TD.newPoke).textContent());

		await page.fill('#n-sp', '10');
		await page.click('button.calc-btn');

		const pokeAfter = parseFloat(await page.locator('#tbody td').nth(TD.newPoke).textContent());
		expect(pokeAfter).toBeCloseTo(pokeBefore + 10, 1);
	});
});

// ── Canvas diagram ────────────────────────────────────────────────────────────

test.describe('Canvas diagram', () => {
	let page;

	test.beforeEach(async ({ makePage }) => {
		page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
	});

	test('dimensions are 900×620', async () => {
		const dims = await page.$eval('#cv', el => ({ w: el.width, h: el.height }));
		expect(dims).toEqual({ w: 900, h: 620 });
	});

	test('draws content beyond the background', async () => {
		expect(await drewOnCanvas(page, 'cv')).toBe(true);
	});

	test('aria-label is updated with mm measurements', async () => {
		await expect(page.locator('#cv')).toHaveAttribute('aria-label', /mm/);
	});

	test('face-view canvas renders with pixel data and a labelled diameter', async () => {
		const dims = await page.$eval('#cv2', el => ({ w: el.width, h: el.height }));
		expect(dims).toEqual({ w: 900, h: 620 });

		expect(await drewOnCanvas(page, 'cv2')).toBe(true);

		// aria-label carries both diameters (Ø…mm) for the face view
		await expect(page.locator('#cv2')).toHaveAttribute('aria-label', /Ø.*mm.*Ø.*mm/);
	});
});

// ── Tooltips ──────────────────────────────────────────────────────────────────

test.describe('Tooltips', () => {
	let page;

	test.beforeEach(async ({ makePage }) => {
		page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
	});

	test('appears on row hover with non-empty content', async () => {
		await page.hover('#tbody th[scope="row"]:first-child');
		await expect(page.locator('#tip')).toHaveCSS('opacity', '1');
		const text = await page.textContent('#tip');
		expect(text.length).toBeGreaterThan(10);
	});

	test('disappears when mouse leaves', async () => {
		await page.hover('#tbody th[scope="row"]:first-child');
		await page.mouse.move(0, 0);
		await expect(page.locator('#tip')).toHaveCSS('opacity', '0');
	});
});

// ── Share button ──────────────────────────────────────────────────────────────

test.describe('Share button', () => {
	let page;

	test.beforeEach(async ({ makePage }) => {
		page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
	});

	test('shows "Copied!" on click then reverts to "Share" after 2 s', async () => {
		await page.click('#share-btn');
		await expect(page.locator('#share-btn')).toHaveText('Copied!');
		await expect(page.locator('#share-btn')).toHaveClass(/copied/);
		await expect(page.locator('#share-btn')).toHaveText('Share', { timeout: 4000 });
		await expect(page.locator('#share-btn')).not.toHaveClass(/copied/);
	});

	test('copies a URL that encodes the inputs and round-trips back to them', async () => {
		// Set distinctive non-default values across both setups
		await page.fill('#o-d',  '19');
		await page.fill('#o-tw', '205');
		await page.fill('#n-et', '42');
		await page.fill('#n-sp', '7');

		// Capture what _share() writes to the clipboard (makePage stubbed it to a no-op)
		await page.evaluate(() => {
			window.__copied = null;
			navigator.clipboard.writeText = (t) => {
				window.__copied = t;
				return Promise.resolve();
			};
		});
		await page.click('#share-btn');

		const url = await page.evaluate(() => window.__copied);
		expect(url).toContain('od=19');
		expect(url).toContain('otw=205');
		expect(url).toContain('net=42');
		expect(url).toContain('nsp=7');

		// Round-trip: loading that URL restores the same input values
		await page.goto(url, { waitUntil: 'domcontentloaded' });
		await expect(page.locator('#o-d')).toHaveValue('19');
		await expect(page.locator('#o-tw')).toHaveValue('205');
		await expect(page.locator('#n-et')).toHaveValue('42');
		await expect(page.locator('#n-sp')).toHaveValue('7');
	});
});

// ── URL parameters ────────────────────────────────────────────────────────────

test.describe('URL parameters', () => {
	test('pre-fill all inputs and auto-trigger calculate', async ({ makePage }) => {
		const page   = await makePage('en');
		const params = 'od=16&ow=6.5&oet=38&otw=205&opr=55&osp=0&ocam=0&nd=17&nw=7&net=42&ntw=215&npr=50&nsp=5&ncam=0';
		await page.goto(`/?${params}`, { waitUntil: 'domcontentloaded' });

		await expect(page.locator('#o-d')).toHaveValue('16');
		await expect(page.locator('#o-w')).toHaveValue('6.5');
		await expect(page.locator('#o-tw')).toHaveValue('205');
		await expect(page.locator('#n-d')).toHaveValue('17');
		await expect(page.locator('#n-sp')).toHaveValue('5');
		await expect(page.locator('#results')).toBeVisible();
	});
});

// ── Tyre size parser ──────────────────────────────────────────────────────────

test.describe('Tyre size parser', () => {
	let page;

	test.beforeEach(async ({ makePage }) => {
		page = await makePage('en');
		await page.goto(localeUrl('en'), { waitUntil: 'domcontentloaded' });
	});

	test('size boxes are pre-filled from the default fields on load', async () => {
		await expect(page.locator('#o-size')).toHaveValue('225/45R17');
		await expect(page.locator('#n-size')).toHaveValue('235/40R18');
	});

	test('typing a size fills the fields and recalculates', async () => {
		await page.fill('#n-size', '255/35R19');
		await expect(page.locator('#n-tw')).toHaveValue('255');
		await expect(page.locator('#n-pr')).toHaveValue('35');
		await expect(page.locator('#n-d')).toHaveValue('19');
		// OD = 19×25.4 + 2×(255×0.35) = 482.6 + 178.5 = 661.1 mm
		await expect(page.locator('#tbody td').nth(TD.newOD)).toHaveText('661.1 mm');
	});

	test('accepts common notation variants', async () => {
		for (const s of ['225/45R17', 'P225/45ZR17', '225/45-17', '225 / 45 r 17']) {
			await page.fill('#o-size', s);
			await expect(page.locator('#o-tw'), s).toHaveValue('225');
			await expect(page.locator('#o-pr'), s).toHaveValue('45');
			await expect(page.locator('#o-d'),  s).toHaveValue('17');
			await expect(page.locator('#o-size')).not.toHaveAttribute('aria-invalid', 'true');
		}
	});

	test('invalid input is flagged and leaves the fields untouched', async () => {
		await page.fill('#o-d',  '18');
		await page.fill('#o-tw', '205');
		await page.fill('#o-size', 'not a size');
		await expect(page.locator('#o-size')).toHaveAttribute('aria-invalid', 'true');
		await expect(page.locator('#o-tw')).toHaveValue('205');
		await expect(page.locator('#o-d')).toHaveValue('18');
	});

	test('editing the individual fields reflects back into the size box', async () => {
		await page.fill('#n-d',  '19');
		await page.fill('#n-tw', '255');
		await page.fill('#n-pr', '35');
		await expect(page.locator('#n-size')).toHaveValue('255/35R19');
	});
});

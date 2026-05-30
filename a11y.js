const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const IMPACT_COLOR = { critical: '\x1b[31m', serious: '\x1b[33m', moderate: '\x1b[36m', minor: '\x1b[90m' };
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const BOLD  = '\x1b[1m';

const url = process.argv[2] || 'http://localhost:3000';

async function run() {
	console.log(`\n${BOLD}axe-core accessibility scan${RESET}`);
	console.log(`Target: ${url}\n`);

	const browser = await chromium.launch();
	const context = await browser.newContext();
	const page    = await context.newPage();

	await page.goto(url, { waitUntil: 'networkidle' });

	const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

	// Audit initial state
	const initial = await new AxeBuilder({ page }).withTags(tags).analyze();

	// Trigger calculate so the results table and diagram are rendered, then audit again
	await page.click('button.calc-btn');
	await page.waitForSelector('#results.show');
	const withResults = await new AxeBuilder({ page }).withTags(tags).analyze();

	await browser.close();

	// Merge violations from both passes, deduplicated by id+target
	const seen = new Set();
	const violations = [...initial.violations, ...withResults.violations]
		.flatMap(v =>
			v.nodes.map(node => ({
				id:      v.id,
				impact:  v.impact,
				help:    v.help,
				helpUrl: v.helpUrl,
				target:  node.target.join(', '),
				summary: node.failureSummary ?? '',
			})),
		)
		.filter(v => {
			const key = `${v.id}::${v.target}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => (IMPACT_ORDER[a.impact] ?? 9) - (IMPACT_ORDER[b.impact] ?? 9));

	if (violations.length === 0) {
		console.log(`${GREEN}✓ No violations found.${RESET}\n`);
		return;
	}

	console.log(`${BOLD}${violations.length} violation(s) found:${RESET}\n`);

	for (const v of violations) {
		const col = IMPACT_COLOR[v.impact] ?? '';
		console.log(`${col}${BOLD}[${v.impact}]${RESET} ${v.id}`);
		console.log(`  ${v.help}`);
		console.log(`  Element: ${v.target}`);
		if (v.summary) {
			const lines = v.summary.replace(/^Fix (?:any|all) of the following:\n/, '').split('\n');
			for (const line of lines) console.log(`  ${line}`);
		}
		console.log(`  ${'\x1b[2m'}${v.helpUrl}${RESET}`);
		console.log('');
	}

	process.exit(1);
}

run().catch(err => {
	console.error(`\x1b[31m✗ ${err.message}${RESET}`);
	process.exit(1);
});

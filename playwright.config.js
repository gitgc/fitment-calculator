const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
	testDir:       './test',
	testMatch:     '**/*.spec.js',
	// Each worker runs its own static server on an ephemeral port (see fixtures.js),
	// so tests are isolated and safe to run in parallel.
	fullyParallel: true,
	workers:       process.env.CI ? 2 : 4,
	reporter:      [['list']],
	use: {
		headless: true,
	},
});

const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
	testDir:   './test',
	testMatch: '**/*.spec.js',
	workers:   1,
	reporter:  [['list']],
	use: {
		baseURL:  'http://localhost:3334',
		headless: true,
	},
});

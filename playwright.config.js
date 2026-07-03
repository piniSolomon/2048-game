// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests',
    timeout: 30000,
    retries: 1,
    use: {
        baseURL: 'http://localhost:8092',
        headless: true,
        viewport: { width: 1024, height: 768 },
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'python3 -m http.server 8092',
        port: 8092,
        reuseExistingServer: true,
    },
});

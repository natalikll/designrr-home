import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:3100/presentation', { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.locator('text=Start from scratch').first().click();
await page.waitForTimeout(1000);
await page.locator('text=Minimal').first().click({ timeout: 10000 });
await page.waitForTimeout(500);
await page.locator('button:has-text("Generate Presentation")').first().click({ timeout: 10000 });
await page.waitForTimeout(2500);

await page.locator('text=V2 · concept').first().click({ timeout: 5000 });
await page.waitForTimeout(500);
await page.locator('button:has-text("Create video")').screenshot({ path: '.scratch-video-icon2.png' });

await browser.close();

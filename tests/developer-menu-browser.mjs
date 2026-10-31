import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import path from 'node:path';

test('developer information menu works on desktop and touch widths on home and detail routes', async () => {
  const app = express();
  app.use(express.static(path.resolve('docs')));
  const server = createServer(app).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
      const touch = viewport.width <= 600;
      const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      await page.locator('#post-grid .post-card').first().waitFor();

      const toggle = page.locator('#developer-menu-toggle');
      const root = page.locator('#developer-menu');
      const popover = page.locator('#developer-popover');
      const logoBox = await page.locator('.brand').boundingBox();
      const buttonBox = await toggle.boundingBox();
      assert.ok(buttonBox.x >= logoBox.x + logoBox.width);
      assert.equal(await toggle.textContent(), 'Thông tin nhà phát triển');
      assert.equal(await toggle.getAttribute('aria-controls'), 'developer-popover');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');

      if (viewport.width > 600) {
        await toggle.hover();
        await page.waitForFunction(() => getComputedStyle(document.querySelector('#developer-popover')).visibility === 'visible');
        await popover.hover();
        await page.waitForTimeout(380);
        assert.equal(await popover.evaluate(element => getComputedStyle(element).visibility), 'visible');
      } else {
        await toggle.click();
      }
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true', `menu should open at ${viewport.width}px`);
      assert.equal(await popover.getAttribute('aria-hidden'), 'false');
      assert.equal(await popover.locator('a[href^="mailto:"]').getAttribute('href'), 'mailto:dothanghe194539@gmail.com');

      if (viewport.width <= 600) {
        const bounds = await popover.boundingBox();
        assert.ok(bounds.x >= 0);
        assert.ok(bounds.x + bounds.width <= viewport.width);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      }

      await page.locator('#developer-support-toggle').click();
      assert.equal(await page.locator('#developer-support-details').isVisible(), true);
      await page.locator('#developer-copy-account').click();
      await page.waitForFunction(() => document.querySelector('#developer-copy-status').textContent === 'Account number copied.');
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), '1709200526');

      await page.keyboard.press('Escape');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      await toggle.click();
      await page.locator('#main').click({ position: { x: 10, y: 10 } });
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert.deepEqual(errors, []);

      await page.locator('#feedback-open').waitFor();
      assert.equal(await page.locator('#feedback-open').isVisible(), true);
      const slug = await page.locator('#post-grid .post-card').first().getAttribute('href');
      await page.goto(origin + slug);
      await page.locator('#detail-view').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#developer-menu-toggle').count(), 1);
      assert.equal(await page.locator('#feedback-open').isVisible(), true);
      await context.close();
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});

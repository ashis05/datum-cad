#!/usr/bin/env node
// Screenshots for the README, taken from a running app (default http://localhost:3000).
//
//   cd docs/readme && npm install --no-save --no-package-lock playwright && npx playwright install chromium   # once
//   npm run build && npm start            # in the repo root, with GEMINI_API_KEY set
//   node docs/readme/shoot.cjs            # then: python3 docs/readme/make_svg.py
//
// Only the first run calls Gemini: the response is saved to shots/fixture.json and
// replayed for every later shot (delete the file to generate a fresh part).
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const BASE = process.env.APP_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, 'shots');
const FIXTURE = path.join(OUT, 'fixture.json');
const PROMPT =
  'Flanged pipe fitting: 60 mm flange, 8 mm thick, four bolt holes, 30 mm tube rising 40 mm, 20 mm bore';

const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

async function open(browser, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.warn('pageerror:', e.message));
  if (fs.existsSync(FIXTURE)) {
    const body = fs.readFileSync(FIXTURE, 'utf8');
    await page.route('**/api/generate', (r) => r.fulfill({ status: 200, contentType: 'application/json', body }));
  } else {
    page.on('response', async (r) => {
      if (r.url().endsWith('/api/generate') && r.ok()) fs.writeFileSync(FIXTURE, await r.text());
    });
  }
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByText('Kernel ready').first().waitFor({ timeout: 90000 });
  return { ctx, page };
}

async function generate(page) {
  const box = page.locator('textarea').first();
  await box.fill(PROMPT);
  await box.press('Enter');
  // the bounding-box readout (e.g. "60.0 × 60.0 × 48.0 mm") appears once the part is built
  await page.getByText(/\d+\.\d × \d+\.\d × \d+\.\d/).first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(2500); // camera framing + edges
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: GL });

  let { ctx, page } = await open(browser, { width: 1440, height: 900 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'desktop-empty.png') });
  await generate(page);
  await page.screenshot({ path: path.join(OUT, 'desktop-model.png') });
  await ctx.close();

  ({ ctx, page } = await open(browser, { width: 390, height: 844 }));
  await page.screenshot({ path: path.join(OUT, 'mobile-empty.png') });
  await generate(page);
  await page.screenshot({ path: path.join(OUT, 'mobile-model.png') });
  const paramsTab = page.getByRole('tab', { name: /parameters/i });
  if (await paramsTab.count()) {
    await paramsTab.first().click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(OUT, 'mobile-params.png') });
  }
  await ctx.close();

  await browser.close();
  console.log('shots written to', OUT);
})();

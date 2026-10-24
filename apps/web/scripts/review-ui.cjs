/* Run only against the disposable fixture described in docs/ui-redesign.md.
 * Every API call is intercepted. No browser request reaches a real job API.
 * Playwright is an optional external review tool, not an app dependency.
 */
const { chromium } = require(process.env.PRINTOS_PLAYWRIGHT_PATH || 'playwright');
const { createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:3047';
const out = path.resolve(__dirname, '../../../docs/ui-review');
const secret = 'printos-ui-review-only-not-a-real-session-secret';
let browser;
(async () => {
  const marker = await (await fetch(`${base}/__ui-review-fixture.json`)).json();
  assert.equal(marker.fixture, 'printos-ui-review-no-database');
  fs.mkdirSync(out, { recursive: true });
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ role: 'owner', iat: now, exp: now + 3600 })).toString('base64url');
  await context.addCookies([{ name: 'printos_session', value: `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`, url: base }]);
  const calls = []; const errors = []; const consoles = [];
  let quoteDelay = 0;
  let status = 'COMPLETED'; let rejectNetwork = false; let loginSuccess = false; let uploadFailure = false;
  await context.route('**/api/**', async route => {
    const request = route.request(); const pathname = new URL(request.url()).pathname;
    calls.push({ pathname, method: request.method(), body: request.postData() });
    const json = (body, code = 200) => route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
    if (pathname === '/api/quotes') { if (quoteDelay) await new Promise(resolve => setTimeout(resolve, quoteDelay)); return json({ pageCount: 8, selectedPages: 8, pageRange: 'all', price: 1600, copies: 1, perPagePaise: 200 }); }
    if (pathname.endsWith('/public')) return json({ id: 'review-job-100001', printStatus: status, copies: 2, colorMode: 'BW', paperSize: 'A4', duplex: true, pageRange: '1,3-5', pageCount: 8, price: 1200, rejectionReason: status === 'REJECTED' ? 'Please upload a clearer document.' : null, createdAt: '2026-10-23T10:30:00Z' });
    if (pathname.endsWith('/approve')) return json({ printStatus: 'APPROVED' });
    if (pathname.endsWith('/reject')) {
      if (rejectNetwork) return route.abort('failed');
      return json({ printStatus: 'REJECTED' });
    }
    if (pathname === '/api/auth/login') return loginSuccess ? json({ ok: true }) : json({ error: 'Invalid credentials' }, 401);
    if (pathname === '/api/auth/logout') return json({ ok: true });
    if (pathname === '/api/jobs') return uploadFailure ? route.abort('failed') : json({ jobId: 'review-job-100001', customerSessionId: 'review-token', price: 1200 });
    if (pathname.endsWith('/file')) return route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-1.7\n%%EOF') });
    return json({ error: 'Unrecognized mock request; blocked' }, 400);
  });
  const page = await context.newPage();
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', message => { if (message.type() === 'error') consoles.push(message.text()); });
  const upload = () => page.getByLabel('Upload PDF document').setInputFiles({ name: 'Quarterly-report-and-meeting-notes.pdf', mimeType: 'application/pdf', buffer: Buffer.from('MOCK PDF: intercepted before server') });
  const overflow = async label => {
    const result = await page.evaluate(() => ({ width: innerWidth, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
    assert.ok(result.doc <= result.width + 1 && result.body <= result.width + 1, `${label}: overflow ${JSON.stringify(result)}`);
  };
  const accessibility = [];
  async function checkAccessibility(label) {
    await page.addScriptTag({ path: process.env.PRINTOS_AXE_PATH || require.resolve('axe-core') });
    const result = await page.evaluate(async () => {
      const audit = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21aa'] } });
      return audit.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) }));
    });
    accessibility.push({ page: label, violations: result });
    assert.equal(result.length, 0, `${label} accessibility: ${JSON.stringify(result)}`);
  }
  const results = [];
  for (const width of [320, 375, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    for (const [name, url] of [['home','/'], ['login','/login'], ['upload','/p/SHOP-001'], ['status','/p/SHOP-001/j/review-job-100001?s=review-token'], ['dashboard','/dashboard'], ['jobs','/dashboard/jobs'], ['reports','/dashboard/reports']]) {
      await page.goto(base + url, { waitUntil: 'networkidle' });
      await overflow(`${name} at ${width}`);
      assert.equal(await page.locator('h1').count(), 1, `${name}: one page heading`);
      if (width === 375 || width === 1440) await checkAccessibility(`${name}-${width}`);
      if ((width === 1440 && ['login','dashboard','jobs','reports','home'].includes(name)) || (width === 375 && ['status','jobs'].includes(name))) await page.screenshot({ path: path.join(out, `${name}-${width}.png`), fullPage: true });
      results.push({ page: name, width, overflow: false });
      if (name === 'upload') {
        await upload(); await page.getByRole('region', { name: 'Price summary' }).waitFor();
        await page.getByLabel('Pages to print', { exact: true }).fill('1,3-5');
        await page.getByLabel('Double-sided', { exact: true }).check();
        await page.getByLabel('Increase copies').click();
        await page.getByRole('region', { name: 'Price summary' }).getByText('₹12.00').waitFor();
        await overflow(`selected file at ${width}`);
        if (width === 375) await checkAccessibility('selected-file-375');
        await page.locator('h1').click();
        if (width === 375) await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        if (width === 375) await page.screenshot({ path: path.join(out, 'customer-options-375.png'), fullPage: true });
        results.push({ page: 'selected-file', width, overflow: false });
      }
    }
  }
  // Check the visible quote-loading state without contacting the quote API.
  quoteDelay = 1500;
  await page.goto(base + '/p/SHOP-001'); await upload();
  await page.getByText('Checking your PDF…', { exact: true }).waitFor();
  assert.ok(await page.getByRole('button', { name: 'Submit for approval' }).isDisabled());
  await page.getByRole('region', { name: 'Price summary' }).waitFor(); quoteDelay = 0;
  // Customer failure recovers and never submits automatically.
  await page.goto(base + '/p/SHOP-001'); await upload();
  await page.getByRole('region', { name: 'Price summary' }).waitFor();
  await page.getByLabel('Pages to print', { exact: true }).fill('0');
  assert.ok(await page.getByRole('button', { name: 'Submit for approval' }).isDisabled());
  await page.getByLabel('Pages to print', { exact: true }).fill('all');
  uploadFailure = true;
  const submittedBefore = calls.filter(c => c.pathname === '/api/jobs').length;
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.getByRole('alert').waitFor();
  assert.ok(await page.getByRole('button', { name: 'Submit for approval' }).isEnabled());
  assert.equal(calls.filter(c => c.pathname === '/api/jobs').length, submittedBefore + 1);
  uploadFailure = false;
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.waitForURL('**/j/review-job-100001?s=review-token');
  // Login error and recovery, using the existing redirect behavior.
  await page.goto(base + '/login');
  await page.getByLabel('Owner password', { exact: true }).fill('mock-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  assert.equal(await page.locator('#owner-password').getAttribute('type'), 'text');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Invalid credentials', { exact: true }).waitFor();
  loginSuccess = true;
  await page.getByRole('button', { name: 'Sign in', exact: true }).click(); await page.waitForURL('**/dashboard');
  // Dialog focus, cancel, escape, confirmed approve/reject, and network recovery.
  await page.goto(base + '/dashboard/jobs');
  const first = page.locator('tbody tr').first();
  await first.getByRole('button', { name: 'Reject', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Cancel');
  const mutationsBefore = calls.filter(c => /approve|reject/.test(c.pathname)).length;
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(calls.filter(c => /approve|reject/.test(c.pathname)).length, mutationsBefore);
  await first.getByRole('button', { name: 'Reject', exact: true }).click(); await dialog.getByRole('button', { name: 'Cancel' }).click();
  assert.equal(calls.filter(c => /approve|reject/.test(c.pathname)).length, mutationsBefore);
  await first.getByRole('button', { name: 'Accept & Print', exact: true }).click();
  await dialog.getByRole('button', { name: 'Accept & Print', exact: true }).click();
  await first.getByText('Approved', { exact: true }).waitFor();
  assert.equal(calls.find(c => c.pathname.endsWith('/approve')).body, '{}');
  const second = page.locator('tbody tr').nth(1);
  await second.getByRole('button', { name: 'Reject', exact: true }).click();
  await dialog.getByLabel('Rejection reason').fill('Please send a clearer PDF.');
  rejectNetwork = true;
  await dialog.getByRole('button', { name: 'Reject job' }).click(); await dialog.getByRole('alert').waitFor();
  assert.ok(await dialog.getByRole('button', { name: 'Cancel' }).isEnabled());
  rejectNetwork = false;
  await dialog.getByRole('button', { name: 'Reject job' }).click();
  await second.getByText('Rejected', { exact: true }).waitFor();
  assert.equal(calls.filter(c => c.pathname.endsWith('/reject')).at(-1).body, '{"reason":"Please send a clearer PDF."}');
  // Small-screen dialog overflow and keyboard focus containment.
  await page.setViewportSize({ width: 320, height: 700 }); await page.goto(base + '/dashboard/jobs');
  await page.locator('tbody tr').first().getByRole('button', { name: 'Reject', exact: true }).click();
  await overflow('dialog at 320'); await checkAccessibility('dialog-320'); await page.screenshot({ path: path.join(out, 'rejection-dialog-320.png'), fullPage: true });
  await page.keyboard.press('Shift+Tab');
  assert.ok(await page.evaluate(() => !!document.activeElement?.closest('dialog')));
  await page.keyboard.press('Escape');
  // Terminal states render truthful messages and no inferred successful timeline.
  for (const value of ['QUEUED','APPROVED','DOWNLOADING','PRINTING','FAILED','REJECTED','CANCELLED']) {
    status = value; await page.goto(base + '/p/SHOP-001/j/review-job-100001?s=review-token');
    await page.locator('.status-hero h1').waitFor(); await overflow(`status ${value}`);
    if (['FAILED','REJECTED','CANCELLED'].includes(value)) assert.equal(await page.locator('.status-timeline').count(), 0);
  }
  status = 'COMPLETED';
  // Empty queue uses real page rendering with a filter absent from fixtures.
  await page.goto(base + '/dashboard/jobs?status=APPROVED');
  await page.getByText('No jobs in this view', { exact: true }).waitFor();
  await overflow('empty queue');
  // Browser accessibility basics: labels and focus indicators.
  await page.goto(base + '/login'); await page.keyboard.press('Tab');
  const focusOutline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.notEqual(focusOutline, 'none');
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const unexpectedConsole = consoles.filter(message => !/Failed to load resource|net::ERR_FAILED/.test(message));
  assert.equal(unexpectedConsole.length, 0, JSON.stringify(unexpectedConsole));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ fixtureOnly: true, checks: results, accessibility, interactionChecks: ['upload and quote','quote loading state','invalid ranges','submission failure recovery without retry','mocked submission success','login failure and success','dialog focus and Escape','cancel sends no action','explicit approval','rejection reason and network recovery','320px modal focus containment','all active and terminal statuses','empty queue','keyboard focus'], pageErrors: errors, unexpectedConsoleErrors: unexpectedConsole, expectedNetworkErrors: consoles.length }, null, 2));
  await browser.close();
  console.log(`PASS: ${results.length} responsive page/state checks; interactions passed; ${errors.length} page errors. Screenshots: ${out}`);
})().catch(async error => { console.error(error); if (browser) await browser.close(); process.exitCode = 1; });

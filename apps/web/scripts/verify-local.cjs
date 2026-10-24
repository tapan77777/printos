// Real localhost verification: only reads and stateless quotes reach the server.
// No job submission, printing action, secret output, or database write is allowed.
const { chromium } = require(process.env.PRINTOS_PLAYWRIGHT_PATH || 'playwright');
const { PDFDocument } = require('pdf-lib');
const { createHmac } = require('node:crypto');
const fs = require('node:fs'); const path = require('node:path'); const assert = require('node:assert/strict');
process.loadEnvFile(path.resolve(__dirname, '../.env'));
const base = 'http://localhost:3001';
const out = path.resolve(__dirname, '../../../docs/local-verification');
const source = JSON.parse(fs.readFileSync('/tmp/printos-local-before-records.json', 'utf8'));
let browser;
(async () => {
  browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const blocked = []; const pageErrors = []; const failedAssets = []; const consoleErrors = [];
  await context.route('**/*', route => {
    const request = route.request(); const url = new URL(request.url());
    if (['GET','HEAD'].includes(request.method()) || (request.method() === 'POST' && url.origin === base && url.pathname === '/api/quotes')) return route.continue();
    blocked.push(url.pathname); return route.abort('blockedbyclient');
  });
  const now = Math.floor(Date.now()/1000); const body = Buffer.from(JSON.stringify({ role:'owner', iat:now, exp:now+3600 })).toString('base64url');
  await context.addCookies([{ name:'printos_session', value:`${body}.${createHmac('sha256',process.env.SESSION_SECRET).update(body).digest('base64url')}`, url:base }]);
  const page = await context.newPage();
  page.on('pageerror', e => pageErrors.push(e.name));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().replace(/postgres(?:ql)?:\/\/\S+/gi,'[redacted]')); });
  page.on('response', r => { if (r.url().includes('/_next/') && r.status() >= 400) failedAssets.push({ path:new URL(r.url()).pathname, status:r.status() }); });
  const layouts = [];
  for (const width of [320,375,430,768,1024,1440]) {
    await page.setViewportSize({ width, height:1000 });
    for (const [name, route] of [['overview','/dashboard'],['jobs','/dashboard/jobs'],['reports','/dashboard/reports']]) {
      const response = await page.goto(base + route, { waitUntil:'networkidle' });
      assert.equal(response.status(), 200);
      assert.equal(await page.getByText('We couldn’t load this view', { exact:true }).count(), 0, `${name} still errors`);
      assert.equal(await page.locator('h1').count(), 1);
      const dimensions = await page.evaluate(() => ({ viewport:innerWidth, content:document.documentElement.scrollWidth, cssLoaded:[...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.selectorText==='.filter-tabs')}catch{return false}}) }));
      assert.ok(dimensions.content <= width + 1, `${name} overflow at ${width}`);
      assert.ok(dimensions.cssLoaded, 'Missing current design-system stylesheet');
      if (name === 'jobs') {
        const styles = await page.locator('.filter-tabs').evaluate(e=>({display:getComputedStyle(e).display,gap:getComputedStyle(e).gap}));
        assert.equal(styles.display, 'flex'); assert.notEqual(styles.gap, 'normal');
        assert.equal(await page.locator('tbody tr').count(), source.jobs.length);
        const table = await page.locator('.jobs-table tr').first().evaluate(e=>getComputedStyle(e).display);
        assert.equal(table, width <= 900 ? 'grid' : 'table-row');
      }
      if (width === 375 || width === 1440) await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});
      layouts.push({page:name,width,overflow:false});
    }
  }
  // Real list filtering and non-mutating refresh.
  await page.goto(base+'/dashboard/jobs?status=FAILED',{waitUntil:'networkidle'});
  assert.equal(await page.locator('tbody tr').count(), source.jobs.filter(j=>j.printStatus==='FAILED').length);
  await page.getByRole('button',{name:'Refresh data'}).click(); await page.waitForLoadState('networkidle');
  const printer = source.printers[0];
  const pdf = await PDFDocument.create(); for(let i=0;i<8;i++) pdf.addPage();
  const bytes = Buffer.from(await pdf.save());
  async function quote(options, file=bytes) {
    return context.request.post(base+'/api/quotes',{multipart:{file:{name:'verification.pdf',mimeType:'application/pdf',buffer:file},printerId:printer.deviceId,copies:'1',colorMode:'BW',paperSize:'A4',duplex:'false',pageRange:'all',...options}});
  }
  // APIRequestContext is used ONLY for stateless quote requests and GETs.
  const pricing=[];
  for(const [options,expected] of [[{},1600],[{copies:'3',duplex:'true',pageRange:'1,3-5'},1800],[{copies:'2',colorMode:'COLOUR',duplex:'true',pageRange:'1,3-5'},3600]]) {
    const res=await quote(options); assert.equal(res.status(),200); const value=await res.json(); assert.equal(value.pageCount,8);assert.equal(value.price,expected);pricing.push({price:expected,pageCount:value.pageCount});
  }
  assert.equal((await quote({pageRange:'9'})).status(),400);
  assert.equal((await quote({},Buffer.from('%PDF-invalid'))).status(),415);
  const fileJob = source.jobs.find(j=>j.price>0) ?? source.jobs[0];
  const preview=await context.request.get(`${base}/api/jobs/${fileJob.id}/file?preview=1`);
  assert.equal(preview.status(),200);assert.ok(preview.headers()['content-type'].includes('application/pdf'));assert.ok(preview.headers()['content-disposition'].startsWith('inline'));
  assert.equal((await preview.body()).subarray(0,5).toString(),'%PDF-');
  const ownerSummary = await context.request.get(`${base}/api/jobs/${fileJob.id}`);assert.equal(ownerSummary.status(),200);
  assert.equal((await ownerSummary.json()).price,fileJob.price);
  const publicStatus=await context.request.get(`${base}/api/jobs/${fileJob.id}/public?s=${fileJob.customerSessionId}`);assert.equal(publicStatus.status(),200);assert.equal((await publicStatus.json()).price,fileJob.price);
  const anonymous=await browser.newContext();const anon=await anonymous.newPage();await anon.goto(base+'/dashboard');assert.ok(new URL(anon.url()).pathname==='/login');
  assert.equal((await anonymous.request.get(`${base}/api/jobs/${fileJob.id}`)).status(),401);
  assert.equal((await anonymous.request.get(`${base}/api/jobs/${fileJob.id}/file?preview=1`)).status(),401);await anonymous.close();
  // Real customer controls, using the existing stateless quote endpoint, without submitting.
  await page.goto(`${base}/p/${encodeURIComponent(printer.deviceId)}`);
  await page.getByLabel('Upload PDF document').setInputFiles({name:'verification.pdf',mimeType:'application/pdf',buffer:bytes});
  await page.getByRole('region',{name:'Price summary'}).getByText('₹16.00').waitFor();
  await page.getByLabel('Pages to print',{exact:true}).fill('1,3-5');await page.getByLabel('Double-sided',{exact:true}).check();await page.getByLabel('Increase copies').click();
  await page.getByRole('region',{name:'Price summary'}).getByText('₹12.00').waitFor();
  assert.equal(blocked.length,0,'Unexpected write attempted by the application');
  assert.deepEqual(pageErrors,[]);assert.deepEqual(failedAssets,[]);
  const result={realLocalData:true,layouts,pricing,previewVerified:true,authVerified:true,statusVerified:true,jobFilteringVerified:true,mutatingRequestsSent:0,pageErrors,failedAssets,consoleErrors,jobMutationsVerifiedWithMocksOnly:true};
  fs.writeFileSync(path.join(out,'after.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({layoutChecks:layouts.length,quoteChecks:5,preview:true,auth:true,status:true,filtering:true,mutatingRequestsSent:0,pageErrors:pageErrors.length,failedAssets:failedAssets.length}));
  await browser.close();
})().catch(async error=>{console.error('LOCAL_VERIFICATION_FAILED',error instanceof assert.AssertionError?error.message:'See application diagnostics');if(browser)await browser.close();process.exitCode=1});

// Read-only local browser diagnosis. Credentials remain in memory; no POST reaches the app.
const { chromium } = require(process.env.PRINTOS_PLAYWRIGHT_PATH || 'playwright');
const { createHmac } = require('node:crypto');
const fs = require('node:fs'); const path = require('node:path');
process.loadEnvFile(path.resolve(__dirname, '../.env'));
const out = path.resolve(__dirname, '../../../docs/local-verification'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route('**/*', route => ['GET','HEAD'].includes(route.request().method()) ? route.continue() : route.abort('blockedbyclient'));
  const now = Math.floor(Date.now()/1000); const body = Buffer.from(JSON.stringify({ role:'owner', iat:now, exp:now+3600 })).toString('base64url');
  await context.addCookies([{name:'printos_session', value:`${body}.${createHmac('sha256',process.env.SESSION_SECRET).update(body).digest('base64url')}`, url:'http://localhost:3001'}]);
  const page = await context.newPage(); const result = [];
  for (const name of ['dashboard','dashboard/jobs','dashboard/reports']) {
    const errors = []; const failed = [];
    const onError = e => errors.push(e.message.replace(/postgres(?:ql)?:\/\/\S+/gi,'[database URL redacted]'));
    const onResponse = response => { if (response.status() >= 400) failed.push({url:new URL(response.url()).pathname,status:response.status()}); };
    page.on('pageerror',onError); page.on('response',onResponse);
    await page.goto('http://localhost:3001/'+name,{waitUntil:'networkidle'});
    const info = await page.evaluate(() => ({ title:document.querySelector('h1')?.textContent, error:document.body.innerText.includes('couldn’t load')||document.body.innerText.includes("couldn't load"), css:[...document.styleSheets].map(s=>({href:s.href && new URL(s.href).pathname,rules:(()=>{try{return s.cssRules.length}catch{return -1}})()})), filter:(()=>{const e=document.querySelector('.filter-tabs');return e?{display:getComputedStyle(e).display,gap:getComputedStyle(e).gap}:null})(), table:(()=>{const e=document.querySelector('.data-table');return e?{display:getComputedStyle(e).display,fontSize:getComputedStyle(e).fontSize}:null})(), overflow:document.documentElement.scrollWidth>innerWidth }));
    await page.screenshot({path:path.join(out,`before-${name.replaceAll('/','-')}.png`),fullPage:true});
    result.push({page:name,...info,errors,failed}); page.off('pageerror',onError);page.off('response',onResponse);
  }
  fs.writeFileSync(path.join(out,'before.json'),JSON.stringify(result,null,2)); console.log(JSON.stringify(result,null,2)); await browser.close();
})().catch(()=>{console.error('LOCAL_BROWSER_DIAGNOSIS_FAILED'); process.exitCode=1});

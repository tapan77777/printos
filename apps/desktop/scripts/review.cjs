const { _electron:electron }=require('playwright');const {createServer}=require('node:http');const {mkdtemp,mkdir,writeFile,readFile}=require('node:fs/promises');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
async function main(){
 const profile=await mkdtemp(path.join(os.tmpdir(),'printos-desktop-review-'));const output=path.resolve(__dirname,'../../../docs/phase-2e2-verification/desktop');await mkdir(output,{recursive:true});
 const writes=[];const requests=[];
 const server=createServer((req,res)=>{requests.push(req.url);if(req.method!=='GET'){writes.push(req.url);res.writeHead(405);res.end();return;}
  if(req.url==='/api/admin/printers'){if(!req.headers.cookie?.includes('fixture_owner=mock-only')){res.writeHead(401);res.end('Unauthorized');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify([{name:'Synthetic Test Queue',deviceId:'REVIEW-ONLY',status:'OFFLINE',simulationOnly:false}]));return;}
  if(req.url.startsWith('/login'))res.setHeader('Set-Cookie','fixture_owner=mock-only; HttpOnly; SameSite=Lax; Path=/');
  const page=req.url.startsWith('/login')?'Sign in':req.url.startsWith('/dashboard/jobs')?'Print Jobs':req.url.startsWith('/dashboard/reports')?'Reports':'Overview';
  res.setHeader('Content-Type','text/html');res.end(`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:system-ui;background:#F8FAFC;color:#172554;padding:40px}h1{font-size:36px}a{color:#2563EB}</style></head><body><small>SAFE MOCK CLOUD — NO CUSTOMER DATA</small><h1>${page}</h1><p>Navigation fixture. The packaged app reuses your hosted Next.js dashboard.</p><a href="https://evil.invalid/dashboard">Blocked external navigation</a><button id="probe">Probe desktop access</button><p id="result"></p><script>document.getElementById('probe').onclick=()=>document.getElementById('result').textContent=String(typeof window.printos)+' / '+String(typeof require);</script></body></html>`);
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
 let app;
 try{
 app=await electron.launch({executablePath:require('electron'),args:[path.resolve(__dirname,'..')],env:{...process.env,PRINTOS_DESKTOP_REVIEW:'1',PRINTOS_DESKTOP_REVIEW_DIR:profile},timeout:30000});
 const page=await app.firstWindow();await page.waitForSelector('h2');const errors=[];page.on('pageerror',e=>errors.push(e.message));
 assert.equal(await page.locator('h2').textContent(),'A calmer day at the counter.');
 assert.match(await page.locator('#health').textContent(),/disabled/);
 await page.screenshot({path:path.join(output,'welcome-macos.png')});
 await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.locator('#origin').fill(origin);
 // Use the actual IPC boundary from the trusted local frame; no credentials are supplied.
 assert.equal((await page.evaluate(origin=>window.printos.request('origin',origin),origin)).ok,true);
 assert.equal((await page.evaluate(()=>window.printos.request('cloud-printers'))).ok,false);
 await page.evaluate(()=>window.printos.request('navigate','/login'));
 await page.getByRole('button',{name:'Printers & setup',exact:true}).click();
 await page.getByRole('button',{name:'Check signed-in connection'}).click();await page.waitForSelector('#notice:not([hidden])');
 await page.getByRole('button',{name:'Connect this computer',exact:true}).click();assert.match(await page.locator('#screen').textContent(),/Real printing is not activated/);
 await page.screenshot({path:path.join(output,'pairing-blocked-macos.png')});
 await page.getByRole('button',{name:'Discover printers',exact:true}).click();await page.getByRole('button',{name:'Discover installed printers'}).click();await page.waitForSelector('#error:not([hidden])');assert.match(await page.locator('#error').textContent(),/Windows/);
 await page.getByRole('button',{name:'Customer QR code',exact:true}).click();await page.locator('#cloud-printer').selectOption('REVIEW-ONLY');await page.getByRole('button',{name:'Display QR',exact:true}).click();await page.waitForSelector('#qr-result img');
 assert.equal(await page.locator('#qr-result img').getAttribute('src').then(s=>s.startsWith('data:image/png;base64,')),true);
 await page.screenshot({path:path.join(output,'qr-mock-macos.png')});
 for(const [label,route]of [['Overview','/dashboard'],['Print jobs','/dashboard/jobs'],['Reports','/dashboard/reports']]){
  await page.getByRole('button',{name:label,exact:true}).click();
  for(let i=0;i<50;i++){if(await app.evaluate(({webContents},route)=>webContents.getAllWebContents().some(c=>c.getURL().endsWith(route)),route))break;await new Promise(resolve=>setTimeout(resolve,100));}
  await app.evaluate(async({webContents},route)=>{const remote=webContents.getAllWebContents().find(c=>c.getURL().endsWith(route));if(!remote)throw Error('Remote route missing');const result=await remote.executeJavaScript('({bridge:typeof window.printos,node:typeof require})');if(result.bridge!=='undefined'||result.node!=='undefined')throw Error('Remote privilege leak');},route);
 }
 // Probe through the unprivileged remote page and verify the main process rejects forged IPC.
 const denied=await app.evaluate(async({webContents})=>{const remote=webContents.getAllWebContents().find(c=>c.getURL().includes('/dashboard/reports'));return remote.executeJavaScript("({bridge:typeof window.printos,node:typeof require})");});assert.deepEqual(denied,{bridge:'undefined',node:'undefined'});
 await page.getByRole('button',{name:'Printers & setup',exact:true}).click();
 await page.getByRole('button',{name:'Run safe diagnostics'}).click();await page.waitForFunction(()=>document.querySelector('#health').textContent.includes('Shared engine running'),{timeout:15000});
 const crashedPid=await app.evaluate(({app})=>{const child=app.getAppMetrics().find(p=>p.name==='PrintOS isolated diagnostics');if(!child)throw Error('Missing diagnostic child');process.kill(child.pid,'SIGKILL');return child.pid;});
 for(let i=0;i<100;i++){if(await app.evaluate(({app},old)=>app.getAppMetrics().some(p=>p.name==='PrintOS isolated diagnostics'&&p.pid!==old),crashedPid))break;await new Promise(resolve=>setTimeout(resolve,100));}
 await page.waitForFunction(()=>document.querySelector('#health').textContent.includes('Shared engine running'));
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
 assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isVisible()),false);
 const alive=await app.evaluate(({app})=>app.getAppMetrics().some(p=>p.name==='PrintOS isolated diagnostics'));assert.equal(alive,true);
 await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].show());
 await page.getByRole('button',{name:'Stop diagnostics'}).click();await page.waitForFunction(()=>document.querySelector('#health').textContent.includes('stopped safely')||document.querySelector('#health').textContent==='Printing disabled.');
 await page.screenshot({path:path.join(output,'diagnostics-macos.png')});
 for(const width of [820,1024,1440]){await app.evaluate(({BrowserWindow},width)=>BrowserWindow.getAllWindows()[0].setContentSize(width,800),width);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,`Horizontal overflow at ${width}`);}
 await page.screenshot({path:path.join(output,'setup-1440-macos.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 assert.equal(requests.includes('/api/jobs/claim'),false);
 const config=JSON.parse(await readFile(path.join(profile,'desktop-config.json'),'utf8'));assert.equal('agentToken' in config,false);
 await writeFile(path.join(output,'results.json'),JSON.stringify({platform:process.platform,fixture:'isolated synthetic HTTP cloud',navigation:['login','overview','jobs','reports'],checks:['local onboarding','pairing setup present; activation blocked','macOS discovery explicitly unavailable','QR from verified mock registry','remote Node and IPC absent','window close retains diagnostic worker','diagnostic crash recovery','safe diagnostic stop','820/1024/1440 layout overflow','no cloud writes','no job claims'],pageErrors:errors,cloudWrites:writes},null,2));
 console.log('Electron mock review passed. Screenshots: docs/desktop-verification. No real cloud or printing used.');
 }finally{if(app)await app.close();await new Promise(resolve=>server.close(resolve));}
}
main().catch(e=>{console.error(e);process.exitCode=1;});

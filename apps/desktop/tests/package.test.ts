import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import path from 'node:path';
const root=path.resolve(__dirname,'..');
test('installer is per-user, x64, non-elevating, does not autorun or delete recovery state',()=>{
 const p=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));
 assert.equal(p.build.win.target[0].arch[0],'x64');assert.equal(p.build.win.requestedExecutionLevel,'asInvoker');assert.equal(p.build.nsis.allowElevation,false);assert.equal(p.build.nsis.perMachine,false);assert.equal(p.build.nsis.runAfterFinish,false);assert.equal(p.build.nsis.deleteAppDataOnUninstall,false);
 assert.equal(p.build.files.some((p:string)=>p.includes('.env')),false);assert.equal(p.build.extraResources[0].from,'resources/agent');assert.ok(!p.devDependencies.electron.includes('^'));assert.ok(!p.devDependencies['electron-builder'].includes('^'));
});
test('staged agent has compiled shared core and no credentials or uploads',()=>{
 for(const p of ['dist/core/Engine.js','dist/core/Journal.js','dist/adapters/WindowsPrintDevice.js','windows/spooler.ps1'])assert.equal(existsSync(path.join(root,'resources/agent',p)),true);
 for(const p of ['.env','node_modules','tmp-uploads'])assert.equal(existsSync(path.join(root,'resources/agent',p)),false);
});
test('remote dashboard receives no preload or node integration; local CSP restricts network',()=>{
 const source=readFileSync(path.join(root,'src/main.ts'),'utf8');assert.ok(source.includes('nodeIntegration:false,contextIsolation:true,sandbox:true'));assert.ok(source.includes('new WebContentsView({webPreferences:{session:cloudSession(),nodeIntegration:false'));assert.ok(!source.includes('webSecurity:false'));assert.ok(!source.includes('ignore-certificate-errors'));
 const html=readFileSync(path.join(root,'ui/index.html'),'utf8');assert.ok(html.includes("connect-src 'none'"));assert.ok(html.includes("object-src 'none'"));
});
test('packaged Electron disables Node injection and enforces ASAR loading and cookie encryption',()=>{
 const p=JSON.parse(readFileSync(path.join(root,'package.json'),'utf8'));const f=p.build.electronFuses;
 assert.equal(f.runAsNode,false);assert.equal(f.enableNodeOptionsEnvironmentVariable,false);assert.equal(f.enableNodeCliInspectArguments,false);assert.equal(f.enableCookieEncryption,true);assert.equal(f.onlyLoadAppFromAsar,true);assert.equal(f.enableEmbeddedAsarIntegrityValidation,true);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cloudOrigin,allowNavigation,validateConfig,validLocalSender} from '../src/policy';
test('packaged origin requires hosted HTTPS without credentials or paths',()=>{
 assert.equal(cloudOrigin('https://print.example',true),'https://print.example');
 for(const value of ['http://print.example','http://localhost:3001','https://localhost','https://u:p@print.example','https://print.example/dashboard','https://print.example?q=token','file:///tmp/index.html','javascript:alert(1)'])assert.throws(()=>cloudOrigin(value,true));
 assert.equal(cloudOrigin('http://127.0.0.1:3018',false),'http://127.0.0.1:3018');
});
test('navigation permits only actual cloud dashboard, login, preview and customer entry routes',()=>{
 const origin='https://print.example';
 for(const route of ['/login?next=/dashboard/jobs','/dashboard','/dashboard/jobs','/dashboard/reports','/dashboard/pricing','/api/jobs/abc-12/file','/p/BOX-1'])assert.equal(allowNavigation(origin+route,origin),true);
 for(const value of ['https://attacker.test/dashboard','file:///etc/passwd','https://print.example.evil/dashboard','https://print.example/api/jobs/claim','https://print.example/settings','https://print.example/dashboard/../api/admin/printers'])assert.equal(allowNavigation(value,origin),false);
});
test('local configuration contains no tokens or unvalidated queue identity',()=>{
 const valid=validateConfig({version:1,origin:'https://print.example',agentToken:'must-not-persist',printer:{name:'Office',identifier:'a'.repeat(64)}},true);
 assert.equal('agentToken' in valid,false);assert.equal(valid.printer?.name,'Office');
 for(const printer of [{name:'Office',identifier:'bad'},{name:'Office\nDanger',identifier:'a'.repeat(64)}])assert.throws(()=>validateConfig({version:1,printer},true));
});
test('IPC denies remote windows, iframes and unexpected local paths',()=>{
 const file='file:///app/ui/index.html';
 assert.equal(validLocalSender(1,1,file,file,true),true);
 assert.equal(validLocalSender(2,1,file,file,true),false);
 assert.equal(validLocalSender(1,1,'https://print.example',file,true),false);
 assert.equal(validLocalSender(1,1,file,file,false),false);
 assert.equal(validLocalSender(1,1,file+'?evil',file,true),false);
});
test('account registration, recovery and shop selection remain unprivileged cloud routes',()=>{
 for(const route of ['/register','/recover','/reset-password?token=fixture','/shops'])assert.equal(allowNavigation('https://print.example'+route,'https://print.example'),true);
 assert.equal(allowNavigation('https://evil.invalid/shops','https://print.example'),false);
});

test('private document windows accept only short-lived single-object grants',async()=>{
 const {privateDocumentGrant}=await import('../src/policy');const now=Date.now();const valid={url:'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/sign/docs/objects/'+'a'.repeat(64)+'/b3714b56-8541-4a1b-8ae5-cd8f3d53e9bd.pdf?token=fixture',sha256:'a'.repeat(64),sizeBytes:100,expiresAt:new Date(now+60000).toISOString()};assert.equal(privateDocumentGrant(valid,now),valid.url);for(const patch of [{url:'https://attacker.invalid/pdf'},{url:'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/docs/x.pdf'},{expiresAt:new Date(now-1000).toISOString()},{sha256:'bad'}])assert.throws(()=>privateDocumentGrant({...valid,...patch},now));
});

test('isolated PDF preview allows only its exact grant and bundled Chromium viewer resources',async()=>{const {privatePreviewRequest}=await import('../src/policy');const grant='https://fixture.invalid/single-authorized-object';assert.equal(privatePreviewRequest(grant,'GET',grant),true);assert.equal(privatePreviewRequest(grant,'POST',grant),false);assert.equal(privatePreviewRequest('https://fixture.invalid/another-object','GET',grant),false);assert.equal(privatePreviewRequest('chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/pdf_viewer.js','GET',grant),true);assert.equal(privatePreviewRequest('chrome-extension://untrusted-extension/pdf_viewer.js','GET',grant),false);});

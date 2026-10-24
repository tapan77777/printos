const {readFile,readdir,stat,mkdir,writeFile}=require('node:fs/promises');const path=require('node:path');const assert=require('node:assert/strict');const {createHash}=require('node:crypto');
const {getCurrentFuseWire,FuseV1Options}=require('@electron/fuses');const asar=require('@electron/asar');
const root=path.resolve(__dirname,'..');
const version=require('../package.json').version;
async function describe(file){const bytes=await readFile(file);return {file:path.relative(root,file),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
async function pe(file){const b=await readFile(file);assert.equal(b.readUInt16LE(0),0x5a4d);const offset=b.readUInt32LE(0x3c);assert.equal(b.readUInt32LE(offset),0x4550);const optional=offset+24;const magic=b.readUInt16LE(optional);const cert=optional+(magic===0x20b?112:96)+32;return {machine:b.readUInt16LE(offset+4).toString(16),hasAuthenticodeCertificate:b.readUInt32LE(cert+4)>0};}
async function walk(dir){let files=[];for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);files.push(...e.isDirectory()?await walk(f):[f]);}return files;}
async function inspect(resources,binary){
 const archive=path.join(resources,'app.asar');const files=asar.listPackage(archive);
 for(const expected of ['/dist/main.js','/dist/preload.js','/dist/worker.js','/dist/liveWorker.js','/ui/index.html','/node_modules/qrcode/package.json'])assert.ok(files.includes(expected),`Missing packaged file ${expected}`);
 for(const forbidden of [/\.env(?:\.|$)/,/\.pdf$/,/\/tmp-uploads\//,/\/node_modules\/(next|electron-builder|playwright)\//])assert.ok(!files.some(p=>forbidden.test(p)),`Unexpected packaged content ${forbidden}`);
 for(const f of ['dist/main.js','dist/worker.js','dist/liveWorker.js','dist/supervisor.js','ui/app.js'])assert.deepEqual(asar.extractFile(archive,f),await readFile(path.join(root,f)));
 const agent=path.join(resources,'agent');for(const file of await walk(agent))assert.ok(!/\.env|\.pdf$/i.test(path.basename(file)));
 for(const name of ['dist/core/Engine.js','dist/core/CloudClient.js','dist/core/Journal.js','dist/adapters/WindowsPrintDevice.js','windows/spooler.ps1']){
  const expected=await readFile(path.join(root,'resources/agent',name));assert.deepEqual(await readFile(path.join(agent,name)),expected);
 }
 const wire=await getCurrentFuseWire(binary);
 // FuseState uses ASCII '0'/'1' in the wire.
 for(const flag of [FuseV1Options.RunAsNode,FuseV1Options.EnableNodeOptionsEnvironmentVariable,FuseV1Options.EnableNodeCliInspectArguments])assert.equal(wire[flag],48);
 for(const flag of [FuseV1Options.EnableCookieEncryption,FuseV1Options.EnableEmbeddedAsarIntegrityValidation,FuseV1Options.OnlyLoadAppFromAsar])assert.equal(wire[flag],49);
 return {archive:await describe(archive),agentMatchesStaged:true,secretAndDocumentFilenameScan:'passed',fuses:wire};
}
(async()=>{
 const win=path.join(root,'release/win-unpacked');const mac=path.join(root,'release/mac-arm64/PrintOS.app/Contents');const installer=path.join(root,`release/PrintOS Setup ${version}.exe`);
 const payload=await pe(path.join(win,'PrintOS.exe'));assert.equal(payload.machine,'8664');
 const results={checkedOn:process.platform,installer:await describe(installer),installerPE:await pe(installer),windowsPayload:payload,
  windows:await inspect(path.join(win,'resources'),path.join(win,'PrintOS.exe')),
  mac:'Not rebuilt; Windows artifact inspection only',
  windowsExecution:'not performed',physicalPrinting:'not performed',signing:'No production signing credentials configured; certificate-presence check is not trust verification.'};
 const output=path.resolve(root,'../../docs/mvp-verification');await mkdir(output,{recursive:true});await writeFile(path.join(output,'artifacts.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});

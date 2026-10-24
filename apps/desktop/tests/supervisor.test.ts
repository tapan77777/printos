import {test} from 'node:test';import assert from 'node:assert/strict';import {Supervisor,type Worker} from '../src/supervisor';
class FakeWorker implements Worker {
 callbacks:Record<string,Function[]>={};sent:unknown[]=[];
 on(event:string,callback:Function){(this.callbacks[event]??=[]).push(callback);}
 postMessage(value:unknown){this.sent.push(value);}
 emit(event:string,value:unknown){for(const callback of this.callbacks[event]??[])callback(value);}
}
function fixture(){let jobs:Function[]=[];const children:FakeWorker[]=[];
 const s=new Supervisor(()=>{const c=new FakeWorker();children.push(c);return c;},((fn:Function)=>{jobs.push(fn);return jobs.length;}) as any,(()=>{jobs=[];}) as any);
 return {s,children,fire(){const next=jobs.shift();assert.ok(next);next();},pending:()=>jobs.length};}
test('nothing starts automatically; repeated requests launch only one worker',()=>{const f=fixture();assert.equal(f.children.length,0);f.s.startDiagnostic();f.s.startDiagnostic();assert.equal(f.children.length,1);f.children[0].emit('message',{type:'ready'});assert.equal(f.s.health.state,'diagnostic');});
test('dashboard closure does not stop supervision; explicit stop waits for worker exit',async()=>{const f=fixture();f.s.startDiagnostic();f.children[0].emit('message',{type:'ready'});assert.equal(f.s.health.state,'diagnostic');let done=false;const stop=f.s.stop().then(()=>{done=true;});await Promise.resolve();assert.equal(done,false);assert.deepEqual(f.children[0].sent,[{type:'stop'}]);f.children[0].emit('exit',0);await stop;assert.equal(f.s.health.state,'disabled');});
test('crashes recover with bounded backoff, then block instead of spinning',()=>{const f=fixture();f.s.startDiagnostic();f.children[0].emit('exit',1);assert.equal(f.pending(),1);f.fire();f.children[1].emit('exit',1);f.fire();f.children[2].emit('exit',1);assert.equal(f.s.health.state,'blocked');assert.equal(f.pending(),0);f.s.startDiagnostic();assert.equal(f.children.length,3);});
test('shutdown cancels pending restarts and stale child messages cannot change health',async()=>{const f=fixture();f.s.startDiagnostic();f.children[0].emit('exit',1);await f.s.stop();assert.equal(f.pending(),0);f.children[0].emit('message',{type:'ready'});assert.equal(f.s.health.state,'disabled');});
test('live mode requires an explicit start and denial stops recovery restarts',()=>{let starts=0;const child=new FakeWorker();const s=new Supervisor(mode=>{assert.equal(mode,'live');starts++;return child;});assert.equal(starts,0);s.startLive();s.startLive();assert.equal(starts,1);child.emit('message',{type:'ready'});assert.equal(s.health.state,'live');child.emit('message',{type:'blocked'});child.emit('exit',0);assert.equal(s.health.state,'blocked');});

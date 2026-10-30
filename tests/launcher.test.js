import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {launch,probe} from '../scripts/launch-admin.mjs';
import {runtimeIdentity} from '../server/local-runtime.js';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import request from 'supertest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('launcher: existing server only opens browser; occupied port never starts',async()=>{
  let opens=0;
  const forbidden=()=>assert.fail('must not start or check dependencies');
  assert.deepEqual(await launch({inspect:async()=> 'ready',open:async()=>opens++,start:forbidden,check:forbidden}),{reused:true});
  assert.equal(opens,1);
  await assert.rejects(launch({inspect:async()=> 'occupied',open:forbidden,start:forbidden,check:forbidden}),/3000/);
});
test('launcher: stopped server waits for actual HTTP readiness; second launch reuses it',async t=>{
  // Separate real Node process, ephemeral port and no database, browser or Git side effects.
  const reserve=http.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');
  const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  assert.equal(await probe(port),'stopped');
  let child,checks=0,opens=0,starts=0;
  t.after(()=>child?.kill());
  const options={inspect:()=>probe(port),check:async()=>checks++,open:async()=>{assert.equal(await probe(port),'ready');opens++;},
    start:()=>{starts++;return child=spawn(process.execPath,['--input-type=module','-e',`import http from 'node:http';setTimeout(()=>http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(${JSON.stringify(JSON.stringify(runtimeIdentity))});}).listen(${port},'127.0.0.1'),150);`],{stdio:'ignore',shell:false});}};
  assert.equal((await launch(options)).reused,false);
  assert.equal((await launch(options)).reused,true);
  assert.equal(starts,1);assert.equal(checks,1);assert.equal(opens,2);
  const exited=once(child,'exit');child.kill();await exited;
  assert.equal(await probe(port),'stopped');
});
test('launcher: wrong HTTP application is occupied; errors and timeout do not open browser',async t=>{
  const server=http.createServer((req,res)=>res.end('{}'));server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>server.close());assert.equal(await probe(server.address().port),'occupied');
  await assert.rejects(launch({inspect:async()=> 'stopped',check:async()=>{throw new Error('missing dependencies');},start:()=>assert.fail(),open:()=>assert.fail()}),/dependencies/);
  const child=new EventEmitter();let killed=false;child.kill=()=>{killed=true;};
  await assert.rejects(launch({inspect:async()=> 'stopped',check:async()=>{},start:()=>child,open:()=>assert.fail(),delay:async()=>{},attempts:2}),/thời gian chờ/);
  assert.equal(killed,true);
});
test('launcher refuses a running legacy/bypass server without starting or killing it',async t=>{
 const server=http.createServer((req,res)=>res.end(JSON.stringify({...runtimeIdentity,authMode:'local',launcherVersion:3})));
 server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
 const inspect=()=>probe(server.address().port);
 assert.equal(await inspect(),'occupied');
 await assert.rejects(launch({inspect,start:()=>assert.fail('must not start second server'),open:()=>assert.fail('must not open bypass admin'),check:()=>assert.fail()}),/phiên bản IVAN cũ/);
 assert.equal(server.listening,true);
});
test('127.0.0.1 entry redirects to existing OAuth origin; health contains no private config',async t=>{
  const db=openDatabase(':memory:');t.after(()=>db.close());
  const config={baseUrl:'http://localhost:3000',adminEmail:'private@example.com',clientId:'test',clientSecret:'secret',sessionSecret:'x'.repeat(40),redirectUri:'http://localhost:3000/auth/google/callback'};
  const app=createApp({config,db,publisher:{}});
  await request(app).get('/admin').set('Host','127.0.0.1:3000').expect(302).expect('Location','http://localhost:3000/admin');
  await request(app).post('/api/admin/posts').set('Host','127.0.0.1:3000').expect(403);
  const health=await request(app).get('/api/local/ready').expect(200);
  assert.deepEqual(health.body,runtimeIdentity);assert.ok(!health.text.includes(config.adminEmail));
});
test('actual Express entry starts only on IPv4 loopback and stops without touching real SQLite',async t=>{
  const directory=await mkdtemp(path.join(tmpdir(),'ivan-launch-'));
  const reserve=http.createServer();reserve.listen(0,'127.0.0.1');await once(reserve,'listening');
  const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
  const child=spawn(process.execPath,['server/index.js'],{stdio:['ignore','pipe','pipe'],shell:false,env:{...process.env,PORT:String(port),BASE_URL:`http://localhost:${port}`,GOOGLE_REDIRECT_URI:`http://localhost:${port}/auth/google/callback`,ADMIN_EMAIL:'test@example.com',GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',SESSION_SECRET:'x'.repeat(48),DATABASE_PATH:path.join(directory,'test.sqlite')}});
  const exited=once(child,'exit');let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',()=>{});
  t.after(async()=>{child.kill();await exited;await rm(directory,{recursive:true,force:true});});
  for(let i=0;i<80&&await probe(port)!=='ready';i++)await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await probe(port),'ready');assert.match(output,/127\.0\.0\.1/);
  const admin=await fetch(`http://127.0.0.1:${port}/admin`,{redirect:'manual'});
  assert.equal(admin.headers.get('location'),`http://localhost:${port}/admin`);
  assert.equal(await probe(port),'ready'); // Readiness is independent of the unauthenticated /admin -> /login redirect.
  child.kill('SIGTERM');await exited;assert.equal(await probe(port),'stopped');
});

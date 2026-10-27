import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import {localPublishAllowed} from '../server/publish-routes.js';
import {createPostSource} from '../js/post-source.js';

test('publish API requires admin, loopback Host, no proxy, Origin, CSRF and explicit preview confirmation',async t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());let pending,prepared=0,pushed=0,busy=false;
 const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.com',clientId:'test',clientSecret:'test',sessionSecret:randomBytes(40).toString('hex'),secure:false};
 const oauth={generateAuthUrl(p){pending=p;return'https://accounts.google.com/auth';},async getToken(){return{tokens:{id_token:'test'}}},async verifyIdToken(){return{getPayload:()=>({sub:'admin',email:config.adminEmail,email_verified:true,nonce:pending.nonce})}}};
 const id='12345678-1234-1234-1234-123456789abc';let owner;
 const publisher={async status(){return{status:'idle',busy};},async prepare(session){prepared++;owner=session;return{id,needsConfirmation:true};},previewDirectory(previewId,session){assert.equal(previewId,id);assert.equal(session,owner);return process.cwd()+'/docs';},async publish(previewId,session){assert.equal(previewId,id);assert.equal(session,owner);pushed++;}};
 const app=createApp({config,db,oauthClient:oauth,publisher}),agent=request.agent(app);
 await request(app).get('/api/admin/publish/status').expect(401);await request(app).post('/api/admin/publish/confirm').send({confirm:true,previewId:id}).expect(401);
 await agent.get('/auth/google');await agent.get('/auth/google/callback').query({state:pending.state,code:'test'}).expect(302);const csrf=(await agent.get('/api/admin/session')).body.csrfToken;
 const write=(url,body)=>agent.post(url).set('Host','localhost:3000').set('Origin',config.baseUrl).set('X-CSRF-Token',csrf).send(body);
 await agent.get('/api/admin/publish/status').set('Host','evil.example').expect(403);
 await agent.get('/api/admin/publish/status').set('Host','localhost:3000').set('X-Forwarded-For','203.0.113.8').expect(403);
 await agent.post('/api/admin/publish/preview').set('Host','localhost:3000').send({}).expect(403);
 await agent.post('/api/admin/publish/preview').set('Host','localhost:3000').set('Origin','https://evil.example').set('X-CSRF-Token',csrf).send({}).expect(403);
 await write('/api/admin/publish/preview',{}).expect(200);assert.equal(prepared,1);assert.equal(pushed,0);
 await write('/api/admin/publish/confirm',{previewId:id,confirm:false}).expect(400);
 busy=true;await write('/api/admin/publish/confirm',{previewId:id,confirm:true}).expect(409);busy=false;
 await write('/api/admin/publish/confirm',{previewId:id,confirm:true}).expect(202);assert.equal(pushed,1);
 config.nodeEnv='production';await agent.get('/api/admin/publish/status').set('Host','localhost:3000').expect(403);
});

test('Internet addresses, forwarded requests and production cannot use publishing; preview iframe reads its own static JSON',async()=>{
 const request=(address,headers={})=>({socket:{remoteAddress:address},get:key=>({host:'localhost:3000',...headers})[key]});
 assert.equal(localPublishAllowed(request('203.0.113.8'),{baseUrl:'http://localhost:3000'}),false);
 assert.equal(localPublishAllowed(request('127.0.0.1'),{baseUrl:'https://example.com'}),false);
 assert.equal(localPublishAllowed(request('127.0.0.1',{forwarded:'for=8.8.8.8'}),{baseUrl:'http://localhost:3000'}),false);
 assert.equal(localPublishAllowed(request('127.0.0.1'),{baseUrl:'http://localhost:3000',nodeEnv:'production'}),false);
 const calls=[],source=createPostSource({location:{hostname:'localhost',port:'3000',href:'http://localhost:3000/api/admin/publish/previews/12345678-1234-1234-1234-123456789abc/site/'},fetcher:async url=>{calls.push(url);return{ok:true,json:async()=>({schemaVersion:1,posts:[]})};}});
 assert.equal(source.local,false);await source.list();assert.equal(calls[0],'http://localhost:3000/api/admin/publish/previews/12345678-1234-1234-1234-123456789abc/site/content/posts.json');
});

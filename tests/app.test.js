import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { validatePost } from '../server/posts.js';
import { detailHTML } from '../js/content.js';
const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.com',clientId:'test-client',clientSecret:'test-secret',sessionSecret:randomBytes(48).toString('hex'),secure:false};
const post={slug:'first-post',title:'Bai viet',category:'game',description:'Mo ta',introduction:'<script>alert(1)</script>',instructions:'<img src=x onerror=alert(1)>',cover_url:'',images:[],attachment_url:'',drive_file_id:'',media_url:'',status:'draft'};
function setup(t){
 const db=openDatabase(':memory:');t.after(()=>db.close());let pending,identity={};
 const oauth={generateAuthUrl(params){pending=params;return `https://accounts.google.com/auth?state=${params.state}`},async getToken(options){assert.equal(options.code,'valid-code');assert.ok(options.codeVerifier);return{tokens:{id_token:'fake-test-only'}}},async verifyIdToken(){return{getPayload:()=>({sub:'123',email:config.adminEmail,email_verified:true,nonce:pending.nonce,...identity})}}};
 const app=createApp({config,db,oauthClient:oauth}),agent=request.agent(app);
 async function login(overrides={}){identity=overrides;await agent.get('/auth/google').expect(302);return agent.get('/auth/google/callback').query({state:pending.state,code:'valid-code'});}
 return{db,app,agent,login,pending:()=>pending};
}
const write=(agent,method,url,token,body)=>agent[method](url).set('Origin',config.baseUrl).set('X-CSRF-Token',token).send(body);
test('anonymous cannot access admin HTML, assets, preview or write APIs',async t=>{
 const{app}=setup(t);
 for(const route of ['/admin','/admin/index.html','/admin/admin.js','/admin/admin.css'])await request(app).get(route).expect(302).expect('Location','/login');
 for(const route of ['/api/admin/session','/api/admin/posts','/api/admin/posts/id'])await request(app).get(route).expect(401);
 await request(app).post('/api/admin/posts').send(post).expect(401);await request(app).put('/api/admin/posts/id').send(post).expect(401);await request(app).post('/api/admin/preview').send(post).expect(401);
 for(const route of ['/.env','/data/ivan.sqlite','/server/app.js','/package.json','/.git/config'])await request(app).get(route).expect(404);
 await request(app).get('/').expect(200);await request(app).get('/login').expect(200);assert.deepEqual((await request(app).get('/api/posts').expect(200)).body,[]);
});
test('OAuth rejects missing state, bad state, nonce, unverified and non-admin email',async t=>{
 const{agent,login}=setup(t);
 await agent.get('/auth/google/callback?state=bad&code=valid-code').expect(400);
 await agent.get('/auth/google').expect(302);await agent.get('/auth/google/callback?state=bad&code=valid-code').expect(400);
 for(const identity of [{email:'stranger@example.com'},{email_verified:false},{nonce:'wrong'}]){assert.equal((await login(identity)).status,403);await agent.get('/api/admin/session').expect(401);}
});
test('CRUD, published visibility, validation, CSRF, preview and logout',async t=>{
 const{app,agent,login}=setup(t);const signed=await login();assert.equal(signed.status,302);assert.equal(signed.headers.location,'/admin');
 assert.ok(signed.headers['set-cookie'][0].includes('HttpOnly'));assert.ok(signed.headers['set-cookie'][0].includes('SameSite=Lax'));
 await agent.get('/admin').redirects(1).expect(200);await agent.get('/admin/admin.js').expect(200);
 const token=(await agent.get('/api/admin/session').expect(200)).body.csrfToken;
 await agent.post('/api/admin/posts').send(post).expect(403);
 await agent.post('/api/admin/posts').set('Origin',config.baseUrl).set('X-CSRF-Token','bad').send(post).expect(403);
 await agent.post('/api/admin/posts').set('Origin','https://evil.example').set('X-CSRF-Token',token).send(post).expect(403);
 await agent.post('/api/admin/posts').set('X-CSRF-Token',token).send(post).expect(403);
 const created=(await write(agent,'post','/api/admin/posts',token,post).expect(201)).body;
 assert.equal(created.status,'draft');assert.ok(created.created_at);assert.ok(created.updated_at);
 assert.equal((await request(app).get('/api/posts')).body.length,0);await request(app).get('/api/posts/first-post').expect(404);
 assert.equal((await agent.get(`/api/admin/posts/${created.id}`).expect(200)).body.id,created.id);
 const preview=await write(agent,'post','/api/admin/preview',token,{...post,title:'Preview only'}).expect(200);assert.equal(preview.body.title,'Preview only');assert.equal((await agent.get('/api/admin/posts')).body.length,1);
 const published=(await write(agent,'put',`/api/admin/posts/${created.id}`,token,{...post,status:'published'}).expect(200)).body;
 assert.equal(published.created_at,created.created_at);assert.equal((await request(app).get('/api/posts')).body.length,1);await request(app).get('/api/posts/first-post').expect(200);
 await write(agent,'post','/api/admin/posts',token,post).expect(409);
 for(const invalid of [{category:'bad'},{status:'hidden'},{title:''},{slug:"x'; DROP TABLE posts;--"},{description:'x'.repeat(501)},{images:['javascript:alert(1)']},{cover_url:'data:text/html,x'},{attachment_url:'http://example.com/a'},{media_url:'javascript:alert(1)'},{images:Array(13).fill('https://example.com/a.png')},{drive_file_id:'../secret'}])await write(agent,'post','/api/admin/posts',token,{...post,slug:'invalid',...invalid}).expect(400);
 await write(agent,'put','/api/admin/posts/missing',token,post).expect(404);
 await write(agent,'put',`/api/admin/posts/${created.id}`,token,{...post,status:'draft'}).expect(200);await request(app).get('/api/posts/first-post').expect(404);
 await agent.post('/api/admin/preview').set('Origin',config.baseUrl).set('X-CSRF-Token',token).set('Content-Type','application/json').send('{bad').expect(400);
 await write(agent,'post','/api/admin/preview',token,{...post,introduction:'x'.repeat(160000)}).expect(413);
 await write(agent,'post','/api/admin/logout',token,{}).expect(200);await agent.get('/api/admin/posts').expect(401);
});
test('public and preview rendering escape stored XSS and unsafe URLs',()=>{
 const html=detailHTML({...post,images:['javascript:alert(1)'],attachment_url:'javascript:alert(1)',cover_url:'javascript:alert(1)'},{preview:true});
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('javascript:'));assert.ok(html.includes('disabled'));
 const safe=detailHTML({...post,attachment_url:'https://example.com/file.zip',images:['https://example.com/a.png']});assert.ok(safe.includes('rel="noopener noreferrer"'));assert.ok(safe.includes('https://example.com/file.zip'));
});
test('SQLite persists data after close and reopen',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ivan-db-test-')),file=path.join(dir,'test.sqlite');let db;
 try{db=openDatabase(file);const saved=db.create(validatePost(post));db.close();db=openDatabase(file);assert.equal(db.get(saved.id).title,post.title);assert.deepEqual(db.get(saved.id).images,[]);}
 finally{db?.close();for(const suffix of ['','-wal','-shm'])rmSync(file+suffix,{force:true});rmdirSync(dir);}
});
test('configuration fails closed for missing secrets and bad callback',()=>{
 assert.throws(()=>readConfig({}),/SESSION_SECRET/);
 assert.throws(()=>readConfig({SESSION_SECRET:'x'.repeat(40),ADMIN_EMAIL:'admin@example.com',GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',GOOGLE_REDIRECT_URI:'https://evil.example/callback'}),/GOOGLE_REDIRECT_URI/);
});
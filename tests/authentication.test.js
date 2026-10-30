import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import session from 'express-session';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import {readConfig} from '../server/config.js';
import {localRequestAllowed} from '../server/local-admin.js';
import {ADMIN_SESSION_MS} from '../server/google-session.js';
const env={BASE_URL:'http://localhost:3000',ADMIN_EMAIL:'admin@example.com',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test-secret',SESSION_SECRET:'s'.repeat(40),LOCAL_ADMIN_MODE:'true'};
function setup(t){
 const config={...readConfig(env),localAdminMode:true},db=openDatabase(':memory:');t.after(()=>db.close());
 let pending,identity={},clock=Date.now();const store=new session.MemoryStore();
 const oauth={generateAuthUrl(p){pending=p;return 'https://accounts.google.com/auth';},async getToken(options){assert.equal(options.redirect_uri,config.redirectUri);return{tokens:{id_token:'private-id',access_token:'private-access',scope:'https://www.googleapis.com/auth/drive.metadata.readonly',expiry_date:Date.now()+3600000}};},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce,...identity})};},async revokeToken(){}};
 const app=createApp({config,db,oauthClient:oauth,sessionStore:store,now:()=>clock,publisher:{status:async()=>({busy:false})}}),agent=request.agent(app);
 const get=url=>agent.get(url).set('Host','localhost:3000');
 const write=(method,url,token,body)=>agent[method](url).set('Host','localhost:3000').set('Origin',config.baseUrl).set('X-CSRF-Token',token).send(body);
 const login=async(overrides={})=>{identity=overrides;await get('/auth/google').expect(302);return get(`/auth/google/callback?state=${pending.state}&code=test`).set('Sec-Fetch-Site','cross-site').set('Origin','https://accounts.google.com');};
 const mutate=async change=>{const all=await new Promise((resolve,reject)=>store.all((error,value)=>error?reject(error):resolve(value)));for(const[id,value]of Object.entries(all)){change(value);await new Promise((resolve,reject)=>store.set(id,value,error=>error?reject(error):resolve()));}};
 return {app,agent,get,write,config,login,mutate,expire:()=>clock+=ADMIN_SESSION_MS+1};
}
test('legacy local mode cannot bypass Google on any private Admin/API route',async t=>{
 const {get,write,agent}=setup(t);
 assert.equal(readConfig(env).localAdminMode,undefined);
 await get('/admin/').expect(302).expect('Location','/login');await get('/login').expect(200);
 for(const url of ['/api/admin/session','/api/admin/posts','/api/admin/trash','/api/admin/settings','/api/admin/drive/status','/api/admin/drive/files','/api/admin/publish/status','/api/admin/posts/missing/drive-files'])await get(url).expect(401);
 for(const[method,url]of [['post','/api/admin/posts'],['put','/api/admin/posts/id'],['delete','/api/admin/posts/id'],['post','/api/admin/publish/preview'],['post','/api/admin/publish/confirm'],['post','/api/admin/media']])await write(method,url,'fake',{}).expect(401);
 await agent.get('/admin/editor.html').set('Host','localhost:3000').expect(302);
});
test('verified Google grants CRUD; expired sessions and logout revoke access server-side',async t=>{
 const s=setup(t);const callback=await s.login();assert.equal(callback.status,200);assert.ok(callback.text.includes('url=/admin'));assert.ok(!callback.text.includes('private-access'));
 await s.get('/admin/').expect(200);const auth=(await s.get('/api/admin/session')).body;assert.equal(auth.authMode,'google');
 const post={title:'Google post',slug:'google-post',category:'other',description:'Test',images:[],status:'draft',drive_file_ids:[],drive_public_file_ids:[],cms_contract:2};
 const created=(await s.write('post','/api/admin/posts',auth.csrfToken,post).expect(201)).body;
 await s.write('put',`/api/admin/posts/${created.id}`,auth.csrfToken,{...post,title:'Edited'}).expect(200);
 await s.write('delete',`/api/admin/posts/${created.id}`,auth.csrfToken,{confirmTitle:'Edited'}).expect(200);
 await s.write('post','/api/admin/publish/preview','wrong',{}).expect(403);
 s.expire();await s.get('/api/admin/posts').expect(401);await s.get('/admin').expect(302);
 const signed=setup(t);const response=await signed.login();const cookie=response.headers['set-cookie'][0].split(';')[0];const token=(await signed.get('/api/admin/session')).body.csrfToken;
 await signed.write('post','/api/admin/logout',token,{}).expect(200);await signed.get('/api/admin/session').expect(401);
 await request(signed.app).get('/api/admin/session').set('Host','localhost:3000').set('Cookie',cookie).expect(401);
});
test('unverified/wrong Google email and old bypass sessions are never accepted',async t=>{
 for(const identity of [{email:'wrong@example.com'},{email_verified:false},{nonce:'bad'}]){const s=setup(t);assert.equal((await s.login(identity)).status,403);await s.get('/api/admin/session').expect(401);}
 const s=setup(t);await s.login();await s.mutate(value=>{value.localAdmin=true;value.admin={email:s.config.adminEmail,sub:'legacy'};});
 await s.get('/api/admin/session').expect(401);await s.get('/api/admin/drive/files').expect(401);await s.get('/api/admin/publish/status').expect(401);
});
test('Drive reconnect/disconnect retains Google Admin authentication but never leaks OAuth tokens',async t=>{
 const s=setup(t);await s.login();const auth=(await s.get('/api/admin/session')).body;
 assert.equal(auth.driveConnected,true);assert.ok(!JSON.stringify(auth).includes('private-access'));
 await s.write('post','/api/admin/drive/disconnect',auth.csrfToken,{}).expect(200);
 assert.equal((await s.get('/api/admin/session')).body.driveConnected,false);
 await s.get('/admin/').expect(200);await s.login();assert.equal((await s.get('/api/admin/drive/status')).body.connected,true);
});
test('loopback guard and CSRF reject hostile Host/Origin/proxy/LAN; callback GET still validates state',async t=>{
 const s=setup(t);
 for(const host of ['evil.example:3000','192.168.1.2:3000','localhost.evil.example:3000'])await s.agent.get('/api/admin/session').set('Host',host).expect(403);
 await s.agent.get('/auth/google/callback?state=invalid&code=test').set('Host','localhost:3000').set('Origin','null').set('Sec-Fetch-Site','cross-site').expect(400);
 await s.agent.get('/auth/google/callback').set('Host','evil.example:3000').expect(403);
 await s.agent.get('/admin/').set('Host','localhost:3000').set('X-Forwarded-For','127.0.0.1').expect(403);
 assert.equal(localRequestAllowed({socket:{remoteAddress:'192.168.1.2'},get:h=>h==='host'?'localhost:3000':undefined},s.config),false);
 await s.login();const csrf=(await s.get('/api/admin/session')).body.csrfToken;
 for(const route of ['/api/admin/posts','/api/admin/publish/preview'])await s.agent.post(route).set('Host','localhost:3000').set('Origin','https://evil.example').set('X-CSRF-Token',csrf).send({}).expect(403);
});
test('production cannot restore bypass and external BASE_URL is rejected',async t=>{
 const config=readConfig({...env,NODE_ENV:'production'});assert.equal(config.localAdminMode,undefined);
 for(const BASE_URL of ['http://192.168.1.2:3000','https://example.com'])assert.throws(()=>readConfig({...env,BASE_URL}),/Admin chỉ chạy/);
});

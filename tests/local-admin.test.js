import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import {readConfig} from '../server/config.js';
import {localRequestAllowed} from '../server/local-admin.js';
const env={BASE_URL:'http://localhost:3000',ADMIN_EMAIL:'admin@example.com',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test-secret',SESSION_SECRET:'s'.repeat(40),LOCAL_ADMIN_MODE:'true'};
function setup(t,local=true){
 const config=readConfig({...env,LOCAL_ADMIN_MODE:String(local)}),db=openDatabase(':memory:');t.after(()=>db.close());
 let pending;const oauth={generateAuthUrl(p){pending=p;return 'https://accounts.google.com/auth';},async getToken(){return{tokens:{id_token:'private-id',access_token:'private-access',scope:'https://www.googleapis.com/auth/drive.metadata.readonly',expiry_date:Date.now()+3600000}};},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};},async revokeToken(){}};
 const app=createApp({config,db,oauthClient:oauth,publisher:{status:async()=>({busy:false})}}),agent=request.agent(app);
 const get=url=>agent.get(url).set('Host','localhost:3000');
 const write=(method,url,token,body)=>agent[method](url).set('Host','localhost:3000').set('Origin',config.baseUrl).set('X-CSRF-Token',token).send(body);
 return {app,agent,get,write,config,login:async()=>{await get('/auth/google').expect(302);const response=await get(`/auth/google/callback?state=${pending.state}&code=test`).set('Sec-Fetch-Site','cross-site').set('Origin','https://accounts.google.com').set('Referer','https://accounts.google.com/').expect(local?200:302);if(local){assert.ok(response.text.includes('url=/admin'));assert.ok(!response.text.includes(pending.state));}}};
}
test('local admin opens dashboard and CRUD without Google; CSRF and publish protections remain',async t=>{
 const {get,write,agent}=setup(t);
 await get('/admin/').expect(200);
 const session=(await get('/api/admin/session').expect(200)).body;
 assert.equal(session.authMode,'local');assert.equal(session.driveConnected,false);assert.ok(session.csrfToken);
 const post={title:'Local post',slug:'local-post',category:'other',description:'Test',introduction:'',instructions:'',images:[],status:'draft',drive_file_ids:[],drive_public_file_ids:[],cms_contract:2};
 const created=(await write('post','/api/admin/posts',session.csrfToken,post).expect(201)).body;
 await write('put',`/api/admin/posts/${created.id}`,session.csrfToken,{...post,title:'Edited'}).expect(200);
 await write('delete',`/api/admin/posts/${created.id}`,session.csrfToken,{confirmTitle:'Edited'}).expect(200);
 assert.equal((await get('/api/posts').expect(200)).body.length,0);
 await agent.post('/api/admin/posts').set('Host','localhost:3000').send(post).expect(403);
 await write('post','/api/admin/publish/preview','wrong',{}).expect(403);
 await get('/api/admin/publish/status').expect(200);
});
test('Drive OAuth and disconnect do not remove independent local administration',async t=>{
 const {get,write,login}=setup(t);
 assert.equal((await get('/api/admin/drive/status')).body.connected,false);
 await get('/api/admin/drive/files').expect(409);
 await login();const session=(await get('/api/admin/session')).body;
 assert.equal(session.authMode,'local');assert.equal(session.driveConnected,true);
 assert.ok(!JSON.stringify(session).includes('private-access'));
 await write('post','/api/admin/drive/disconnect',session.csrfToken,{}).expect(200);
 assert.equal((await get('/api/admin/session')).body.driveConnected,false);
 await get('/admin/').expect(200);
});
test('local guard rejects hostile hosts, origins, proxy and LAN; disabled mode retains Google authentication',async t=>{
 const {agent,config}=setup(t);
 for(const host of ['evil.example:3000','192.168.1.2:3000','localhost.evil.example:3000'])await agent.get('/api/admin/session').set('Host',host).expect(403);
 await agent.get('/api/admin/session').set('Host','localhost:3000').set('Origin','https://evil.example').expect(403);
 await agent.get('/auth/google').set('Host','localhost:3000').set('Origin','https://evil.example').expect(403);
 await agent.get('/auth/google/callback?state=invalid&code=test').set('Host','localhost:3000').set('Origin','null').set('Sec-Fetch-Site','cross-site').expect(400);
 await agent.get('/auth/google/callback?state=invalid&code=test').set('Host','evil.example:3000').set('Origin','https://accounts.google.com').expect(403);
 await agent.post('/auth/google/callback').set('Host','localhost:3000').set('Origin','https://accounts.google.com').expect(403);
 const csrf=(await agent.get('/api/admin/session').set('Host','localhost:3000')).body.csrfToken;
 for(const route of ['/api/admin/posts','/api/admin/publish/preview'])await agent.post(route).set('Host','localhost:3000').set('Origin','https://evil.example').set('X-CSRF-Token',csrf).send({}).expect(403);
 await agent.get('/admin/').set('Host','localhost:3000').set('X-Forwarded-For','127.0.0.1').expect(403);
 await agent.get('/admin/').set('Host','localhost:3000').set('Sec-Fetch-Site','cross-site').expect(403);
 assert.equal(localRequestAllowed({socket:{remoteAddress:'192.168.1.2'},get:h=>h==='host'?'localhost:3000':undefined},config),false);
 const normal=setup(t,false);await normal.get('/admin/').expect(302).expect('Location','/login');await normal.get('/api/admin/session').expect(401);
 await normal.login();assert.equal((await normal.get('/api/admin/session')).body.authMode,'google');
});
test('local mode fails closed outside loopback or production',()=>{
 for(const extra of [{NODE_ENV:'production'},{BASE_URL:'http://192.168.1.2:3000'},{BASE_URL:'https://example.com'}])assert.throws(()=>readConfig({...env,...extra}),/LOCAL_ADMIN_MODE/);
});

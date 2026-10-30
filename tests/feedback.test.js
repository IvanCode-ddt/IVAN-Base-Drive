import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {mkdtemp,readFile,rm,readdir} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import {openDatabase} from '../server/database.js';
import {createFeedbackService,parseFeedback,feedbackSource} from '../server/feedback.js';
import {createApp} from '../server/app.js';
import {exportStatic} from '../scripts/export-static.mjs';
import {validatePost} from '../server/posts.js';
import {publicFormURL,DEFAULT_FEEDBACK_FORM_URL} from '../server/public-settings.js';
import {validateBundle} from '../server/publish-bundle.js';
const settings={enabled:true,spreadsheetId:'private-sheet-id-123',sheetName:'Form Responses 1',serviceAccountFile:'data/service-account.json'};
const header=['Timestamp','Loại','Tiêu đề','Nội dung chi tiết','Liên kết tham khảo','Email liên hệ'];
const rows=[header,['2026-10-31 10:00','Góp ý','<img src=x onerror=alert(1)>','PRIVATE_FEEDBACK_SENTINEL','javascript:alert(1)','private-sender@example.test'],['2026-10-31 11:00','Báo lỗi','Cannot play','Fix player','','']];
test('publish validation rejects a service-account private-key marker in public content',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-private-key-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);db.create(validatePost({title:'Unsafe public data',slug:'unsafe-public',category:'other',description:'Fixture',introduction:'-----BEGIN PRIVATE KEY-----',images:[],status:'published'}));db.close();db=null;
  const output=path.join(directory,'site');await exportStatic({databasePath:filename,outputDir:output});
  await assert.rejects(validateBundle({directory:output,databasePath:filename}),error=>error.code==='PRIVATE_DATA');
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});
test('v5 feedback migration creates a verified backup and retains pins/posts/Drive links',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-feedback-migration-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);const saved=db.create(validatePost({title:'Keep existing',slug:'keep-existing',category:'app',description:'Keep',images:[],status:'published',is_pinned:true,pin_order:9}));
  db.linkFile(saved.id,{file_id:'keep-file',name:'Keep file',mime_type:'text/plain',size:'1',modified_time:'',web_url:''});db.close();
  const raw=new DatabaseSync(filename);raw.exec('DROP TABLE feedback; DROP TABLE feedback_sync_state; PRAGMA user_version=5');raw.close();
  db=openDatabase(filename);assert.equal(db.get(saved.id).is_pinned,1);assert.equal(db.get(saved.id).pin_order,9);assert.equal(db.linkedFiles(saved.id)[0].file_id,'keep-file');assert.equal(db.listFeedback().total,0);
  const reports=(await readdir(path.join(directory,'backups'))).filter(name=>name.endsWith('.verified.json'));assert.equal(reports.length,1);assert.equal(JSON.parse(await readFile(path.join(directory,'backups',reports[0]),'utf8')).integrity,'ok');
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});
test('only one feedback sync runs at a time',async t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());let release;
 const service=createFeedbackService({db,config:settings,transport:()=>new Promise(resolve=>release=resolve)}),pending=service.sync();
 assert.equal(service.status().busy,true);await assert.rejects(service.sync(),error=>error.code==='FEEDBACK_BUSY');release(rows);await pending;assert.equal(service.status().busy,false);
});
test('Sheets opt-in/status, sync identity across reorder, duplicates and persistent processing status',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-feedback-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);
  const absent=createFeedbackService({db,config:{},transport:()=>assert.fail('must not call Google without explicit opt-in')});
  assert.equal(absent.status().state,'not_configured');await assert.rejects(absent.sync(),error=>error.code==='FEEDBACK_NOT_CONFIGURED');
  let content=rows;const service=createFeedbackService({db,config:settings,transport:async()=>content});assert.equal(service.status().state,'ready');
  const result=await service.sync();assert.equal(result.imported,2);assert.equal(result.busy,false);assert.equal(service.status().state,'connected');
  const original=db.listFeedback({search:'PRIVATE_FEEDBACK_SENTINEL'}).items[0];db.feedbackStatus(original.id,'processing');
  content=[header,rows[2],rows[1]];await service.sync();assert.equal(db.listFeedback().total,2);assert.equal(db.listFeedback({status:'processing'}).items[0].id,original.id);
  content=[...rows,rows[1]];await service.sync();assert.equal(db.listFeedback().total,3);
  db.close();db=openDatabase(filename);assert.equal(db.listFeedback({status:'processing'}).items[0].id,original.id);
  assert.equal(db.listFeedback({type:'Báo lỗi'}).total,1);assert.equal(db.listFeedback({search:'%_'}).total,0);
  const before=db.listFeedback().total;assert.throws(()=>db.syncFeedback(feedbackSource(settings),[{...original,id:'bad',title:undefined}]));assert.equal(db.listFeedback().total,before);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});
test('Sheet header/size validation and provider failures preserve existing feedback without secrets in errors',async t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());const key=feedbackSource(settings);db.syncFeedback(key,parseFeedback(rows,key));
 assert.throws(()=>parseFeedback([['Wrong headers']],key));assert.throws(()=>parseFeedback([header,[...rows[1].slice(0,3),'x'.repeat(10001),'','']],key));
 for(const status of [401,403,404,429,500]){
  const service=createFeedbackService({db,config:settings,transport:async()=>{throw{response:{status,data:'PRIVATE_TOKEN'}};}});
  await assert.rejects(service.sync(),error=>error.code==='FEEDBACK_UNAVAILABLE'&&!error.message.includes('PRIVATE_TOKEN'));assert.equal(service.status().state,'error');assert.equal(db.listFeedback().total,2);
 }
});
test('feedback APIs require Google Admin and CSRF; guest/export never disclose feedback or private Sheet settings',async t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());let pending;
 const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.com',clientId:'test',clientSecret:'test',sessionSecret:'x'.repeat(40),feedback:settings,feedbackFormUrl:DEFAULT_FEEDBACK_FORM_URL};
 const oauth={generateAuthUrl(p){pending=p;return 'https://accounts.google.com/auth';},async getToken(){return{tokens:{id_token:'test'}};},async verifyIdToken(){return{getPayload:()=>({sub:'admin',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const app=createApp({config,db,oauthClient:oauth,feedbackTransport:async()=>rows}),agent=request.agent(app);
 for(const url of ['/api/admin/feedback','/api/admin/feedback/status'])await request(app).get(url).expect(401);
 await request(app).post('/api/admin/feedback/sync').send({}).expect(401);
 await agent.get('/auth/google');await agent.get('/auth/google/callback').query({state:pending.state,code:'test'}).expect(302);
 const csrf=(await agent.get('/api/admin/session')).body.csrfToken;
 await agent.post('/api/admin/feedback/sync').send({}).expect(403);
 const write=(method,url,body)=>agent[method](url).set('Origin',config.baseUrl).set('X-CSRF-Token',csrf).send(body);
 await write('post','/api/admin/feedback/sync',{}).expect(200);
 const list=(await agent.get('/api/admin/feedback').expect(200)).body;assert.equal(list.total,2);
 await write('patch',`/api/admin/feedback/${list.items[0].id}`,{status:'done'}).expect(200);
 await write('patch',`/api/admin/feedback/${list.items[0].id}`,{status:'invalid'}).expect(400);
 assert.equal((await request(app).get('/api/site-settings')).text.includes('private-sheet'),false);
 const publicPosts=(await request(app).get('/api/posts')).text;assert.ok(!publicPosts.includes('PRIVATE_FEEDBACK_SENTINEL'));
});
test('real exporter omits feedback tables/emails and embeds only the approved public Form URL',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-feedback-export-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);db.create(validatePost({title:'Public',slug:'public',category:'other',description:'Public',images:[],status:'published'}));db.syncFeedback(feedbackSource(settings),parseFeedback(rows,feedbackSource(settings)));db.close();db=null;
  const outputDir=path.join(directory,'site');await exportStatic({databasePath:filename,outputDir});
  const json=await readFile(path.join(outputDir,'content/posts.json'),'utf8'),html=await readFile(path.join(outputDir,'index.html'),'utf8');
  for(const value of ['PRIVATE_FEEDBACK_SENTINEL','private-sender@example.test','processing_status','private-sheet-id-123']){assert.ok(!json.includes(value));assert.ok(!html.includes(value));}
  assert.ok(html.includes(DEFAULT_FEEDBACK_FORM_URL));
  assert.equal(publicFormURL(DEFAULT_FEEDBACK_FORM_URL+'?entry.1=private@email.test'),DEFAULT_FEEDBACK_FORM_URL);
  for(const value of ['javascript:alert(1)','https://evil.example/form','https://docs.google.com/forms/d/example/edit'])assert.equal(publicFormURL(value),'');
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

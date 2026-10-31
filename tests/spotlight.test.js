import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openDatabase} from '../server/database.js';
import {validatePost,validateHighlightConfig,InputError} from '../server/posts.js';
import {readPublished,readHighlights,exportStatic} from '../scripts/export-static.mjs';
import {spotlightHTML} from '../js/content.js';
import request from 'supertest';
import {createApp} from '../server/app.js';

const post=(slug,extra={})=>validatePost({title:slug,slug,description:'Description',category:'game',images:[],status:'published',...extra});
const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.test',clientId:'test',clientSecret:'test',sessionSecret:'x'.repeat(48)};

test('Highlight API requires Google Admin and CSRF; config only accepts unique Published posts and stays independent of pins',async t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());
 const first=db.create(post('sekiro',{title:'Sekiro™: Shadows Die Twice - GOTY Edition (Việt hóa sẵn)'})),second=db.create(post('second')),draft=db.create(post('draft',{status:'draft'}));let pending;
 const oauth={generateAuthUrl(value){pending=value;return'https://accounts.google.com/auth';},async getToken(){return{tokens:{id_token:'test'}};},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const app=createApp({config,db,oauthClient:oauth}),agent=request.agent(app);
 await request(app).get('/api/admin/highlights').expect(401);
 await agent.get('/auth/google');await agent.get('/auth/google/callback').query({state:pending.state,code:'test'}).expect(302);
 const session=(await agent.get('/api/admin/session')).body;assert.equal(session.contentSchemaVersion,14);
 const adminPosts=(await agent.get('/api/admin/posts').expect(200)).body;
 assert.ok(adminPosts.some(post=>post.id===first.id&&post.title.startsWith('Sekiro™')));
 await agent.put('/api/admin/highlights').send({enabled:true,interval_seconds:6,slides:[]}).expect(403);
 const save=body=>agent.put('/api/admin/highlights').set('Origin',config.baseUrl).set('X-CSRF-Token',session.csrfToken).send(body);
 await save({enabled:true,interval_seconds:2,slides:[]}).expect(400);
 await save({enabled:true,interval_seconds:6,slides:[{post_id:draft.id,enabled:true}]}).expect(400);
 await save({enabled:true,interval_seconds:6,slides:[{post_id:first.id,enabled:true},{post_id:first.id,enabled:false}]}).expect(400);
 const saved=(await save({enabled:true,interval_seconds:6,slides:[{post_id:second.id,enabled:false},{post_id:first.id,enabled:true}]}).expect(200)).body;
 assert.deepEqual(saved.slides.map(slide=>slide.post_id),[second.id,first.id]);
 assert.ok(saved.slides.some(slide=>slide.post_id===first.id));
 assert.ok((await agent.get('/api/admin/highlights').expect(200)).body.slides.some(slide=>slide.title.startsWith('Sekiro™')));
 assert.deepEqual((await request(app).get('/api/highlights').expect(200)).body.slides.map(slide=>slide.post.id),[first.id]);
 db.setPin(first.id,1,1);db.setPin(first.id,0,0);
 assert.equal(db.highlightConfig().slides.length,2);
 db.update(first.id,post('first',{status:'draft'}));
 assert.deepEqual((await request(app).get('/api/highlights').expect(200)).body.slides,[]);
 assert.equal(db.highlightConfig().slides.find(slide=>slide.post_id===first.id).status,'draft');
});

test('v9 migration makes a verified backup and converts legacy Spotlight without coupling pin state',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-highlight-migration-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);const saved=db.create(post('legacy'));db.setPin(saved.id,1,12);db.linkFile(saved.id,{file_id:'preserved-drive',name:'Private file',mime_type:'text/plain',size:'4',modified_time:'',web_url:''});db.close();db=null;
  const raw=new DatabaseSync(filename);raw.exec(`DROP TABLE highlight_slides;DROP TABLE highlight_settings;UPDATE posts SET is_spotlight=1 WHERE id='${saved.id}';PRAGMA user_version=9`);raw.close();
  db=openDatabase(filename);
  assert.equal(db.highlightConfig().slides[0].post_id,saved.id);assert.equal(db.get(saved.id).is_pinned,1);assert.equal(db.get(saved.id).is_spotlight,0);assert.equal(db.linkedFiles(saved.id)[0].file_id,'preserved-drive');
  db.setPin(saved.id,0,0);assert.equal(db.highlightConfig().slides[0].post_id,saved.id);
  const reports=(await readdir(path.join(directory,'backups'))).filter(name=>name.endsWith('.verified.json'));
  assert.equal(JSON.parse(await readFile(path.join(directory,'backups',reports[0]),'utf8')).integrity,'ok');
  const check=new DatabaseSync(filename,{readOnly:true});assert.equal(check.prepare('PRAGMA user_version').get().user_version,14);check.close();
  db.close();db=null;
 }finally{db?.close();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

test('static export publishes ordered Highlight config only for Published, live posts',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-highlight-export-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);
  const first=db.create(post('first')),second=db.create(post('second')),draft=db.create(post('draft',{status:'draft'})),deleted=db.create(post('deleted'));
  db.softDelete(deleted.id);
  db.saveHighlightConfig({enabled:true,interval_seconds:8,slides:[{post_id:second.id,enabled:true},{post_id:first.id,enabled:false}]});
  await assert.rejects(async()=>db.saveHighlightConfig({enabled:true,interval_seconds:8,slides:[{post_id:draft.id,enabled:true}]}),InputError);
  db.close();db=null;
  const output=path.join(directory,'docs');
  await exportStatic({databasePath:filename,outputDir:output});
  const exported=JSON.parse(await readFile(path.join(output,'content/highlights.json'),'utf8'));
  assert.deepEqual(exported,{schemaVersion:1,enabled:true,interval_seconds:8,slides:[{post_id:second.id,enabled:true},{post_id:first.id,enabled:false}]});
  assert.deepEqual(readHighlights(filename),exported);
  assert.deepEqual(JSON.parse(await readFile(path.join(output,'content/posts.json'),'utf8')).posts.map(item=>item.id),readPublished(filename).map(item=>item.id));
  assert.ok(!JSON.stringify(exported).includes(draft.id));assert.ok(!JSON.stringify(exported).includes(deleted.id));
  db=openDatabase(filename);db.update(second.id,post('second',{status:'draft'}));db.close();db=null;
  await exportStatic({databasePath:filename,outputDir:output});
  const after=JSON.parse(await readFile(path.join(output,'content/highlights.json'),'utf8'));
  assert.deepEqual(after.slides,[{post_id:first.id,enabled:false}]);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

test('Highlight markup escapes content and never embeds token or unsafe image URLs',()=>{
 const html=spotlightHTML({...post('safe'),title:'<script>alert(1)</script>',cover_url:'javascript:alert(1)'});
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('javascript:'));assert.ok(html.includes('spotlight-slide'));
});

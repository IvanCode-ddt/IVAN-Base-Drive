import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openDatabase} from '../server/database.js';
import {validatePost,InputError} from '../server/posts.js';
import {createApp} from '../server/app.js';
import {exportStatic,readPublished} from '../scripts/export-static.mjs';
import {splitFeatured,filterPosts} from '../js/data.js';
const post=(n,extra={})=>validatePost({title:`Pinned ${n}`,slug:`pinned-${n}`,category:'game',description:'Pin test',images:[],status:'published',...extra});
test('pin limit, priority, Draft/deleted visibility, compatibility and atomic rollback',t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());const saved=[];
 for(let i=0;i<6;i++)saved.push(db.create(post(i)));
 for(let i=0;i<5;i++)db.setPin(saved[i].id,1,10-i);
 assert.throws(()=>db.setPin(saved[5].id,1,0),InputError);
 assert.throws(()=>db.saveWithFiles(post('new',{is_pinned:true,pin_order:0}),null,[],'admin@example.com'),InputError);assert.equal(db.list().length,6);
 db.setPin(saved[0].id,0,0);db.setPin(saved[5].id,1,0);
 db.update(saved[1].id,post(1,{status:'draft'}));assert.equal(db.get(saved[1].id).is_pinned,1);
 const publicPosts=db.list(true).map(db.publicPost),view=splitFeatured(publicPosts);
 assert.equal(view.featured[0].id,saved[5].id);assert.equal(view.featured.length,4);assert.equal(view.regular.length,1);
 assert.equal(splitFeatured(filterPosts(publicPosts,'Pinned 5','all')).featured.length,1);
 db.softDelete(saved[5].id);assert.equal(db.list(true).some(p=>p.id===saved[5].id),false);
 db.setPin(saved[0].id,1,0);assert.throws(()=>db.restore(saved[5].id),InputError);
});
test('v4 migration verifies backup and preserves posts/Drive; static export carries pins only on public posts',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-pins-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);const saved=db.create(post('legacy'));db.linkFile(saved.id,{file_id:'keep-drive',name:'Private file',mime_type:'text/plain',size:'2',modified_time:'',web_url:''});db.close();
  const raw=new DatabaseSync(filename);raw.exec('DROP INDEX posts_pinned; ALTER TABLE posts DROP COLUMN is_pinned; ALTER TABLE posts DROP COLUMN pin_order; PRAGMA user_version=4');raw.close();
  db=openDatabase(filename);assert.equal(db.get(saved.id).is_pinned,0);assert.equal(db.linkedFiles(saved.id)[0].file_id,'keep-drive');
  const files=await readdir(path.join(directory,'backups'));const report=JSON.parse(await readFile(path.join(directory,'backups',files.find(f=>f.endsWith('.verified.json'))),'utf8'));assert.equal(report.integrity,'ok');assert.equal(report.postCount,1);
  db.setPin(saved.id,1,2);db.create(post('draft',{status:'draft',is_pinned:true,pin_order:0}));
  await exportStatic({databasePath:filename,outputDir:path.join(directory,'site')});
  const payload=JSON.parse(await readFile(path.join(directory,'site/content/posts.json'),'utf8'));
  assert.equal(payload.posts.length,1);assert.equal(payload.posts[0].is_pinned,true);assert.equal(payload.posts[0].pin_order,2);assert.deepEqual(payload.posts[0].drive_files,[]);
  assert.deepEqual(payload.posts,readPublished(filename));
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});
test('pin API requires Google Admin, CSRF, correct Origin and validated priority',async t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());const saved=db.create(post('api'));let pending;
 const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.com',clientId:'test',clientSecret:'test',sessionSecret:'s'.repeat(40)};
 const oauth={generateAuthUrl(p){pending=p;return 'https://accounts.google.com/auth';},async getToken(){return{tokens:{id_token:'test'}};},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const app=createApp({config,db,oauthClient:oauth}),agent=request.agent(app),url=`/api/admin/posts/${saved.id}/pin`;
 await request(app).patch(url).send({is_pinned:true,pin_order:0}).expect(401);
 await agent.get('/auth/google');await agent.get('/auth/google/callback').query({state:pending.state,code:'test'}).expect(302);
 const token=(await agent.get('/api/admin/session')).body.csrfToken;
 await agent.patch(url).send({is_pinned:true,pin_order:0}).expect(403);
 const change=body=>agent.patch(url).set('Origin',config.baseUrl).set('X-CSRF-Token',token).send(body);
 await change({is_pinned:true,pin_order:-1}).expect(400);await change({is_pinned:'true',pin_order:1}).expect(400);
 assert.equal((await change({is_pinned:true,pin_order:7}).expect(200)).body.pin_order,7);
 assert.equal((await change({is_pinned:false,pin_order:0}).expect(200)).body.is_pinned,0);
});

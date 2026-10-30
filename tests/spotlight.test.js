import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {readPublished,exportStatic} from '../scripts/export-static.mjs';
import {splitFeatured} from '../js/data.js';
import {spotlightHTML} from '../js/content.js';
import request from 'supertest';
import {createApp} from '../server/app.js';
const post=(slug,extra={})=>validatePost({title:slug,slug,description:'Description',category:'game',images:[],status:'published',...extra});
test('Spotlight/metadata write API remains authenticated and CSRF-protected',async t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());const saved=db.create(post('http-post'));let pending;
 const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.test',clientId:'test',clientSecret:'test',sessionSecret:'x'.repeat(48)};
 const oauth={generateAuthUrl(p){pending=p;return 'https://accounts.google.com/auth';},async getToken(){return{tokens:{id_token:'test'}};},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const app=createApp({config,db,oauthClient:oauth}),agent=request.agent(app),url=`/api/admin/posts/${saved.id}/spotlight`;
 await request(app).patch(url).send({is_spotlight:true}).expect(401);await agent.get('/auth/google');await agent.get('/auth/google/callback').query({state:pending.state,code:'test'}).expect(302);
 const session=(await agent.get('/api/admin/session')).body;assert.equal(session.contentSchemaVersion,9);
 await agent.patch(url).send({is_spotlight:true}).expect(403);
 await agent.patch(url).set('Origin',config.baseUrl).set('X-CSRF-Token',session.csrfToken).send({is_spotlight:true}).expect(200);
 await agent.put(`/api/admin/posts/${saved.id}`).set('Origin',config.baseUrl).set('X-CSRF-Token',session.csrfToken).send(post('http-post',{metadata:{version:'3.1'}})).expect(200);
 const dto=(await request(app).get('/api/posts')).body[0];assert.equal(dto.is_spotlight,true);assert.equal(dto.metadata.version,'3.1');
});
test('one explicit Spotlight reuses pins, obeys limits and never exposes Draft/deleted posts',t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());const one=db.create(post('one')),two=db.create(post('two',{is_pinned:true,pin_order:0}));
 db.setSpotlight(one.id,true);assert.equal(db.get(one.id).is_pinned,1);assert.throws(()=>db.setSpotlight(two.id,true),/Đã có Spotlight/);
 let view=splitFeatured(db.list(true).map(db.publicPost));assert.equal(view.spotlight.id,one.id);assert.equal(view.featured[0].id,two.id);assert.equal(view.regular.length,0);
 assert.equal(splitFeatured(db.list(true).map(db.publicPost),{spotlight:false}).featured.length,2);
 db.update(one.id,post('one',{status:'draft'}));assert.equal(splitFeatured(db.list(true).map(db.publicPost)).spotlight,null);
 db.softDelete(one.id);db.setSpotlight(two.id,true);assert.throws(()=>db.restore(one.id),/Spotlight/);
 db.setPin(two.id,0,0);assert.equal(db.get(two.id).is_spotlight,0);db.restore(one.id);db.setSpotlight(one.id,false);assert.equal(db.get(one.id).is_pinned,1);
 const html=spotlightHTML({...two,title:'<script>alert(1)</script>',cover_url:'javascript:alert(1)'});assert.ok(!html.includes('<script>'));assert.ok(!html.includes('javascript:'));
});
test('v6 migration preserves posts/links/feedback with verified backup; Spotlight survives export',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-spotlight-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);const saved=db.create(post('keep'));db.linkFile(saved.id,{file_id:'keep',name:'Private',mime_type:'text/plain',size:'1',modified_time:'',web_url:''});db.close();
  const raw=new DatabaseSync(filename);raw.exec('DROP INDEX posts_spotlight; ALTER TABLE posts DROP COLUMN is_spotlight; PRAGMA user_version=6');raw.close();
  db=openDatabase(filename);assert.equal(db.get(saved.id).is_spotlight,0);assert.equal(db.linkedFiles(saved.id).length,1);
  const reports=(await readdir(path.join(directory,'backups'))).filter(file=>file.endsWith('.verified.json'));assert.equal(JSON.parse(await readFile(path.join(directory,'backups',reports[0]),'utf8')).integrity,'ok');
  db.setSpotlight(saved.id,true);await exportStatic({databasePath:filename,outputDir:path.join(directory,'site')});assert.equal(readPublished(filename)[0].is_spotlight,true);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

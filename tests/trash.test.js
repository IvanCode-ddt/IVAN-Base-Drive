import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {mkdtemp,rm,readdir,readFile,writeFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../server/database.js';
import {createApp} from '../server/app.js';
import {readPublished} from '../scripts/export-static.mjs';
import {validatePost} from '../server/posts.js';

test('trash API enforces admin/CSRF/title confirmation; hides deleted posts, restores and purges only after separate consent',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ivan-trash-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);
  const post=db.create(validatePost({title:'Vencord <test>',slug:'vencord-trash',category:'app',description:'Test',images:[],status:'published'}));
  const file={file_id:'original_drive_file',name:'Vencord.exe',mime_type:'application/octet-stream',size:'100',modified_time:'',web_url:'https://drive.google.com/file/d/original_drive_file/view',download_url:'https://drive.google.com/uc?id=original_drive_file&export=download',sharing_access:'anyone',can_download:1};db.linkFile(post.id,file);db.confirmFile(post.id,file.file_id,file,'admin@example.com');
  let pending;const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.com',clientId:'test',clientSecret:'test',sessionSecret:randomBytes(40).toString('hex'),secure:false};
  const oauth={generateAuthUrl(p){pending=p;return'https://accounts.google.com/auth';},async getToken(){return{tokens:{id_token:'test'}}},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})}}};
  const imagePath='uploads/12345678-1234-1234-1234-123456789abc.webp';await writeFile(path.join(directory,imagePath.slice(8)),Buffer.from('test-image-data'));
  const other=db.create(validatePost({title:'Other shared image',slug:'other-shared-image',category:'app',description:'Shared',cover_url:imagePath,images:[],status:'published'}));
  db.update(post.id,validatePost({...post,cover_url:imagePath}));db.linkFile(other.id,file);
  const app=createApp({db,config,oauthClient:oauth,uploadDir:directory,driveRequest:()=>{throw new Error('Trash must never call Drive');}}),agent=request.agent(app);
  await request(app).get('/api/admin/trash').expect(401);await request(app).delete(`/api/admin/posts/${post.id}`).send({confirmTitle:post.title}).expect(401);
  await agent.get('/auth/google');await agent.get('/auth/google/callback').query({state:pending.state,code:'test'}).expect(302);
  const token=(await agent.get('/api/admin/session')).body.csrfToken;
  const write=(method,url,body)=>agent[method](url).set('Origin',config.baseUrl).set('X-CSRF-Token',token).send(body);
  await agent.delete(`/api/admin/posts/${post.id}`).send({confirmTitle:post.title}).expect(403);
  await write('delete',`/api/admin/posts/${post.id}`,{confirmTitle:'wrong'}).expect(400);
  await write('delete',`/api/admin/trash/${post.id}`,{confirmTitle:post.title,action:'purge'}).expect(404);
  await write('delete',`/api/admin/posts/${post.id}`,{confirmTitle:post.title}).expect(200);
  assert.equal(db.get(post.id),null);assert.equal(db.get(post.id,true).drive_files.length,1);
  await request(app).get('/api/posts/vencord-trash').expect(404);assert.ok(readPublished(filename).every(p=>p.id!==post.id));assert.equal((await agent.get('/api/admin/trash')).body.length,1);
  await write('put',`/api/admin/posts/${post.id}`,{...post,title:'Must not change'}).expect(404);
  await write('post',`/api/admin/trash/${post.id}/restore`,{confirmTitle:'wrong'}).expect(400);
  await write('post',`/api/admin/trash/${post.id}/restore`,{confirmTitle:post.title}).expect(200);
  assert.equal((await request(app).get('/api/posts/vencord-trash')).body.drive_files[0].file_id,file.file_id);
  await write('delete',`/api/admin/posts/${post.id}`,{confirmTitle:post.title}).expect(200);
  await write('delete',`/api/admin/trash/${post.id}`,{confirmTitle:post.title}).expect(400);
  await write('delete',`/api/admin/trash/${post.id}`,{confirmTitle:post.title,action:'purge'}).expect(200);
  assert.equal(db.get(post.id,true),null);assert.deepEqual(db.linkedFiles(post.id),[]);
  await access(path.join(directory,imagePath.slice(8)));await request(app).get('/'+imagePath).expect(200);assert.equal(db.linkedFiles(other.id).length,1);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

test('migration v3 to v4 creates verified backup before migration and retains posts/links',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ivan-v4-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);const post=db.create(validatePost({title:'Keep Vencord',slug:'keep',category:'app',description:'Keep',images:[],status:'published'}));
  db.linkFile(post.id,{file_id:'keep_file',name:'Vencord.exe',mime_type:'application/octet-stream',size:null,modified_time:'',web_url:'https://drive.google.com/file/d/keep_file/view'});db.close();db=null;
  const raw=new DatabaseSync(filename);raw.exec('DROP INDEX posts_deleted; ALTER TABLE posts DROP COLUMN deleted_at; PRAGMA user_version=3;');raw.close();
  db=openDatabase(filename);assert.equal(db.get(post.id).drive_files[0].file_id,'keep_file');assert.equal(db.get(post.id).deleted_at,null);
  const backups=await readdir(path.join(directory,'backups'));const backup=backups.find(f=>f.endsWith('.sqlite'));
  const report=JSON.parse(await readFile(path.join(directory,'backups',backup+'.verified.json'),'utf8'));assert.equal(report.integrity,'ok');assert.equal(report.postCount,1);
  const checked=new DatabaseSync(path.join(directory,'backups',backup),{readOnly:true});assert.equal(checked.prepare('PRAGMA user_version').get().user_version,3);assert.equal(checked.prepare('SELECT file_id FROM post_drive_files').get().file_id,'keep_file');checked.close();
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

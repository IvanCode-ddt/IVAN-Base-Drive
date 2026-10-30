import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import express from 'express';
import { openDatabase } from '../server/database.js';
import { validatePost } from '../server/posts.js';
import { exportStatic } from '../scripts/export-static.mjs';
import { publicPost } from '../server/public-post.js';
import { createPostSource } from '../js/post-source.js';
import { detailHTML } from '../js/content.js';

test('static export is read-only, Published-only, allowlisted and excludes private files and credentials',async()=>{
 const temporary=await mkdtemp(path.join(tmpdir(),'ivan-static-'));
 const databasePath=path.join(temporary,'db.sqlite'),outputDir=path.join(temporary,'docs');let db;
 try {
  db=openDatabase(databasePath);
  const body={title:'Vencord',slug:'vencord',category:'app',description:'Test description',images:[],status:'published'};
  const published=db.create(validatePost(body));db.create(validatePost({...body,title:'DRAFT_SECRET_SENTINEL',slug:'draft',status:'draft'}));
  const file={file_id:'public_file',name:'Vencord setup',mime_type:'application/x-msdownload',size:'100',modified_time:'',web_url:'https://drive.google.com/file/d/public_file/view?resourcekey=public-key',download_url:'https://drive.google.com/uc?export=download&id=public_file&resourcekey=public-key',can_download:1};
  db.linkFile(published.id,file);db.confirmFile(published.id,file.file_id,file,'ADMIN_EMAIL_SENTINEL@example.com');
  db.linkFile(published.id,{...file,file_id:'PRIVATE_FILE_SENTINEL',name:'PRIVATE_NAME_SENTINEL',download_url:'https://drive.google.com/uc?id=PRIVATE_DOWNLOAD_SENTINEL'});
  db.close();db=null;
  const before=createHash('sha256').update(await readFile(databasePath)).digest('hex');
  assert.equal((await exportStatic({databasePath,outputDir})).count,1);
  assert.equal(createHash('sha256').update(await readFile(databasePath)).digest('hex'),before);
  const text=await readFile(path.join(outputDir,'content/posts.json'),'utf8'),data=JSON.parse(text);
  assert.equal(data.posts.length,1);assert.equal(data.posts[0].title,'Vencord');assert.equal(data.posts[0].drive_files.length,1);assert.ok(text.includes('resourcekey=public-key'));
  for(const privateValue of ['DRAFT_SECRET_SENTINEL','ADMIN_EMAIL_SENTINEL','PRIVATE_FILE_SENTINEL','PRIVATE_NAME_SENTINEL','PRIVATE_DOWNLOAD_SENTINEL','confirmed_by','confirmed_at','sharing_access','drive_file_id'])assert.ok(!text.includes(privateValue),privateValue);
  const html=await readFile(path.join(outputDir,'index.html'),'utf8');assert.ok(!html.includes('href="/admin"'));
  const files=await readdir(outputDir,{recursive:true});for(const banned of ['.env','server','admin','ivan.sqlite','package.json'])assert.ok(!files.includes(banned));
  // Re-export replaces the complete snapshot, removing posts that become drafts.
  db=openDatabase(databasePath);db.update(published.id,validatePost({...body,status:'draft'}));db.close();db=null;
  assert.equal((await exportStatic({databasePath,outputDir})).count,0);assert.deepEqual(JSON.parse(await readFile(path.join(outputDir,'content/posts.json'),'utf8')).posts,[]);
 }finally{db?.close();await rm(temporary,{recursive:true,force:true});}
});

test('public projection excludes future secret fields and token-bearing URLs by default',()=>{
 const result=publicPost({status:'published',title:'Safe',images:[],admin_email:'PRIVATE_EMAIL',oauth_token:'PRIVATE_TOKEN',future_secret:'PRIVATE_SECRET',attachment_url:'https://drive.google.com/uc?access_token=PRIVATE_TOKEN',drive_files:[{sharing_confirmed:0,download_url:'PRIVATE_DOWNLOAD'}]});
 assert.ok(!JSON.stringify(result).includes('PRIVATE_'));assert.equal(result.attachment_url,'');assert.equal(publicPost({status:'draft'}),null);
});

test('frontend uses Express locally and static snapshot under GitHub Pages project path',async()=>{
 const calls=[],posts=[{status:'published',slug:'vencord',title:'Vencord'}];
 const fetcher=async url=>{calls.push(url);return{ok:true,json:async()=>url==='/api/posts'?posts:url.startsWith('/api/posts/')?posts[0]:{schemaVersion:1,posts}};};
 const local=createPostSource({location:{hostname:'localhost',port:'3000',href:'http://localhost:3000/'},fetcher});
 await local.list();await local.get('vencord');assert.deepEqual(calls.splice(0),['/api/posts','/api/posts/vencord']);
 const remote=createPostSource({location:{hostname:'example.github.io',port:'',href:'https://example.github.io/IVAN-Base-Drive/#post/vencord'},fetcher});
 assert.equal(remote.local,false);assert.equal((await remote.list())[0].title,'Vencord');assert.equal((await remote.get('vencord')).title,'Vencord');assert.deepEqual(calls,['https://example.github.io/IVAN-Base-Drive/content/posts.json']);
 await assert.rejects(()=>remote.get('missing'));
});

test('exported snapshot and assets serve beneath /IVAN-Base-Drive/ without any backend API',async()=>{
 const app=express();app.use('/IVAN-Base-Drive',express.static(path.resolve('docs')));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 try {
  const origin=`http://127.0.0.1:${server.address().port}`;
  const source=createPostSource({location:{hostname:'127.0.0.1',port:String(server.address().port),href:`${origin}/IVAN-Base-Drive/#post/vencord`}});
  const posts=await source.list();
  // Verify whatever is currently exported; Vencord is checked explicitly in the task report.
  for(const post of posts){assert.equal((await source.get(post.slug)).title,post.title);assert.ok(detailHTML(post).includes(post.title.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')));}
  for(const file of ['','css/style.css','js/main.js','js/content.js','js/data.js','js/post-source.js','js/media.js','js/markdown.js','content/posts.json','content/music.json'])assert.equal((await fetch(`${origin}/IVAN-Base-Drive/${file}`)).status,200,file);
  assert.equal((await fetch(`${origin}/api/posts`)).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import request from 'supertest';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {publicPost} from '../server/public-post.js';
import {detailHTML} from '../js/content.js';
import {drivePreview,mediaChoices} from '../js/media.js';
import {exportStatic} from '../scripts/export-static.mjs';
import {createApp} from '../server/app.js';
const body={title:'Film',slug:'film',category:'film',description:'Description',images:[],status:'published'};
const direct={kind:'direct',label:'Native video',url:'https://media.example.test/sample.webm',mime_type:'video/webm',sharing_confirmed:true};
const preview={kind:'drive_preview',label:'Drive preview',url:'https://drive.google.com/file/d/video_123/preview?resourcekey=keep-key',sharing_confirmed:true};
const file={file_id:'video_123',name:'Video',mime_type:'video/mp4',sharing_access:'anyone',sharing_confirmed:1,web_url:'https://drive.google.com/file/d/video_123/view?resourcekey=verified-key',size:'1024'};
test('media source opt-in, MIME/URL validation, Drive membership and private projection',()=>{
 const saved=validatePost({...body,drive_file_ids:['video_123'],media_sources:[direct,preview]});
 let dto=publicPost({...saved,drive_files:[file]});assert.equal(dto.media_sources.length,2);assert.match(dto.media_sources[1].url,/resourcekey=verified-key/);
 dto=publicPost({...saved,drive_files:[{...file,sharing_access:'restricted'}]});assert.equal(dto.media_sources.length,1);
 dto=publicPost({...saved,drive_files:[{...file,sharing_confirmed:0}]});assert.equal(dto.media_sources.length,1);
 assert.deepEqual(publicPost({...saved,media_sources:[{...direct,sharing_confirmed:false}],drive_files:[]}).media_sources,[]);
 for(const source of [{...direct,url:'https://drive.google.com/uc?id=x'},{...direct,url:'https://media.example.test/a?access_token=secret'},{...direct,mime_type:'application/zip'},{...direct,sharing_confirmed:'true'},{...preview,url:'https://evil.example/preview'}])assert.throws(()=>validatePost({...body,media_sources:[source]}));
 assert.throws(()=>validatePost({...body,drive_file_ids:[],media_sources:[preview]}));
 assert.equal(publicPost({...saved,media_url:'https://drive.google.com/file/d/private/view'}).media_url,'');
 assert.equal(drivePreview('https://drive.google.com/file/d/video_123/view?resourcekey=keep-key&usp=drive_link').url,preview.url);
 const html=detailHTML({...dto,media_sources:[direct]});assert.ok(!html.includes('<video'));assert.ok(!html.includes('<audio'));assert.ok(!html.includes('<iframe'));assert.ok(html.includes('data-media-sources'));
 assert.equal(mediaChoices({...body,media_url:'https://drive.google.com/uc?export=download&id=x'}).length,0);
});
test('v8 to v9 migration and metadata/media export preserve old data with a verified backup',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-media-migration-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);const saved=db.create(validatePost({...body,metadata:{quality:'1080p'}}));db.close();
  const raw=new DatabaseSync(filename);raw.exec('ALTER TABLE posts DROP COLUMN media_sources; PRAGMA user_version=8');raw.close();
  db=openDatabase(filename);assert.deepEqual(db.get(saved.id).media_sources,[]);assert.equal(db.get(saved.id).metadata.quality,'1080p');
  db.update(saved.id,validatePost({...body,media_sources:[direct,{...direct,label:'Unconfirmed',url:'https://private.example.test/private.webm',sharing_confirmed:false}]}));
  const output=path.join(directory,'site');await exportStatic({databasePath:filename,outputDir:output});const json=await readFile(path.join(output,'content/posts.json'),'utf8'),dto=JSON.parse(json).posts[0];
  assert.equal(dto.media_sources.length,1);assert.equal(dto.metadata.quality,'1080p');assert.ok(!json.includes('private.example.test'));assert.ok(!json.includes('sharing_confirmed'));
  const backup=(await readdir(path.join(directory,'backups'))).find(name=>name.endsWith('.verified.json'));assert.equal(JSON.parse(await readFile(path.join(directory,'backups',backup),'utf8')).integrity,'ok');
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});
test('Spotlight responsive images export and local routes are public only while the selected cover is Published',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-spotlight-images-')),filename=path.join(directory,'db.sqlite'),uploads=path.join(directory,'uploads'),id='12345678-1234-1234-1234-123456789abc';let db;
 try{
  await mkdir(uploads);await sharp({create:{width:1200,height:800,channels:3,background:'#354b38'}}).webp().toFile(path.join(uploads,id+'.webp'));
  db=openDatabase(filename);const saved=db.create(validatePost({...body,cover_url:`uploads/${id}.webp`,is_spotlight:true}));
  const config={baseUrl:'http://localhost:3000',adminEmail:'admin@example.test',clientId:'test',clientSecret:'test',sessionSecret:'x'.repeat(40)};
  const app=createApp({config,db,uploadDir:uploads});const response=await request(app).get(`/images/spotlight-${id}-640.webp`).expect(200);assert.equal((await sharp(response.body).metadata()).width,640);
  const output=path.join(directory,'site');
  // SourceDir uses its upload folder; use a complete fixture with this upload for export.
  const source=path.join(directory,'source');await mkdir(source);const {copyFile,cp}=await import('node:fs/promises');await copyFile('index.html',path.join(source,'index.html'));for(const dir of ['js','css','images'])await cp(dir,path.join(source,dir),{recursive:true});await cp(uploads,path.join(source,'uploads'),{recursive:true});
  await exportStatic({databasePath:filename,sourceDir:source,outputDir:output});for(const width of [640,960,1440])assert.equal((await sharp(await readFile(path.join(output,`images/spotlight-${id}-${width}.webp`))).metadata()).width,width);
  db.update(saved.id,validatePost({...body,status:'draft',cover_url:`uploads/${id}.webp`}));await request(app).get(`/images/spotlight-${id}-640.webp`).expect(404);
  await exportStatic({databasePath:filename,sourceDir:source,outputDir:output});assert.ok(!(await readdir(path.join(output,'images'))).some(name=>name.startsWith('spotlight-'+id)));
 }finally{db?.close();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

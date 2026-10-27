import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import sharp from 'sharp';
import {mkdtemp,rm,readFile,mkdir,copyFile,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import {saveImage} from '../server/media.js';
import {renderMarkdown} from '../js/markdown.js';
import {localImages} from '../js/media.js';
import {exportStatic} from '../scripts/export-static.mjs';

test('Markdown supports requested formatting, escapes raw HTML and rejects unsafe URLs',()=>{
 const html=renderMarkdown('# Heading\n\nA **bold** paragraph\n\n- One\n- Two\n\n1. First\n2. Second\n\n[Link](https://example.com)\n\n![Photo](https://example.com/a.png)\n\n<script>alert(1)</script>\n\n[x](javascript:alert) ![bad](data:text/html,bad)');
 for(const snippet of ['<h2>Heading</h2>','<strong>bold</strong>','<ul>','<ol>','href="https://example.com/"','<img src="https://example.com/a.png"','&lt;script&gt;'])assert.ok(html.includes(snippet),snippet);
 assert.ok(!html.includes('<script>'));assert.ok(!html.includes('href="javascript:'));assert.ok(!html.includes('src="data:'));
});

test('upload requires admin and CSRF, decodes actual bytes, protects draft media and preserves linked file on editing',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ivan-cms-')),db=openDatabase(':memory:');
 const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.com',clientId:'test',clientSecret:'test',sessionSecret:randomBytes(40).toString('hex'),secure:false};
 let pending;
 const oauth={generateAuthUrl(p){pending=p;return'https://accounts.google.com/auth';},async getToken(){return{tokens:{id_token:'test'}}},async verifyIdToken(){return{getPayload:()=>({sub:'admin',email:config.adminEmail,email_verified:true,nonce:pending.nonce})}}};
 const app=createApp({config,db,oauthClient:oauth,uploadDir:dir}),agent=request.agent(app);
 try{
  const png=await sharp({create:{width:20,height:15,channels:3,background:'#7ba34a'}}).png().toBuffer();
  await request(app).post('/api/admin/images').set('Content-Type','image/png').send(png).expect(401);
  await agent.get('/auth/google');await agent.get('/auth/google/callback').query({state:pending.state,code:'ok'}).expect(302);
  const csrf=(await agent.get('/api/admin/session')).body.csrfToken;
  await agent.post('/api/admin/images').set('Content-Type','image/png').send(png).expect(403);
  const upload=data=>agent.post('/api/admin/images').set('Origin',config.baseUrl).set('X-CSRF-Token',csrf).set('Content-Type','application/octet-stream').set('X-File-Name','../../evil.exe').send(data);
  const saved=(await upload(png).expect(201)).body;
  assert.match(saved.path,/^uploads\/[a-f0-9-]{36}\.webp$/);assert.equal((await sharp(await readFile(path.join(dir,saved.path.slice(8)))).metadata()).format,'webp');
  for(const invalid of [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),Buffer.from('MZ executable'),png.subarray(0,25)])await upload(invalid).expect(400);
  await upload(Buffer.alloc(5*1024*1024+1)).expect(413);
  const body={title:'CMS Post',slug:'cms-post',category:'app',description:'Description',introduction:'## Content\n\n**Hello**',instructions:'- Install',cover_url:saved.path,images:[saved.path],status:'draft'};
  const write=(url,data)=>agent.post(url).set('Origin',config.baseUrl).set('X-CSRF-Token',csrf).send(data);
  const post=(await write('/api/admin/posts',body).expect(201)).body;
  db.linkFile(post.id,{file_id:'keep_file',name:'Vencord',mime_type:'application/octet-stream',size:null,modified_time:'',web_url:'https://drive.google.com/file/d/keep_file/view'});
  await request(app).get('/'+saved.path).expect(404);await request(app).get('/admin/media/'+saved.path.slice(8)).expect(302);await agent.get('/admin/media/'+saved.path.slice(8)).expect(200);
  await write('/api/admin/preview',body).expect(200);assert.equal(db.get(post.id).status,'draft');
  await agent.put(`/api/admin/posts/${post.id}`).set('Origin',config.baseUrl).set('X-CSRF-Token',csrf).send({...body,status:'published'}).expect(200);
  await request(app).get('/'+saved.path).expect(200).expect('Content-Type',/image\/webp/);assert.equal(db.get(post.id).drive_files.length,1);
  await write('/api/admin/posts',{...body,slug:'unsafe',cover_url:'uploads/../../secret.svg'}).expect(400);
 }finally{db.close();await rm(dir,{recursive:true,force:true});}
});

test('image size/pixel limits reject dangerous inputs, and export copies only published cover/gallery/Markdown uploads',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ivan-export-media-')),sourceDir=path.join(dir,'source'),outputDir=path.join(dir,'docs'),databasePath=path.join(dir,'db.sqlite');let db;
 try{
  for(const folder of ['js','css','images','uploads'])await mkdir(path.join(sourceDir,folder),{recursive:true});
  for(const file of ['index.html','css/style.css',...['main.js','data.js','content.js','post-source.js','markdown.js','media.js'].map(f=>'js/'+f)])await copyFile(file,path.join(sourceDir,file));
  const png=await sharp({create:{width:10,height:10,channels:3,background:'#aabbcc'}}).png().toBuffer();
  for(const format of ['jpeg','webp']){const source=await sharp(png).toFormat(format).toBuffer();const saved=await saveImage(source,path.join(sourceDir,'uploads'));assert.equal((await sharp(await readFile(path.join(sourceDir,saved.path))).metadata()).format,'webp');}
  const large=await sharp({create:{width:5000,height:4000,channels:3,background:'white'}}).png().toBuffer();
  await assert.rejects(()=>saveImage(large,path.join(sourceDir,'uploads')));
  const pub=await saveImage(png,path.join(sourceDir,'uploads')),inline=await saveImage(png,path.join(sourceDir,'uploads')),draft=await saveImage(png,path.join(sourceDir,'uploads'));
  db=openDatabase(databasePath);
  const body={slug:'public',title:'Public',category:'app',description:'Description',introduction:`![Inline](${inline.path})`,instructions:'',cover_url:pub.path,images:[],attachment_url:'',media_url:'',drive_file_id:'',status:'published'};
  const post=db.create(body);db.create({...body,slug:'draft',status:'draft',cover_url:draft.path,introduction:''});db.close();db=null;
  await exportStatic({databasePath,sourceDir,outputDir});
  for(const img of [pub.path,inline.path])await access(path.join(outputDir,img));
  await assert.rejects(()=>access(path.join(outputDir,draft.path)));
  const payload=JSON.parse(await readFile(path.join(outputDir,'content/posts.json'),'utf8'));assert.equal(payload.posts[0].cover_url,pub.path);assert.equal(localImages(payload.posts[0]).length,2);
  db=openDatabase(databasePath);db.update(post.id,{...body,status:'draft'});db.close();db=null;await exportStatic({databasePath,sourceDir,outputDir});
  await assert.rejects(()=>access(path.join(outputDir,pub.path)));await access(path.join(sourceDir,pub.path));
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});

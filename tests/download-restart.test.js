import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../server/database.js';
import {createApp} from '../server/app.js';
import {DRIVE_SCOPE,FOLDER} from '../server/drive.js';
import {readPublished} from '../scripts/export-static.mjs';
test('Phase A: create through API, restart application/database, and read/export the same linked download',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'ivan-restart-')),filename=path.join(dir,'db.sqlite');let db;
 const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.com',clientId:'test',clientSecret:'test',sessionSecret:randomBytes(40).toString('hex'),driveRootId:'root',secure:false};let pending;
 const oauth={generateAuthUrl(p){pending=p;return'https://accounts.google.com/auth';},async getToken(){return{tokens:{id_token:'test',access_token:'test',scope:DRIVE_SCOPE,expiry_date:Date.now()+3600000}}},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})}}};
 const driveRequest=async(tokens,resource)=>resource==='files/root'?{id:'root',name:'Root',mimeType:FOLDER}:{id:'file',name:'Vencord.exe',mimeType:'application/octet-stream',parents:['root'],permissions:[{type:'anyone',role:'reader'}],capabilities:{canDownload:true},webContentLink:'https://drive.google.com/uc?id=file&export=download'};
 try{
  db=openDatabase(filename);const agent=request.agent(createApp({config,db,oauthClient:oauth,driveRequest}));
  await agent.get('/auth/google');await agent.get('/auth/google/callback').query({state:pending.state,code:'test'}).expect(302);const csrf=(await agent.get('/api/admin/session')).body.csrfToken;
  const saved=(await agent.post('/api/admin/posts').set('Origin',config.baseUrl).set('X-CSRF-Token',csrf).send({title:'Vencord restart',slug:'vencord-restart',category:'app',description:'Restart regression',images:[],status:'published',drive_file_ids:['file'],drive_public_file_ids:['file']}).expect(201)).body;
  db.close();db=openDatabase(filename);const restarted=createApp({config,db});
  const post=(await request(restarted).get('/api/posts/vencord-restart').expect(200)).body;
  assert.equal(post.drive_files[0].file_id,saved.drive_files[0].file_id);assert.ok(post.drive_files[0].download_url.includes('export=download'));
  assert.equal(readPublished(filename)[0].drive_files[0].download_url,post.drive_files[0].download_url);
 }finally{db?.close();await rm(dir,{recursive:true,force:true});}
});

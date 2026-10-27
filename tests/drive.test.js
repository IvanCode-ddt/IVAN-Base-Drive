import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/database.js';
import { createApp } from '../server/app.js';
import { createDrive, DRIVE_SCOPE, FOLDER } from '../server/drive.js';
import { validatePost } from '../server/posts.js';
import { detailHTML } from '../js/content.js';

const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.com',clientId:'test',clientSecret:'test',sessionSecret:randomBytes(48).toString('hex'),secure:false,driveRootId:'root_123'};
const post={title:'Existing post',slug:'existing',category:'other',description:'Description',images:[],status:'published',drive_file_id:'legacy_private_123'};
function setup(t,{scope=DRIVE_SCOPE,expired=false}={}) {
  const db=openDatabase(':memory:'); t.after(()=>db.close());
  let pending,identity={},failure=null,revoked=false;
  const files={
    root_123:{id:'root_123',name:'Root',mimeType:FOLDER},
    sub_123:{id:'sub_123',name:'Subfolder',mimeType:FOLDER,parents:['root_123']},
    empty_123:{id:'empty_123',name:'Empty',mimeType:FOLDER,parents:['sub_123']},
    file_123:{id:'file_123',name:'PRIVATE <script>secret</script>.zip',mimeType:'application/zip',size:'4096',modifiedTime:'2026-10-27T00:00:00Z',parents:['sub_123'],webContentLink:'https://drive.google.com/uc?id=file_123&export=download&resourcekey=test-key',resourceKey:'test-key',capabilities:{canDownload:true},permissions:[{type:'anyone',role:'reader'}]},
    file_456:{id:'file_456',name:'Second file',mimeType:'audio/mpeg',size:'8192',parents:['root_123']},
    outside_123:{id:'outside_123',name:'Outside',mimeType:FOLDER},
    secret_123:{id:'secret_123',name:'Outside file',mimeType:'text/plain',parents:['outside_123']},
    shortcut_123:{id:'shortcut_123',name:'Shortcut',mimeType:'application/vnd.google-apps.shortcut',parents:['root_123']},
    trashed_123:{id:'trashed_123',name:'Trash',mimeType:'text/plain',parents:['root_123'],trashed:true},
  };
  const calls=[];
  const transport=async(tokens,resource,params)=>{
    assert.equal(tokens.access_token,'server-only-test-token');calls.push({resource,params});
    if(failure)throw{response:{status:failure}};
    if(resource.startsWith('files/')){const f=files[resource.slice(6)];if(!f)throw{response:{status:404}};return f;}
    const folder=params.q.match(/^'([^']+)'/)[1];
    assert.ok(params.fields.includes('nextPageToken'));assert.ok(params.fields.includes('webContentLink'));assert.ok(params.fields.includes('capabilities(canDownload)'));assert.equal(params.pageSize,50);assert.equal(params.supportsAllDrives,true);
    if(folder==='empty_123')return{files:[]};
    if(folder==='root_123')return params.pageToken?{files:[files.file_456]}:{files:[files.sub_123],nextPageToken:'google-next-page'};
    return{files:[files.file_123,files.empty_123]};
  };
  const oauth={generateAuthUrl(p){pending=p;return'https://accounts.google.com/auth'},async getToken(){return{tokens:{id_token:'id-test',access_token:'server-only-test-token',refresh_token:'must-not-be-stored',scope,expiry_date:Date.now()+(expired?-1000:3600000)}}},async verifyIdToken(){return{getPayload:()=>({sub:'admin',email:config.adminEmail,email_verified:true,nonce:pending.nonce,...identity})}},async revokeToken(token){assert.equal(token,'server-only-test-token');revoked=true;}};
  const app=createApp({config,db,oauthClient:oauth,driveRequest:transport}),agent=request.agent(app);
  async function login(overrides={}){identity=overrides;await agent.get('/auth/google').expect(302);return agent.get('/auth/google/callback').query({state:pending.state,code:'test'});}
  async function token(){return(await agent.get('/api/admin/session').expect(200)).body.csrfToken;}
  function write(method,url,csrf,body={}){return agent[method](url).set('Origin',config.baseUrl).set('X-CSRF-Token',csrf).send(body);}
  return{db,app,agent,login,token,write,files,calls,transport,setFailure:value=>failure=value,pending:()=>pending,revoked:()=>revoked};
}

test('Drive endpoints require server-side admin and CSRF; OAuth uses metadata-only scope',async t=>{
 const s=setup(t);
 for(const route of ['/api/admin/drive/status','/api/admin/drive/files','/api/admin/posts/id/drive-files'])await request(s.app).get(route).expect(401);
 await request(s.app).post('/api/admin/drive/drafts').send({fileId:'file_123'}).expect(401);
 await request(s.app).get('/admin/drive.js').expect(302);
 assert.equal((await s.login({email:'other@example.com'})).status,403);await s.agent.get('/api/admin/drive/files').expect(401);
 assert.equal((await s.login()).status,302);
 assert.deepEqual(s.pending().scope,['openid','email',DRIVE_SCOPE]);assert.equal(s.pending().access_type,'online');
 const session=await s.agent.get('/api/admin/session').expect(200);
 const status=await s.agent.get('/api/admin/drive/status').expect(200);
 assert.equal(status.body.connected,true);
 assert.ok(!JSON.stringify([session.body,status.body]).includes('server-only-test-token'));
 assert.ok(!JSON.stringify([session.body,status.body]).includes('must-not-be-stored'));
 for(const route of ['/api/admin/drive/drafts','/api/admin/drive/disconnect','/api/admin/posts/id/drive-files'])await s.agent.post(route).send({fileId:'file_123'}).expect(403);
});

test('Drive folders, breadcrumb, empty folder, signed pagination, ancestry and shortcuts',async t=>{
 const s=setup(t);await s.login();
 const root=(await s.agent.get('/api/admin/drive/files').expect(200)).body;
 assert.equal(root.files[0].is_folder,true);assert.deepEqual(root.breadcrumb.map(f=>f.id),['root_123']);assert.ok(root.nextPageToken);
 const page=(await s.agent.get('/api/admin/drive/files').query({pageToken:root.nextPageToken}).expect(200)).body;assert.equal(page.files[0].file_id,'file_456');assert.equal(page.nextPageToken,null);
 const sub=(await s.agent.get('/api/admin/drive/files').query({folderId:'sub_123'}).expect(200)).body;assert.deepEqual(sub.breadcrumb.map(f=>f.id),['root_123','sub_123']);assert.equal(sub.files[0].size,'4096');
 assert.equal((await s.agent.get('/api/admin/drive/files').query({folderId:'empty_123'}).expect(200)).body.files.length,0);
 await s.agent.get('/api/admin/drive/files').query({folderId:'outside_123'}).expect(403);
 await s.agent.get('/api/admin/drive/files').query({folderId:'shortcut_123'}).expect(400);
 await s.agent.get('/api/admin/drive/files').query({folderId:"x' or trashed=true"}).expect(400);
 await s.agent.get('/api/admin/drive/files').query({folderId:'sub_123',pageToken:root.nextPageToken}).expect(400);
 await s.agent.get('/api/admin/drive/files').query({pageToken:'tampered'}).expect(400);
 const before=s.calls.length;await s.agent.get('/api/admin/drive/files').expect(200);assert.ok(s.calls.length>before,'sync makes fresh API calls');
});

test('multiple linked files preserve status; only explicitly approved files on published posts are public',async t=>{
 const s=setup(t);await s.login();const csrf=await s.token();
 const published=s.db.create(validatePost(post));const draft=s.db.create(validatePost({...post,slug:'draft',status:'draft'}));
 const url=id=>`/api/admin/posts/${id}/drive-files`;
 for(const id of [published.id,draft.id]){
   await s.write('post',url(id),csrf,{fileId:'file_123',sharingConfirmed:true}).expect(200);
   await s.write('post',url(id),csrf,{fileId:'file_456'}).expect(200);
   assert.equal(s.db.linkedFiles(id).length,2);assert.ok(s.db.linkedFiles(id).every(f=>f.sharing_confirmed===0));
 }
 assert.equal(s.db.get(published.id).status,'published');assert.equal(s.db.get(draft.id).status,'draft');
 for(const route of ['/api/drive/files','/api/drive/status','/api/posts/existing/drive-files'])await request(s.app).get(route).expect(404);
 let publicPost=(await request(s.app).get('/api/posts/existing').expect(200)).body;
 assert.deepEqual(publicPost.drive_files,[]);assert.equal('drive_file_id' in publicPost,false);assert.ok(!JSON.stringify(publicPost).includes('PRIVATE'));assert.ok(!JSON.stringify(publicPost).includes('legacy_private_123'));
 await s.write('put',`${url(published.id)}/file_123`,csrf,{}).expect(400);
 await s.write('put',`${url(published.id)}/file_123`,csrf,{sharingConfirmed:true}).expect(200);
 await s.write('put',`${url(draft.id)}/file_123`,csrf,{sharingConfirmed:true}).expect(200);
 publicPost=(await request(s.app).get('/api/posts/existing')).body;
 assert.equal(publicPost.drive_files[0].can_download,1);assert.ok(publicPost.drive_files[0].download_url.includes('resourcekey=test-key'));
 assert.equal('sharing_access' in publicPost.drive_files[0],false);assert.equal('resource_key' in publicPost.drive_files[0],false);
 assert.equal(publicPost.drive_files.length,1);assert.equal(publicPost.drive_files[0].file_id,'file_123');assert.equal('confirmed_by' in publicPost.drive_files[0],false);
 assert.ok(!JSON.stringify(publicPost).includes('file_456'));assert.equal((await request(s.app).get('/api/posts')).body.length,1);
 await s.write('put',`/api/admin/posts/${published.id}`,csrf,{...post,status:'draft'}).expect(200);
 await request(s.app).get('/api/posts/existing').expect(404);
 assert.equal(s.db.linkedFiles(published.id).length,2);
 await s.write('put',`/api/admin/posts/${published.id}`,csrf,post).expect(200);
 assert.equal((await request(s.app).get('/api/posts/existing')).body.drive_files.length,1);
 await request(s.app).get('/api/posts/draft').expect(404);
 const html=detailHTML(publicPost);assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));
 await s.write('post',url(published.id),csrf,{fileId:'file_123'}).expect(200);assert.equal(s.db.linkedFiles(published.id).length,2);
 await s.write('post',url(published.id),csrf,{fileId:'secret_123'}).expect(403);
 await s.write('post',url(published.id),csrf,{fileId:'shortcut_123'}).expect(400);
 await s.write('post',url(published.id),csrf,{fileId:'sub_123'}).expect(400);
 await s.write('post',url(published.id),csrf,{fileId:'trashed_123'}).expect(404);
 await s.write('post','/api/admin/posts/missing/drive-files',csrf,{fileId:'file_123'}).expect(404);
 s.files.file_456.parents=['outside_123'];
 await s.write('put',`${url(published.id)}/file_456`,csrf,{sharingConfirmed:true}).expect(403);
 await s.write('put',`${url(published.id)}/file_123`,csrf,{sharingConfirmed:false}).expect(200);
 assert.equal((await request(s.app).get('/api/posts/existing')).body.drive_files.length,0);
 await s.write('delete',`${url(published.id)}/file_123`,csrf).expect(200);assert.equal(s.db.linkedFiles(published.id).length,1);
 assert.equal(s.db.get(published.id).status,'published');
});

test('new file creates draft only on explicit request, without public metadata or permission writes',async t=>{
 const s=setup(t);await s.login();const csrf=await s.token();
 await s.agent.get('/api/admin/drive/files');assert.equal(s.db.list().length,0);
 const saved=(await s.write('post','/api/admin/drive/drafts',csrf,{fileId:'file_123',category:'game',status:'published'}).expect(201)).body;
 assert.equal(saved.status,'draft');assert.equal(saved.category,'game');assert.equal(saved.drive_files.length,1);assert.equal(saved.drive_files[0].sharing_confirmed,0);
 assert.deepEqual((await request(s.app).get('/api/posts')).body,[]);
 assert.ok(s.calls.every(c=>c.resource==='files'||c.resource.startsWith('files/')));
});

test('expired or missing scope, Google errors, disconnect and revoked tokens',async t=>{
 for(const options of [{expired:true},{scope:'openid email'}]){
  const s=setup(t,options);await s.login();const result=await s.agent.get('/api/admin/drive/files').expect(409);assert.ok(['DRIVE_RECONNECT','DRIVE_SCOPE'].includes(result.body.code));
 }
 const s=setup(t);await s.login();
 for(const[upstream,expected]of[[401,409],[403,403],[404,404],[429,503],[500,502]]){
  s.setFailure(upstream);const response=await s.agent.get('/api/admin/drive/files').expect(expected);assert.ok(!JSON.stringify(response.body).includes('server-only-test-token'));
 }
 s.setFailure(null);await s.write('post','/api/admin/drive/disconnect',await s.token()).expect(200);assert.equal(s.revoked(),true);
 await s.agent.get('/api/admin/drive/files').expect(409);assert.equal((await s.agent.get('/api/admin/drive/status')).body.connected,false);
 await s.agent.get('/api/admin/posts').expect(200);
});

test('v1 SQLite migration preserves posts and legacy IDs, stays private, and is idempotent',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ivan-v1-')),filename=path.join(dir,'old.sqlite');let db;
 try {
  db=openDatabase(filename);const saved=db.create(validatePost(post));db.close();db=null;
  const raw=new DatabaseSync(filename);raw.exec('DROP TABLE post_drive_files; PRAGMA user_version=1;');raw.close();
  db=openDatabase(filename);let migrated=db.get(saved.id);
  assert.equal(migrated.title,saved.title);assert.equal(migrated.status,saved.status);assert.equal(migrated.created_at,saved.created_at);assert.equal(migrated.drive_file_id,'legacy_private_123');assert.equal(migrated.drive_files.length,1);assert.equal(migrated.drive_files[0].sharing_confirmed,0);assert.deepEqual(db.publicPost(migrated).drive_files,[]);
  db.close();db=openDatabase(filename);assert.equal(db.get(saved.id).drive_files.length,1);
 }finally{db?.close();for(const suffix of['','-wal','-shm'])rmSync(filename+suffix,{force:true});rmdirSync(dir);}
});

test('ancestor cycle and excessively deep paths fail closed',async()=>{
 const transport=async(tokens,resource)=>({id:resource.slice(6),mimeType:FOLDER,parents:[resource.slice(6)==='cycle_a'?'cycle_b':'cycle_a']});
 const drive=createDrive(config,{access_token:'test',scope:DRIVE_SCOPE},transport);
 await assert.rejects(()=>drive.list('cycle_a'),error=>error.status===403);
 const deep=createDrive(config,{access_token:'test',scope:DRIVE_SCOPE},async(tokens,resource)=>({id:resource.slice(6),mimeType:FOLDER,parents:[String(Number(resource.slice(6))+1)]}));
 await assert.rejects(()=>deep.list('1'),error=>error.status===403);
});

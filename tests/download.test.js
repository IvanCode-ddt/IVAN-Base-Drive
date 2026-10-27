import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileSnapshot } from '../server/drive.js';
import { openDatabase } from '../server/database.js';
import { validatePost } from '../server/posts.js';
import { detailHTML } from '../js/content.js';
import { inspectLink } from '../scripts/check-drive-download.mjs';
import { oauthFailure } from '../server/oauth-error.js';

const binary={id:'test_file',name:'test.txt',mimeType:'text/plain',webViewLink:'https://drive.google.com/file/d/test_file/view?resourcekey=link-key',webContentLink:'https://drive.google.com/uc?id=test_file&export=download&resourcekey=link-key',resourceKey:'link-key',capabilities:{canDownload:true},permissions:[{type:'anyone',role:'reader'}]};
test('download metadata keeps official URLs/resource keys, and checks capabilities, restrictions and binary type',()=>{
 const good=fileSnapshot(binary);assert.equal(good.download_url,binary.webContentLink);assert.equal(good.web_url,binary.webViewLink);assert.equal(good.resource_key,'link-key');assert.equal(good.sharing_access,'anyone');assert.equal(good.can_download,1);
 const appended=fileSnapshot({...binary,webContentLink:'https://drive.google.com/uc?export=download&id=test_file',webViewLink:undefined});assert.equal(new URL(appended.download_url).searchParams.get('resourcekey'),'link-key');assert.equal(new URL(appended.web_url).searchParams.get('resourcekey'),'link-key');
 const retained=fileSnapshot({...binary,resourceKey:'different'});assert.equal(new URL(retained.download_url).searchParams.get('resourcekey'),'link-key');
 const fromLink=fileSnapshot({...binary,resourceKey:undefined});assert.equal(fromLink.resource_key,'link-key');
 for(const change of [{capabilities:{canDownload:false}},{capabilities:{}},{copyRequiresWriterPermission:true},{downloadRestrictions:{effectiveDownloadRestrictionWithContext:{restrictedForReaders:true}}},{downloadRestrictions:{effectiveDownloadRestrictionWithContext:{restrictedForWriters:true}}},{webContentLink:undefined},{mimeType:'application/vnd.google-apps.document'},{webContentLink:'https://evil.example/file'},{webContentLink:'https://drive.google.com/uc?access_token=secret'},{webContentLink:'javascript:alert(1)'}])assert.equal(fileSnapshot({...binary,...change}).download_url,'');
 assert.equal(fileSnapshot({...binary,permissions:[{type:'user',role:'reader'}]}).sharing_access,'restricted');assert.equal(fileSnapshot({...binary,permissions:undefined}).sharing_access,'unknown');
});

test('public buttons use download URL, keep view separate, and do not invent unsupported download links',()=>{
 const linked={...fileSnapshot(binary),sharing_confirmed:1};
 const post={title:'Test',description:'Description',category:'other',images:[],drive_files:[linked]};
 const html=detailHTML(post);
 assert.ok(html.includes('export=download'));assert.ok(html.includes('resourcekey=link-key'));assert.ok(html.includes('Xem trên Google Drive'));
 const primary=[...html.matchAll(/<a class="primary-button[^>]*href="([^"]+)"/g)].map(m=>m[1]);assert.ok(primary.length>=1);assert.ok(primary.every(url=>!url.includes('/view')));
 const fallback=detailHTML({...post,drive_files:[{...linked,download_url:'',can_download:0}]});assert.ok(fallback.includes('Xem trên Google Drive'));assert.ok(!fallback.includes('export=download'));assert.ok(!fallback.includes('↓ Tải xuống'));
 const old=detailHTML({...post,drive_files:[],attachment_url:binary.webViewLink});assert.ok(old.includes('Xem trên Google Drive'));assert.ok(!old.includes('↓ Tải xuống'));
 const hidden=detailHTML({...post,drive_files:[{...linked,sharing_confirmed:0}]},{preview:true});assert.ok(!hidden.includes('export=download'));
});

test('v2 migration preserves post, approval and links; new download metadata is persisted and private until approved',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ivan-download-')),filename=path.join(dir,'old.sqlite');let db;
 try {
  db=openDatabase(filename);const post=db.create(validatePost({title:'Keep me',slug:'keep',category:'other',description:'Keep data',images:[],status:'published'}));const snap=fileSnapshot(binary);db.linkFile(post.id,snap);db.confirmFile(post.id,binary.id,snap,'admin@example.com');db.close();db=null;
  const raw=new DatabaseSync(filename);
  for(const col of ['download_url','resource_key','can_download','sharing_access','metadata_checked_at'])raw.exec(`ALTER TABLE post_drive_files DROP COLUMN ${col}`);
  raw.exec('PRAGMA user_version=2;');raw.close();
  db=openDatabase(filename);const migrated=db.get(post.id);assert.equal(migrated.title,post.title);assert.equal(migrated.created_at,post.created_at);assert.equal(migrated.status,'published');assert.equal(migrated.drive_files[0].sharing_confirmed,1);assert.equal(migrated.drive_files[0].web_url,snap.web_url);assert.equal(migrated.drive_files[0].download_url,'');
  db.confirmFile(post.id,binary.id,snap,'admin@example.com');assert.equal(db.publicPost(db.get(post.id)).drive_files[0].download_url,snap.download_url);
  db.confirmFile(post.id,binary.id,null,'admin@example.com');assert.deepEqual(db.publicPost(db.get(post.id)).drive_files,[]);
  db.close();db=openDatabase(filename);assert.equal(db.get(post.id).drive_files[0].resource_key,'link-key');
 }finally{db?.close();for(const suffix of['','-wal','-shm'])rmSync(filename+suffix,{force:true});rmSync(dir,{recursive:true,force:true});}
});

test('anonymous HTTP checker distinguishes actual attachment bytes from Google confirmation/login/error without bypass',async()=>{
 const fetcher=(body,type,status=200,url='https://drive.google.com/download',attachment=false)=>async()=>{
  const response=new Response(body,{status,headers:{'content-type':type,...attachment?{'content-disposition':'attachment; filename=test.txt'}:{}}});Object.defineProperty(response,'url',{value:url});return response;
 };
 assert.equal((await inspectLink('https://drive.google.com/download',{download:true,fetcher:fetcher('test bytes','application/octet-stream',200,undefined,true)})).result,'download-started');
 assert.equal((await inspectLink('https://drive.google.com/download',{download:true,fetcher:fetcher('<form id="download-form">Download anyway</form>','text/html')})).result,'google-confirmation-required');
 assert.equal((await inspectLink('https://drive.google.com/download',{download:true,fetcher:fetcher('<input id="identifierId">','text/html',200,'https://accounts.google.com/login')})).result,'login-required');
 assert.equal((await inspectLink('https://drive.google.com/download',{download:true,fetcher:fetcher('Denied','text/html',403)})).result,'http-error');
});

test('OAuth diagnostic distinguishes network and configuration without exposing tokens, secret or provider body',()=>{
 const network=oauthFailure({code:'EACCES',message:'secret-code'},'exchange');assert.equal(network.code,'OAUTH_NETWORK');
 for(const[provider,expected]of[['invalid_client','OAUTH_CLIENT'],['invalid_grant','OAUTH_CODE'],['redirect_uri_mismatch','OAUTH_REDIRECT']]){
  const result=oauthFailure({response:{data:{error:provider,error_description:'secret-code',access_token:'secret-token'}}},'exchange');assert.equal(result.code,expected);assert.ok(!JSON.stringify(result).includes('secret-'));
 }
});

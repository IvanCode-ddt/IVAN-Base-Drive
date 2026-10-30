import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {openDatabase} from '../server/database.js';
import {createApp} from '../server/app.js';
import {validatePost} from '../server/posts.js';
import {publicMusicAlbum} from '../server/music.js';
import {readMusicAlbums,exportStatic} from '../scripts/export-static.mjs';

const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.com',clientId:'music-test',clientSecret:'music-test-secret',sessionSecret:randomBytes(48).toString('hex'),secure:false};
const postBody={title:'Test Album',slug:'test-album',category:'music',description:'',introduction:'',instructions:'',cover_url:'',images:[],attachment_url:'',drive_file_id:'',media_url:'',status:'published'};
const tracks=[
 {title:'First Track',duration_seconds:190,source_kind:'direct',direct_url:'https://media.example.test/first.mp3',mime_type:'audio/mpeg',drive_file_id:'',sharing_confirmed:true},
 {title:'Second Track',duration_seconds:null,source_kind:'direct',direct_url:'https://media.example.test/second.ogg',mime_type:'audio/ogg',drive_file_id:'',sharing_confirmed:true},
 {title:'Third Track',duration_seconds:205,source_kind:'direct',direct_url:'https://media.example.test/third.m4a',mime_type:'audio/mp4',drive_file_id:'',sharing_confirmed:true},
];
const albumBody=()=>({cms_contract:2,post:{...postBody},drive_file_ids:[],drive_public_file_ids:[],album:{artist:'Test artist',release_year:'2024',genre:'Ambient',bundle_file_id:'',tracks:tracks.map(track=>({...track}))}});
function fixture(){
 const db=openDatabase(':memory:');let pending;
 const oauth={generateAuthUrl(params){pending=params;return`https://accounts.google.com/auth?state=${params.state}`;},async getToken(){return{tokens:{id_token:'id'}};},async verifyIdToken(){return{getPayload:()=>({sub:'music-test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const app=createApp({config,db,oauthClient:oauth});
 return{db,app,close:()=>db.close()};
}
const write=(agent,method,url,csrf,body)=>agent[method](url).set('Origin',config.baseUrl).set('X-CSRF-Token',csrf).send(body);

test('v12 migration creates separate album tables after a verified backup and preserves legacy media posts',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ivan-music-migration-')),filename=path.join(directory,'ivan.sqlite');let db;
 try{
  db=openDatabase(filename);
  const legacy=db.create(validatePost({title:'Legacy music post',slug:'legacy-music-post',category:'music',description:'Original text',images:[],status:'published',media_url:'https://media.example.test/legacy.mp3'}));
  const film=db.create(validatePost({title:'Legacy film',slug:'legacy-film',category:'film',description:'Old film content',images:[],status:'draft'}));
  db.close();db=null;
  const raw=new DatabaseSync(filename);raw.exec('DROP TABLE music_tracks;DROP TABLE music_albums;PRAGMA user_version=12');raw.close();
  db=openDatabase(filename);
  assert.equal(db.get(legacy.id).media_url,'https://media.example.test/legacy.mp3');assert.equal(db.get(film.id).title,'Legacy film');
  assert.equal(db.musicAlbums().length,0);
  const version=new DatabaseSync(filename,{readOnly:true});assert.equal(version.prepare('PRAGMA user_version').get().user_version,13);version.close();
  const reports=(await readdir(path.join(directory,'backups'))).filter(name=>name.endsWith('.verified.json'));
  assert.equal(reports.length,1);const report=JSON.parse(await readFile(path.join(directory,'backups',reports[0]),'utf8'));assert.equal(report.integrity,'ok');assert.equal(report.postCount,2);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

test('album API requires OAuth, creates/reorders/edits tracks with stable IDs, and leaves legacy music separate',async()=>{
 const{db,app,close}=fixture();const agent=request.agent(app);let pending;
 try{
  const legacy=db.create(validatePost({title:'Old music article',slug:'old-music-article',category:'music',description:'Legacy',images:[],status:'published'}));
  await request(app).get('/api/admin/music/albums').expect(401);await request(app).get('/admin/music-editor.html').expect(302);
  await agent.get('/auth/google').expect(302);
  const start=await agent.get('/api/admin/session').expect(401);assert.equal(start.status,401);
  const stateUrl=await agent.get('/auth/google');assert.ok(stateUrl.headers.location);
  const session=await agent.get('/api/admin/session').expect(401);assert.equal(session.status,401);
  pending=new URL(stateUrl.headers.location).searchParams.get('state');
  await agent.get('/auth/google/callback').query({state:pending,code:'valid-code'}).expect(302);
  const csrf=(await agent.get('/api/admin/session').expect(200)).body.csrfToken;
  assert.equal((await agent.get('/api/admin/music/albums').expect(200)).body.length,0);
  const created=(await write(agent,'post','/api/admin/music/albums',csrf,albumBody()).expect(201)).body;
  assert.equal(created.post.title,'Test Album');assert.equal(created.tracks.length,3);assert.deepEqual(created.tracks.map(track=>track.position),[0,1,2]);
  const ids=created.tracks.map(track=>track.id);await new Promise(resolve=>setTimeout(resolve,3));
  const update={...albumBody(),post:{...created.post},album:{...albumBody().album,tracks:[created.tracks[2],created.tracks[0],created.tracks[1]].map(track=>({...track}))}};
  update.post.title='Edited Album';update.post.slug='test-album';update.album.tracks[0].title='Third Track Edited';
  const updated=await write(agent,'put',`/api/admin/music/albums/${created.post_id}`,csrf,update);assert.equal(updated.status,200,JSON.stringify(updated.body));const saved=updated.body;
  assert.deepEqual(saved.tracks.map(track=>track.id),[ids[2],ids[0],ids[1]]);assert.deepEqual(saved.tracks.map(track=>track.position),[0,1,2]);
  assert.equal(saved.post.title,'Edited Album');assert.ok(saved.post.updated_at>=created.post.updated_at);
  const publicAlbums=(await request(app).get('/api/music/albums').expect(200)).body;
  assert.equal(Object.hasOwn(publicAlbums.albums[0],'tracks'),false);
  const publicPosts=(await request(app).get('/api/posts').expect(200)).body;
  assert.equal(publicPosts.find(post=>post.id===legacy.id).content_type,'post');assert.equal(publicPosts.find(post=>post.id===created.post_id).content_type,'music_album');
  assert.equal((await agent.get('/api/admin/music/albums').expect(200)).body.length,1);
  const preservedTracks=db.musicAlbum(created.post_id).tracks;
  const albumWithoutTrackEditor={...albumBody(),post:{...saved.post,title:'Edited Album without track editor',status:'draft'},album:{artist:'Test artist',release_year:'2024',genre:'Ambient',bundle_file_ids:[]}};
  await write(agent,'put',`/api/admin/music/albums/${created.post_id}`,csrf,albumWithoutTrackEditor).expect(200);
  assert.deepEqual(db.musicAlbum(created.post_id).tracks,preservedTracks);
  const noArchive=albumBody();noArchive.post={...noArchive.post,slug:'published-without-archive'};noArchive.album={artist:'Test artist',bundle_file_ids:[]};
  await write(agent,'post','/api/admin/music/albums',csrf,noArchive).expect(400);
  const invalid=albumBody();invalid.post={...invalid.post,slug:'unsafe-album-url'};invalid.album.tracks[0].direct_url='javascript:alert(1)';
  const sanitized=await write(agent,'post','/api/admin/music/albums',csrf,invalid).expect(201);
  assert.equal(sanitized.body.tracks[0].direct_url,'');
 }finally{close();}
});

test('Music albums expose only authorized archive downloads and Drive fallbacks, never streaming URLs or private files',()=>{
 const album=publicMusicAlbum({artist:'Artist',release_year:2022,genre:'Jazz',bundle_file_id:'bundle_123456',bundle_file_ids:['bundle_123456','bundle_rar_123456','private_bundle_123456'],post:{id:'post-id',slug:'album',title:'Album',description:'',cover_url:'',updated_at:'2026-01-01',status:'published',is_pinned:false,pin_order:0,drive_files:[
  {file_id:'audio_public_123',name:'Public.mp3',mime_type:'audio/mpeg',sharing_confirmed:1,sharing_access:'anyone',can_download:1,web_url:'https://drive.google.com/file/d/audio_public_123/view?resourcekey=public-key',download_url:'https://drive.google.com/uc?export=download&id=audio_public_123'},
  {file_id:'audio_private_123',name:'Private.mp3',mime_type:'audio/mpeg',sharing_confirmed:0,sharing_access:'restricted',can_download:1,web_url:'https://drive.google.com/file/d/audio_private_123/view',download_url:'https://drive.google.com/uc?id=audio_private_123'},
  {file_id:'bundle_123456',name:'Album.zip',mime_type:'application/zip',sharing_confirmed:1,sharing_access:'anyone',can_download:1,download_url:'https://drive.google.com/uc?export=download&id=bundle_123456'},
  {file_id:'bundle_rar_123456',name:'Album Part 2.rar',mime_type:'application/vnd.rar',sharing_confirmed:1,sharing_access:'anyone',can_download:0,web_url:'https://drive.google.com/file/d/bundle_rar_123456/view'},
  {file_id:'private_bundle_123456',name:'Private.7z',mime_type:'application/x-7z-compressed',sharing_confirmed:0,sharing_access:'restricted',can_download:1,download_url:'https://drive.google.com/uc?id=private_bundle_123456'},
 ]},tracks:[
  {id:'1',position:0,title:'Preview',duration_seconds:100,source_kind:'drive_preview',drive_file_id:'audio_public_123',sharing_confirmed:0},
  {id:'2',position:1,title:'Private',duration_seconds:null,source_kind:'drive_preview',drive_file_id:'audio_private_123',sharing_confirmed:0},
  {id:'3',position:2,title:'Direct',duration_seconds:120,source_kind:'direct',direct_url:'https://media.example.test/direct.mp3',mime_type:'audio/mpeg',drive_file_id:'',sharing_confirmed:1},
 ]});
 assert.equal(album.bundle_downloads.length,2);
 assert.equal(album.bundle_downloads[0].download_url,'https://drive.google.com/uc?export=download&id=bundle_123456');
 assert.equal(album.bundle_downloads[1].download_url,'');assert.match(album.bundle_downloads[1].open_url,/bundle_rar_123456/);
 assert.equal(Object.hasOwn(album,'tracks'),false);
 assert.ok(!JSON.stringify(album).includes('playback_url'));assert.ok(!JSON.stringify(album).includes('media.example.test'));
 assert.ok(!JSON.stringify(album).includes('audio_private_123'));assert.ok(!JSON.stringify(album).includes('private_bundle_123456'));
});

test('static export writes only Published albums and exports authorized archive downloads only',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ivan-music-export-')),filename=path.join(directory,'db.sqlite'),output=path.join(directory,'docs');let db;
 try{
  db=openDatabase(filename);
  const body=validatePost({...postBody,title:'Exported Album',slug:'exported-album',description:'Exported album description'});
  const audio={file_id:'audio_public_123',name:'Song.mp3',mime_type:'audio/mpeg',size:'1000',modified_time:'',web_url:'https://drive.google.com/file/d/audio_public_123/view?resourcekey=audio-key',download_url:'https://drive.google.com/uc?export=download&id=audio_public_123&resourcekey=audio-key',can_download:1,sharing_access:'anyone',requested_sharing:true};
  const zip={file_id:'bundle_public_123',name:'Album.zip',mime_type:'application/zip',size:'2000',modified_time:'',web_url:'https://drive.google.com/file/d/bundle_public_123/view',download_url:'https://drive.google.com/uc?export=download&id=bundle_public_123',can_download:1,sharing_access:'anyone',requested_sharing:true};
  const rar={file_id:'bundle_rar_public_123',name:'Album Part 2.rar',mime_type:'application/vnd.rar',size:'1000',modified_time:'',web_url:'https://drive.google.com/file/d/bundle_rar_public_123/view',download_url:'https://drive.google.com/uc?export=download&id=bundle_rar_public_123',can_download:1,sharing_access:'anyone',requested_sharing:true};
  const hidden={file_id:'private_audio_123',name:'Private.mp3',mime_type:'audio/mpeg',size:'3000',modified_time:'',web_url:'https://drive.google.com/file/d/private_audio_123/view',download_url:'https://drive.google.com/uc?id=private_audio_123',can_download:1,sharing_access:'restricted',requested_sharing:false};
  const album=db.saveMusicAlbum(body,null,[audio,zip,rar,hidden],{artist:'Export Artist',release_year:2025,genre:'Ambient',bundle_file_id:zip.file_id,bundle_file_ids:[zip.file_id,rar.file_id],tracks:[
   {id:'',title:'Stream',duration_seconds:150,source_kind:'direct',direct_url:'https://media.example.test/stream.mp3',mime_type:'audio/mpeg',drive_file_id:'',sharing_confirmed:true},
   {id:'',title:'Preview',duration_seconds:180,source_kind:'drive_preview',direct_url:'',mime_type:'',drive_file_id:audio.file_id,sharing_confirmed:false},
   {id:'',title:'Private download',duration_seconds:null,source_kind:'download_only',direct_url:'',mime_type:'',drive_file_id:hidden.file_id,sharing_confirmed:false},
  ]},'admin@example.com');
  assert.equal(album.tracks.length,3);db.create(validatePost({...postBody,title:'Draft Album',slug:'draft-album',description:'Draft album',status:'draft'}));
  const exported=await exportStatic({databasePath:filename,outputDir:output});assert.equal(exported.count,1);
  const musicText=await readFile(path.join(output,'content','music.json'),'utf8'),data=JSON.parse(musicText);
  assert.equal(data.albums.length,1);assert.deepEqual(data.albums[0].bundle_downloads.map(file=>file.name),['Album.zip','Album Part 2.rar']);
  assert.match(data.albums[0].bundle_downloads[0].download_url,/bundle_public_123/);
  assert.match(data.albums[0].bundle_downloads[1].open_url,/bundle_rar_public_123/);
  assert.equal(Object.hasOwn(data.albums[0],'tracks'),false);
  assert.equal(db.musicAlbum(album.post_id).tracks.length,3);
  for(const secret of ['private_audio_123','Private download','Draft Album','sharing_confirmed','admin@example.com','playback_url','media.example.test'])assert.ok(!musicText.includes(secret));
  assert.ok(!JSON.stringify(JSON.parse(await readFile(path.join(output,'content','posts.json'),'utf8'))).includes('media.example.test'));
  assert.ok(JSON.parse(await readFile(path.join(output,'content','posts.json'),'utf8')).posts.some(post=>post.id===album.post_id&&post.content_type==='music_album'));
  assert.deepEqual(readMusicAlbums(filename),data.albums);
  assert.ok(await readFile(path.join(output,'content','music.json')));
  for(const file of ['music-content.js','music-player.js'])await assert.rejects(()=>readFile(path.join(output,'js',file)));
  assert.doesNotMatch(await readFile(path.join(output,'js','main.js'),'utf8'),/music-(?:content|player)\.js/);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

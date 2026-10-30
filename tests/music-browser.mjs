import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {exportStatic} from '../scripts/export-static.mjs';
import {DRIVE_SCOPE,FOLDER} from '../server/drive.js';

test('public Library/Music/Film routes, download-only albums, and responsive layout',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ivan-music-browser-')),databasePath=path.join(directory,'db.sqlite'),site=path.join(directory,'site'),db=openDatabase(databasePath);
 const post=validatePost({title:'Browser Album',slug:'browser-album',category:'music',description:'Playlist search phrase',images:[],status:'published'});
 const audio={file_id:'audio_public_123',name:'Preview.mp3',mime_type:'audio/mpeg',size:'1000',modified_time:'',web_url:'https://drive.google.com/file/d/audio_public_123/view?resourcekey=public-key',download_url:'https://drive.google.com/uc?export=download&id=audio_public_123&resourcekey=public-key',can_download:1,sharing_access:'anyone',requested_sharing:true};
 const privateArchive={file_id:'bundle_private_123',name:'Private.7z',mime_type:'application/x-7z-compressed',size:'1000',modified_time:'',web_url:'https://drive.google.com/file/d/bundle_private_123/view',download_url:'https://drive.google.com/uc?id=bundle_private_123',can_download:1,sharing_access:'restricted',requested_sharing:false};
 const zip={file_id:'bundle_public_123',name:'Browser Album.zip',mime_type:'application/zip',size:'3000',modified_time:'',web_url:'https://drive.google.com/file/d/bundle_public_123/view',download_url:'https://drive.google.com/uc?export=download&id=bundle_public_123',can_download:1,sharing_access:'anyone',requested_sharing:true};
 const rar={file_id:'bundle_rar_public_123',name:'Browser Album Part 2.rar',mime_type:'application/vnd.rar',size:'2000',modified_time:'',web_url:'https://drive.google.com/file/d/bundle_rar_public_123/view',download_url:'https://drive.google.com/uc?id=bundle_rar_public_123',can_download:0,sharing_access:'anyone',requested_sharing:true};
 const album=db.saveMusicAlbum(post,null,[audio,privateArchive,zip,rar],{artist:'Browser Artist',release_year:2025,genre:'Ambient',bundle_file_id:zip.file_id,bundle_file_ids:[zip.file_id,rar.file_id],tracks:[
  {id:'',title:'Direct First',duration_seconds:80,source_kind:'direct',direct_url:'https://media.example.test/first.mp3',mime_type:'audio/mpeg',drive_file_id:'',sharing_confirmed:true},
  {id:'',title:'Drive Preview Only',duration_seconds:90,source_kind:'drive_preview',direct_url:'',mime_type:'',drive_file_id:audio.file_id,sharing_confirmed:false},
  {id:'',title:'Private Download',duration_seconds:null,source_kind:'download_only',direct_url:'',mime_type:'',drive_file_id:privateArchive.file_id,sharing_confirmed:false},
  {id:'',title:'Broken Direct',duration_seconds:100,source_kind:'direct',direct_url:'https://media.example.test/broken.mp3',mime_type:'audio/mpeg',drive_file_id:'',sharing_confirmed:true},
 ]},'admin@example.test');
 db.create(validatePost({title:'Ordinary Game',slug:'ordinary-game',category:'game',description:'Only in library',images:[],status:'published'}));
 db.create(validatePost({title:'Legacy Music Post',slug:'legacy-music-post',category:'music',description:'Legacy content',images:[],status:'published'}));
 db.create(validatePost({title:'Legacy Film Post',slug:'legacy-film-post',category:'film',description:'Must not be listed as a movie',images:[],status:'published'}));
 const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.test',clientId:'browser-test',clientSecret:'browser-test-secret',sessionSecret:randomBytes(48).toString('hex'),secure:false};
 const oauth={generateAuthUrl(params){return`${config.baseUrl}/auth/google/callback?state=${params.state}&code=test`;},async getToken(){return{tokens:{id_token:'test'}};},async verifyIdToken(){return{getPayload:()=>({sub:'browser-admin',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 let pending;
 const generate=oauth.generateAuthUrl.bind(oauth);
 oauth.generateAuthUrl=params=>{pending=params;return generate(params);};
 const app=createApp({config,db,oauthClient:oauth});
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));config.baseUrl=`http://127.0.0.1:${server.address().port}`;config.redirectUri=config.baseUrl+'/auth/google/callback';
 await exportStatic({databasePath,outputDir:site});
 const staticServer=(await import('express')).default().use('/site', (await import('express')).default.static(site)).listen(0,'127.0.0.1');await new Promise(resolve=>staticServer.once('listening',resolve));
 const origin=`http://127.0.0.1:${staticServer.address().port}`;let browser;
 try{
  assert.equal(JSON.parse(await readFile(path.join(site,'content/music.json'),'utf8')).albums.length,1);
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const context=await browser.newContext({viewport});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'/site/');await page.locator('#post-grid .post-card').waitFor();
   assert.deepEqual(await page.locator('#post-grid h3').allTextContents(),['Ordinary Game']);
   await page.locator('[data-group="music"]').click();await page.waitForURL(/#music$/);
   assert.deepEqual(errors,[]);
   assert.equal(await page.locator('#album-grid .album-card h3').textContent(),'Browser Album');
   assert.equal(await page.locator('#legacy-music-grid h3').textContent(),'Legacy Music Post');
   await page.locator('#search-input').fill('Browser Album');assert.equal(await page.locator('#album-grid .album-card').count(),1);
   await page.locator('#search-input').fill('');await page.locator('[data-group="films"]').click();await page.waitForURL(/#films$/);
   assert.match(await page.locator('#film-view').textContent(),/Coming soon.*Thư viện phim đang được chuẩn bị/s);
   assert.equal(await page.locator('#film-view video, #film-view audio, #film-view .post-card').count(),0);
   await page.goBack();await page.waitForURL(/#music$/);assert.equal(await page.locator('[data-group="music"]').getAttribute('aria-current'),'page');
   await page.locator('#album-grid .album-card').click();await page.waitForURL(/#album\/browser-album$/);
   assert.equal(await page.locator('.album-track').count(),0);
   assert.equal(await page.locator('.album-download-list li').count(),2);
   assert.equal(await page.locator('.album-download-list li').nth(0).locator('strong').textContent(),'Browser Album.zip');
   assert.equal(new URL(await page.locator('.album-download-list li').nth(0).getByRole('link',{name:'Tải xuống'}).getAttribute('href')).searchParams.get('id'),'bundle_public_123');
   assert.equal(await page.locator('.album-download-list li').nth(1).locator('strong').textContent(),'Browser Album Part 2.rar');
   assert.equal(await page.locator('.album-download-list li').nth(1).getByRole('link',{name:'Tải xuống'}).count(),0);
   assert.equal(new URL(await page.locator('.album-download-list li').nth(1).getByRole('link',{name:'Mở trên Google Drive'}).getAttribute('href')).pathname,'/file/d/bundle_rar_public_123/view');
   assert.equal(await page.locator('.album-download-list').getByText('Private.7z').count(),0);
   assert.equal(await page.getByRole('link',{name:'Tải toàn bộ album'}).count(),0);
   assert.equal(await page.locator('audio,video').count(),0);
   assert.equal(await page.locator('.album-detail button, .album-detail iframe, .album-detail [data-play-track], .album-detail [data-play-album], .album-detail [data-shuffle], .album-detail [data-repeat], .album-detail [data-next], .album-detail [data-previous]').count(),0);
   assert.ok(!(await page.locator('.album-detail').textContent()).includes('Phát'));
   assert.equal(await page.locator('.ambient-particles i').count(),8);
   assert.equal(await page.locator('.ambient-particles').evaluate(node=>getComputedStyle(node).pointerEvents),'none');
   if(viewport.width<600)assert.equal(await page.locator('.ambient-particles i:visible').count(),4);
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.evaluate(()=>document.getAnimations().some(animation=>animation.animationName==='ivan-particle-drift')),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.deepEqual(errors,[]);await context.close();
  }
  const weakContext=await browser.newContext({viewport:{width:1440,height:900}});await weakContext.addInitScript(()=>{
   Object.defineProperty(navigator,'hardwareConcurrency',{value:2});
   Object.defineProperty(navigator,'deviceMemory',{value:2});
  });
  const weakPage=await weakContext.newPage();await weakPage.goto(origin+'/site/');await weakPage.locator('#post-grid .post-card').first().waitFor();
  assert.equal(await weakPage.locator('body').evaluate(node=>node.classList.contains('ambient-motion')),false);
  assert.equal(await weakPage.locator('.ambient-particles i').count(),8);
  await weakContext.close();
 }finally{await browser?.close();await new Promise(resolve=>staticServer.close(resolve));await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true});}
});

test('Admin type picker creates single/multi-package albums and preserves hidden legacy tracks',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ivan-music-admin-browser-')),db=openDatabase(path.join(directory,'db.sqlite')),site=path.join(directory,'docs');
 const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.test',clientId:'browser-test',clientSecret:'browser-test-secret',sessionSecret:randomBytes(48).toString('hex'),secure:false,driveRootId:'music_test_root'};
 const rootFolder={id:config.driveRootId,name:'Music Test Drive',mimeType:FOLDER,parents:[]};
 const files=[
  {id:'music_bundle_1',name:'Album.zip',mimeType:'application/zip',size:'3000',parents:[config.driveRootId],webViewLink:'https://drive.google.com/file/d/music_bundle_1/view',webContentLink:'https://drive.google.com/uc?export=download&id=music_bundle_1',capabilities:{canDownload:true},permissions:[{type:'anyone',role:'reader'}]},
  {id:'music_bundle_2',name:'Album Part 2.rar',mimeType:'application/vnd.rar',size:'2000',parents:[config.driveRootId],webViewLink:'https://drive.google.com/file/d/music_bundle_2/view',webContentLink:'https://drive.google.com/uc?export=download&id=music_bundle_2',capabilities:{canDownload:true},permissions:[{type:'anyone',role:'reader'}]},
 ];
 let pending;const oauth={generateAuthUrl(params){pending=params;return`${config.baseUrl}/auth/google/callback?state=${params.state}&code=test`;},async getToken(){return{tokens:{id_token:'test',access_token:'drive-access',scope:DRIVE_SCOPE,expiry_date:Date.now()+3600000}};},async verifyIdToken(){return{getPayload:()=>({sub:'browser-admin',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const driveRequest=async(_tokens,resource,params)=>resource==='files'?{files:params.q.includes(config.driveRootId)?files:[]}:resource===`files/${config.driveRootId}`?rootFolder:files.find(file=>resource===`files/${file.id}`);
 const server=createApp({config,db,oauthClient:oauth,driveRequest}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));config.baseUrl=`http://127.0.0.1:${server.address().port}`;config.redirectUri=config.baseUrl+'/auth/google/callback';let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];let saveBody;page.on('request',request=>{if(request.url().endsWith('/api/admin/music/albums')&&request.method()==='POST')saveBody=JSON.parse(request.postData());});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(config.baseUrl+'/auth/google');await page.waitForURL('**/admin/');
  await page.locator('#create-post').click();await page.locator('#create-type-dialog[open]').waitFor();
  assert.equal(await page.locator('.create-type-options button:disabled').count(),1);
  const film=page.locator('#create-type-dialog button[disabled]');assert.match(await film.textContent(),/Phim.*Coming soon/);
  await page.locator('#create-type-dialog a[href="/admin/music-editor.html"]').click();await page.waitForFunction(()=>!document.querySelector('#music-form').hasAttribute('inert'));
  await page.locator('[name=title]').fill('Album One Package');await page.locator('[name=artist]').fill('Test Artist');await page.locator('[name=description]').fill('Browser test');
  await page.locator('#choose-drive').click();
  await page.locator('[data-pick="music_bundle_1"]').check();await page.locator('#picker-confirm').click();
  await page.locator('[data-share="music_bundle_1"]').check();await page.locator('[data-package="music_bundle_1"]').check();
  assert.equal(await page.locator('#track-rows, #add-track, [name=bundle_file_id], [data-field=direct_url], [data-field=source_kind]').count(),0);
  await page.locator('button[value=published]').click();await page.waitForFunction(()=>document.querySelector('#music-message').textContent.trim().length>0);assert.match(await page.locator('#music-message').textContent(),/Đã lưu album/,JSON.stringify(saveBody));
  const albums=db.musicAlbums();assert.equal(albums.length,1);const album=albums[0];assert.equal(album.tracks.length,0);
  assert.deepEqual(saveBody.album.bundle_file_ids,['music_bundle_1']);
  await exportStatic({databasePath:path.join(directory,'db.sqlite'),outputDir:site});
  assert.deepEqual(JSON.parse(await readFile(path.join(site,'content/music.json'),'utf8')).albums[0].bundle_downloads.map(file=>file.name),['Album.zip']);
  const legacy=db.saveMusicAlbum(album.post,album.post_id,album.post.drive_files,{artist:album.artist,release_year:album.release_year,genre:album.genre,bundle_file_id:'music_bundle_1',bundle_file_ids:['music_bundle_1'],tracks:[{id:'',title:'Legacy hidden track',duration_seconds:123,source_kind:'direct',direct_url:'https://media.example.test/legacy-track.mp3',mime_type:'audio/mpeg',drive_file_id:'',sharing_confirmed:true}]},config.adminEmail);
  const preservedTracks=db.musicAlbum(legacy.post_id).tracks;
  await page.goto(config.baseUrl+`/admin/music-editor.html?edit=${album.post_id}`);await page.waitForFunction(()=>!document.querySelector('#music-form').hasAttribute('inert'));
  assert.equal(await page.locator('#track-rows, #add-track, [name=bundle_file_id]').count(),0);
  await page.locator('[name=title]').fill('Edited Multi-package Album');
  await page.locator('#choose-drive').click();await page.locator('[data-pick="music_bundle_2"]').check();await page.locator('#picker-confirm').click();
  await page.locator('[data-share="music_bundle_2"]').check();await page.locator('[data-package="music_bundle_2"]').check();
  await page.locator('button[value=published]').click();
  await page.waitForFunction(()=>document.querySelector('#music-message').textContent.includes('Đã lưu album'));
  assert.deepEqual(db.musicAlbum(album.post_id).bundle_file_ids,['music_bundle_1','music_bundle_2']);
  assert.deepEqual(db.musicAlbum(album.post_id).tracks,preservedTracks);
  await exportStatic({databasePath:path.join(directory,'db.sqlite'),outputDir:site});
  assert.deepEqual(JSON.parse(await readFile(path.join(site,'content/music.json'),'utf8')).albums[0].bundle_downloads.map(file=>file.name),['Album.zip','Album Part 2.rar']);
  await page.locator('[data-package="music_bundle_1"]').uncheck();await page.locator('button[value=published]').click();
  await page.waitForFunction(()=>document.querySelector('#music-message').textContent.includes('Đã lưu album'));
  assert.deepEqual(db.musicAlbum(album.post_id).bundle_file_ids,['music_bundle_2']);
  assert.deepEqual(db.musicAlbum(album.post_id).tracks,preservedTracks);assert.deepEqual(errors,[]);
  await page.goto(config.baseUrl+'/admin/');await page.locator('#create-post').click();await page.locator('#create-type-dialog[open]').waitFor();
  await page.locator('#create-type-dialog a[href="/admin/editor.html"]').click();await page.waitForFunction(()=>!document.querySelector('#post-form').hasAttribute('inert'));
  assert.equal(await page.locator('[name=category]').inputValue(),'game');await page.locator('[name=title]').fill('Game with original form');await page.locator('[name=description]').fill('Old CMS form remains functional.');
  await page.locator('button[value=draft]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Đã lưu bản nháp'));
  assert.ok(db.list().some(item=>item.title==='Game with original form'&&item.category==='game'));assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true});}
});

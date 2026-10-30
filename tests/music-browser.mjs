import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {exportStatic} from '../scripts/export-static.mjs';

test('public Library/Music/Film routes, album controls, Drive preview/download and responsive layout',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ivan-music-browser-')),databasePath=path.join(directory,'db.sqlite'),site=path.join(directory,'site'),db=openDatabase(databasePath);
 const post=validatePost({title:'Browser Album',slug:'browser-album',category:'music',description:'Playlist search phrase',images:[],status:'published'});
 const audio={file_id:'audio_public_123',name:'Preview.mp3',mime_type:'audio/mpeg',size:'1000',modified_time:'',web_url:'https://drive.google.com/file/d/audio_public_123/view?resourcekey=public-key',download_url:'https://drive.google.com/uc?export=download&id=audio_public_123&resourcekey=public-key',can_download:1,sharing_access:'anyone',requested_sharing:true};
 const privateAudio={file_id:'audio_private_123',name:'Private.mp3',mime_type:'audio/mpeg',size:'1000',modified_time:'',web_url:'https://drive.google.com/file/d/audio_private_123/view',download_url:'https://drive.google.com/uc?id=audio_private_123',can_download:1,sharing_access:'restricted',requested_sharing:false};
 const zip={file_id:'bundle_public_123',name:'Browser Album.zip',mime_type:'application/zip',size:'3000',modified_time:'',web_url:'https://drive.google.com/file/d/bundle_public_123/view',download_url:'https://drive.google.com/uc?export=download&id=bundle_public_123',can_download:1,sharing_access:'anyone',requested_sharing:true};
 const album=db.saveMusicAlbum(post,null,[audio,privateAudio,zip],{artist:'Browser Artist',release_year:2025,genre:'Ambient',bundle_file_id:zip.file_id,tracks:[
  {id:'',title:'Direct First',duration_seconds:80,source_kind:'direct',direct_url:'https://media.example.test/first.mp3',mime_type:'audio/mpeg',drive_file_id:'',sharing_confirmed:true},
  {id:'',title:'Drive Preview Only',duration_seconds:90,source_kind:'drive_preview',direct_url:'',mime_type:'',drive_file_id:audio.file_id,sharing_confirmed:false},
  {id:'',title:'Private Download',duration_seconds:null,source_kind:'download_only',direct_url:'',mime_type:'',drive_file_id:privateAudio.file_id,sharing_confirmed:false},
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
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const context=await browser.newContext({viewport});await context.addInitScript(()=>{
    HTMLMediaElement.prototype.canPlayType=()=> 'probably';
    HTMLMediaElement.prototype.load=function(){};
    HTMLMediaElement.prototype.pause=function(){};
    HTMLMediaElement.prototype.play=function(){
     if(this.src.includes('/broken.mp3')){this.dispatchEvent(new Event('error'));return Promise.reject(new Error('simulated network error'));}
     this.dispatchEvent(new Event('play'));return Promise.resolve();
    };
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(origin+'/site/');await page.locator('#post-grid .post-card').waitFor();
   assert.deepEqual(await page.locator('#post-grid h3').allTextContents(),['Ordinary Game']);
   await page.locator('[data-group="music"]').click();await page.waitForURL(/#music$/);
   assert.equal(await page.locator('#album-grid .album-card h3').textContent(),'Browser Album');
   assert.equal(await page.locator('#legacy-music-grid h3').textContent(),'Legacy Music Post');
   await page.locator('#search-input').fill('Direct First');assert.equal(await page.locator('#album-grid .album-card').count(),1);
   await page.locator('#search-input').fill('');await page.locator('[data-group="films"]').click();await page.waitForURL(/#films$/);
   assert.match(await page.locator('#film-view').textContent(),/Coming soon.*Thư viện phim đang được chuẩn bị/s);
   assert.equal(await page.locator('#film-view video, #film-view audio, #film-view .post-card').count(),0);
   await page.goBack();await page.waitForURL(/#music$/);assert.equal(await page.locator('[data-group="music"]').getAttribute('aria-current'),'page');
   await page.locator('#album-grid .album-card').click();await page.waitForURL(/#album\/browser-album$/);
   assert.equal(await page.locator('.album-track').count(),4);assert.deepEqual(await page.locator('.album-track .track-number').allTextContents(),['1','2','3','4']);
   assert.equal(await page.locator('.album-track [data-play-track]').count(),2);
   assert.equal(await page.locator('.album-track').nth(1).getByRole('link',{name:/Mở trên Google Drive/}).count(),1);
   assert.equal(await page.locator('.album-track').nth(1).getByRole('link',{name:'Tải bài hát'}).count(),1);
   assert.equal(await page.locator('.album-track').nth(1).locator('audio').count(),0);
   assert.equal(await page.locator('.album-track').nth(2).getByRole('link',{name:'Tải bài hát'}).count(),0);
   assert.equal(await page.locator('[data-play-album]').count(),1);assert.equal(await page.getByRole('link',{name:'Tải toàn bộ album'}).count(),1);
   const audioElement=page.locator('.album-audio');assert.equal(await audioElement.getAttribute('preload'),'none');assert.equal(await audioElement.getAttribute('src'),null);
   await page.locator('[data-play-track="0"]').click();await page.waitForFunction(()=>document.querySelector('.album-player-status').textContent.includes('Đang phát: Direct First'));
   assert.equal(await audioElement.evaluate(el=>new URL(el.src).pathname),'/first.mp3');
   await page.locator('[data-next]').click();await page.waitForFunction(()=>/Không phát được|Lỗi khi tải/.test(document.querySelector('.album-player-status').textContent));
   await page.locator('[data-repeat]').click();assert.equal(await page.locator('[data-repeat]').textContent(),'Lặp: Album');
   await page.locator('[data-repeat]').click();assert.equal(await page.locator('[data-repeat]').textContent(),'Lặp: Bài này');
   await page.locator('[data-repeat]').click();assert.equal(await page.locator('[data-repeat]').textContent(),'Lặp: Tắt');
   await page.locator('[data-shuffle]').click();assert.ok(['first.mp3','broken.mp3'].includes(await audioElement.evaluate(el=>new URL(el.src).pathname.slice(1))));
   assert.equal(await page.locator('.album-audio').count(),1);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>staticServer.close(resolve));await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true});}
});

test('Admin type picker creates albums, keeps Film disabled, and edits ordered tracks',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ivan-music-admin-browser-')),db=openDatabase(path.join(directory,'db.sqlite'));
 const config={baseUrl:'http://localhost:3000',redirectUri:'http://localhost:3000/auth/google/callback',adminEmail:'admin@example.test',clientId:'browser-test',clientSecret:'browser-test-secret',sessionSecret:randomBytes(48).toString('hex'),secure:false};
 let pending;const oauth={generateAuthUrl(params){pending=params;return`${config.baseUrl}/auth/google/callback?state=${params.state}&code=test`;},async getToken(){return{tokens:{id_token:'test'}};},async verifyIdToken(){return{getPayload:()=>({sub:'browser-admin',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const server=createApp({config,db,oauthClient:oauth}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));config.baseUrl=`http://127.0.0.1:${server.address().port}`;config.redirectUri=config.baseUrl+'/auth/google/callback';let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];let saveBody;page.on('request',request=>{if(request.url().endsWith('/api/admin/music/albums')&&request.method()==='POST')saveBody=JSON.parse(request.postData());});page.on('pageerror',error=>errors.push(error.message));
  await page.goto(config.baseUrl+'/auth/google');await page.waitForURL('**/admin/');
  await page.locator('#create-post').click();await page.locator('#create-type-dialog[open]').waitFor();
  assert.equal(await page.locator('.create-type-options button:disabled').count(),1);
  const film=page.locator('#create-type-dialog button[disabled]');assert.match(await film.textContent(),/Phim.*Coming soon/);
  await page.locator('#create-type-dialog a[href="/admin/music-editor.html"]').click();await page.waitForFunction(()=>!document.querySelector('#music-form').hasAttribute('inert'));
  await page.locator('[name=title]').fill('Three Song Album');await page.locator('[name=artist]').fill('Test Artist');await page.locator('[name=description]').fill('Browser test');
  for(let index=0;index<3;index++)await page.locator('#add-track').click();
  for(let index=0;index<3;index++){
   const row=page.locator('#track-rows .album-track-editor').nth(index);await row.locator('[data-field=source_kind]').selectOption('direct');
   const current=page.locator('#track-rows .album-track-editor').nth(index);
   await current.locator('[data-field=title]').fill(`Track ${index+1}`);
   await current.locator('[data-field=direct_url]').fill(`https://media.example.test/admin-${index+1}.mp3`);
   assert.equal(await current.locator('[data-field=direct_url]').inputValue(),`https://media.example.test/admin-${index+1}.mp3`);
   await current.locator('[data-field=sharing_confirmed]').check();
  }
  assert.deepEqual(await page.locator('#track-rows [data-field=sharing_confirmed]').evaluateAll(nodes=>nodes.map(node=>node.checked)),[true,true,true]);
  await page.locator('#track-rows .album-track-editor').nth(2).locator('[data-move="-1"]').click();
  await page.locator('#track-rows .album-track-editor').nth(1).locator('[data-move="-1"]').click();
  assert.deepEqual(await page.locator('#track-rows .album-track-editor [data-field=title]').evaluateAll(nodes=>nodes.map(node=>node.value)),['Track 3','Track 1','Track 2']);
  await page.locator('button[value=published]').click();await page.waitForFunction(()=>document.querySelector('#music-message').textContent.trim().length>0);assert.match(await page.locator('#music-message').textContent(),/Đã lưu album/,JSON.stringify(saveBody));
  const albums=db.musicAlbums();assert.equal(albums.length,1);const album=albums[0];assert.deepEqual(album.tracks.map(track=>track.title),['Track 3','Track 1','Track 2']);
  const ids=album.tracks.map(track=>track.id);await page.goto(config.baseUrl+`/admin/music-editor.html?edit=${album.post_id}`);await page.waitForFunction(()=>!document.querySelector('#music-form').hasAttribute('inert'));
  assert.deepEqual(await page.locator('#track-rows .album-track-editor [data-field=title]').evaluateAll(nodes=>nodes.map(node=>node.value)),['Track 3','Track 1','Track 2']);
  await page.locator('#track-rows .album-track-editor').nth(0).locator('[data-field=title]').fill('Edited Track 3');await page.locator('button[value=published]').click();
  await page.waitForFunction(()=>document.querySelector('#music-message').textContent.includes('Đã lưu album'));
  assert.deepEqual(db.musicAlbum(album.post_id).tracks.map(track=>track.id),ids);assert.equal(db.musicAlbum(album.post_id).tracks[0].title,'Edited Track 3');assert.deepEqual(errors,[]);
  await page.goto(config.baseUrl+'/admin/');await page.locator('#create-post').click();await page.locator('#create-type-dialog[open]').waitFor();
  await page.locator('#create-type-dialog a[href="/admin/editor.html"]').click();await page.waitForFunction(()=>!document.querySelector('#post-form').hasAttribute('inert'));
  assert.equal(await page.locator('[name=category]').inputValue(),'game');await page.locator('[name=title]').fill('Game with original form');await page.locator('[name=description]').fill('Old CMS form remains functional.');
  await page.locator('button[value=draft]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Đã lưu bản nháp'));
  assert.ok(db.list().some(item=>item.title==='Game with original form'&&item.category==='game'));assert.deepEqual(errors,[]);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true});}
});

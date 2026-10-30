import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import express from 'express';
import sharp from 'sharp';
import {mkdtemp,mkdir,cp,copyFile,rm,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {createApp} from '../server/app.js';
import {exportStatic} from '../scripts/export-static.mjs';
import {DRIVE_SCOPE} from '../server/drive.js';
const base=(slug,category,extra={})=>validatePost({title:slug,slug,category,description:'Public test fixture',images:[],status:'published',...extra});
function silentWav(){const samples=8000*4,b=Buffer.alloc(44+samples*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples*2,40);return b;}
test('Stage 8 desktop/mobile: Highlight carousel, metadata, native playback, lazy Drive preview and fallback',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-stage8-browser-')),source=path.join(directory,'source'),site=path.join(directory,'site'),filename=path.join(directory,'db.sqlite');
 await mkdir(source);await copyFile('index.html',path.join(source,'index.html'));for(const folder of ['css','js','images'])await cp(folder,path.join(source,folder),{recursive:true});await mkdir(path.join(source,'uploads'));
 const cover='12345678-1234-1234-1234-123456789abc.webp';await sharp({create:{width:1800,height:1000,channels:3,background:'#26443c'}}).webp().toFile(path.join(source,'uploads',cover));
 const db=openDatabase(filename),game=db.create(base('spotlight-game','game',{cover_url:'uploads/'+cover,metadata:{version:'2.1',platform:'Windows / Linux',system_requirements:'8 GiB RAM'}}));
 db.saveHighlightConfig({enabled:true,interval_seconds:6,slides:[{post_id:game.id,enabled:true}]});
 const direct={kind:'direct',label:'Direct WebM',mime_type:'video/webm',url:'https://media.example.test/video.webm',sharing_confirmed:true},preview={kind:'drive_preview',label:'Drive video',url:'https://drive.google.com/file/d/video_123/preview?resourcekey=keep-key',sharing_confirmed:true};
 const film=db.create(base('sample-film','film',{cover_url:'uploads/'+cover,metadata:{release_year:'2026',quality:'1080p',duration:'30 giây'},media_sources:[direct,{...direct,label:'Alternate',url:'https://media.example.test/alternate.webm'},preview]}));
 const driveFile={file_id:'video_123',name:'Example video.webm',mime_type:'video/webm',size:'1024',modified_time:'2026-10-31T00:00:00Z',web_url:'https://drive.google.com/file/d/video_123/view?resourcekey=keep-key',sharing_access:'anyone',resource_key:'keep-key',can_download:1,download_url:'https://drive.google.com/uc?export=download&id=video_123&resourcekey=keep-key'};db.linkFile(film.id,driveFile);db.confirmFile(film.id,driveFile.file_id,driveFile,'admin@example.test');
 const music=db.create(base('sample-music','music',{metadata:{artist:'IVAN Test Artist',album:'Local fixtures'},media_sources:[{kind:'direct',label:'Silent WAV',mime_type:'audio/wav',url:'https://media.example.test/audio.wav',sharing_confirmed:true}]}));
 db.create(base('legacy-post','other'));db.create(base('unsupported-film','film',{media_sources:[{...direct,url:'https://media.example.test/bad.webm'}],attachment_url:'https://media.example.test/file.zip'}));
 const draft=db.create(base('private-draft','film',{status:'draft'}));let pending;
 const config={baseUrl:'http://127.0.0.1',redirectUri:'',adminEmail:'admin@example.test',clientId:'test',clientSecret:'test',sessionSecret:'s'.repeat(48)};
 const oauth={generateAuthUrl(p){pending=p;return config.baseUrl+`/auth/google/callback?state=${p.state}&code=test`;},async getToken(){return{tokens:{id_token:'test',access_token:'private-token',scope:DRIVE_SCOPE,expiry_date:Date.now()+3600000}};},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const app=express();app.use('/IVAN-Base-Drive',express.static(site));app.use(createApp({config,db,oauthClient:oauth,uploadDir:path.join(source,'uploads'),publisher:{status:async()=>({busy:false})}}));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));config.baseUrl=`http://127.0.0.1:${server.address().port}`;config.redirectUri=config.baseUrl+'/auth/google/callback';let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});await mkdir('test-artifacts',{recursive:true});
  const fixturePage=await browser.newPage();const webm=Buffer.from(await fixturePage.evaluate(async()=>{
   const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const context=canvas.getContext('2d'),stream=canvas.captureStream(10),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
   const done=new Promise(resolve=>recorder.onstop=resolve);recorder.ondataavailable=event=>chunks.push(event.data);recorder.start();
   for(let i=0;i<6;i++){context.fillStyle=i%2?'#26443c':'#c8f477';context.fillRect(0,0,64,64);await new Promise(resolve=>setTimeout(resolve,80));}recorder.stop();await done;stream.getTracks().forEach(track=>track.stop());return Array.from(new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer()));
  }));await fixturePage.close();const audio=silentWav();
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   await exportStatic({databasePath:filename,sourceDir:source,outputDir:site});
   const context=await browser.newContext({viewport,isMobile:viewport.width<600,hasTouch:viewport.width<600}),page=await context.newPage(),errors=[],requests=[];page.on('pageerror',error=>errors.push(error.message));
   await context.route('https://media.example.test/**',route=>{
    const url=route.request().url();requests.push(url);if(url.includes('bad.webm'))return route.fulfill({status:404,body:'Missing'});
    const bytes=url.endsWith('.wav')?audio:webm,type=url.endsWith('.wav')?'audio/wav':'video/webm',range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    if(range){const start=Number(range[1]),end=Math.min(bytes.length-1,range[2]?Number(range[2]):bytes.length-1);return route.fulfill({status:206,contentType:type,body:bytes.subarray(start,end+1),headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`}});}
    return route.fulfill({contentType:type,body:bytes,headers:{'accept-ranges':'bytes'}});
   });
   let previews=0;await context.route('https://drive.google.com/**',route=>{previews++;return route.fulfill({contentType:'text/html',body:'<p>Mock official Drive preview; no native streaming claim.</p>'});});
   const url=config.baseUrl+'/IVAN-Base-Drive/';await page.goto(url);await page.locator('#spotlight-title-0').waitFor();assert.equal(await page.locator('#spotlight-title-0').textContent(),game.title);assert.equal(await page.locator('.hero').isVisible(),false);assert.equal(await page.locator('#post-grid a[href="#post/spotlight-game"]').count(),1);
   await page.waitForFunction(()=>document.querySelector('.spotlight-cover').complete);const image=await page.locator('.spotlight-cover').evaluate(node=>({src:node.currentSrc,width:node.naturalWidth,loading:node.loading}));assert.match(image.src,/spotlight-.*-(640|960|1440)\.webp/);if(viewport.width<600)assert.ok(image.width<=960);assert.notEqual(image.loading,'lazy');assert.equal(requests.length,0);assert.equal(previews,0);
   await page.screenshot({path:`test-artifacts/stage8-spotlight-${viewport.width}.png`});
   await page.locator('#search-input').fill('legacy-post');assert.equal(await page.locator('#spotlight').isVisible(),true);assert.equal(await page.locator('#post-grid .post-card').count(),1);await page.locator('#search-input').fill('');
   await page.goto(url+'#post/sample-film');await page.locator('.media-widget').waitFor();assert.equal(await page.locator('video,audio,.media-stage iframe').count(),0);assert.equal(requests.length,0);assert.equal(previews,0);assert.ok((await page.locator('.file-facts').allTextContents()).join(' ').includes('1080p'));
   const stageHeight=await page.locator('[data-media-stage]').evaluate(node=>node.getBoundingClientRect().height);await page.locator('[data-media-launch]').click();await page.waitForFunction(()=>{const v=document.querySelector('video');return v&&v.readyState>=2&&v.videoWidth===64&&v.currentTime>0;});assert.ok(requests.some(url=>url.includes('video.webm')));assert.equal(await page.locator('video').getAttribute('preload'),'none');assert.equal(await page.locator('video').getAttribute('autoplay'),null);
   await page.locator('video').evaluate(video=>{video.pause();video.volume=.5;window.previousPlayer=video;});assert.equal(await page.locator('video').evaluate(video=>video.paused&&video.volume===.5),true);
   await page.screenshot({path:`test-artifacts/stage8-player-${viewport.width}.png`,fullPage:true});
   await page.locator('.media-widget select').selectOption('2');assert.equal(await page.locator('video,.media-stage iframe').count(),0);assert.equal(previews,0);assert.equal(await page.evaluate(()=>window.previousPlayer.getAttribute('src')),null);
   await page.locator('[data-media-launch]').click();await page.locator('.media-stage iframe').waitFor();assert.match(await page.locator('.media-stage iframe').getAttribute('src'),/resourcekey=keep-key/);await page.waitForFunction(()=>document.querySelector('iframe')!==null);assert.equal(Math.round(await page.locator('[data-media-stage]').evaluate(node=>node.getBoundingClientRect().height)),Math.round(stageHeight));
   await page.locator('.back-link').click();assert.equal(await page.locator('video,audio,.media-stage iframe').count(),0);
   const beforeAudio=requests.filter(url=>url.endsWith('.wav')).length;await page.goto(url+'#post/sample-music');await page.locator('.media-widget').waitFor();assert.equal(requests.filter(url=>url.endsWith('.wav')).length,beforeAudio);assert.equal(await page.locator('audio').count(),0);assert.match(await page.locator('.media-album').textContent(),/IVAN Test Artist/);
   await page.locator('[data-media-launch]').click();await page.waitForFunction(()=>{const a=document.querySelector('audio');return a&&a.currentTime>0&&a.readyState>=2;});assert.equal(await page.locator('audio').evaluate(audio=>audio.duration),4);await page.locator('audio').evaluate(audio=>{audio.pause();audio.currentTime=2;audio.volume=.25;});assert.equal(await page.locator('audio').evaluate(audio=>audio.paused&&audio.volume===.25&&audio.currentTime===2),true);
   await page.goto(url+'#post/unsupported-film');await page.locator('[data-media-launch]').click();await page.waitForFunction(()=>document.querySelector('[data-media-status]').textContent.includes('chưa phát được'));assert.equal(await page.locator('video').count(),0);assert.ok(await page.locator('a[href="https://media.example.test/file.zip"]').count()>0);
   await page.goto(config.baseUrl+'/auth/google');await page.locator('#post-table').waitFor();await page.goto(config.baseUrl+'/admin/editor.html?edit='+game.id);await page.waitForFunction(()=>!document.querySelector('#post-form').hasAttribute('inert'));assert.equal(await page.locator('[name=is_spotlight]').count(),0);
   await page.locator('summary').filter({hasText:'Thông tin nội dung / file'}).click();await page.locator('[data-metadata-key=version]').fill('2.2');await page.locator('button[value=published]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Đã lưu bài xuất bản'));assert.equal(db.get(game.id).metadata.version,'2.2');assert.equal(db.get(game.id).is_pinned,0);assert.equal(db.highlightConfig().slides[0].post_id,game.id);
   await page.goto(config.baseUrl+'/admin/editor.html?edit='+music.id);await page.waitForFunction(()=>!document.querySelector('#post-form').hasAttribute('inert'));await page.locator('button[value=published]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Đã lưu bài xuất bản'));assert.equal(db.get(music.id).media_sources[0].mime_type,'audio/wav');
   db.saveHighlightConfig({enabled:true,interval_seconds:6,slides:[]});await assert.rejects(async()=>db.saveHighlightConfig({enabled:true,interval_seconds:6,slides:[{post_id:draft.id,enabled:true}]}));await exportStatic({databasePath:filename,sourceDir:source,outputDir:site});await page.goto(url);await page.locator('#post-grid .post-card').first().waitFor();assert.equal(await page.locator('#spotlight').isVisible(),false);assert.equal(await page.locator('.hero').isVisible(),true);db.softDelete(draft.id);
   await page.emulateMedia({reducedMotion:'reduce'});db.saveHighlightConfig({enabled:true,interval_seconds:6,slides:[{post_id:game.id,enabled:true}]});await exportStatic({databasePath:filename,sourceDir:source,outputDir:site});await page.reload();await page.locator('#spotlight-title-0').waitFor();assert.equal(await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').length),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);await context.close();
  }
  const payload=await readFile(path.join(site,'content/posts.json'),'utf8');assert.ok(!payload.includes('private-token'));assert.ok(!payload.includes('admin@example.test'));assert.ok(!payload.includes('private-draft'));assert.ok(!payload.includes('sharing_confirmed'));
  const noJS=await browser.newContext({javaScriptEnabled:false}),page=await noJS.newPage();await page.goto(config.baseUrl+'/IVAN-Base-Drive/');assert.equal(await page.locator('#spotlight').isVisible(),false);assert.equal(await page.locator('.hero').isVisible(),true);await noJS.close();
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
});

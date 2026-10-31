import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import sharp from 'sharp';
import express from 'express';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openDatabase} from '../server/database.js';
import {createApp} from '../server/app.js';
import {validatePost} from '../server/posts.js';
import {exportStatic} from '../scripts/export-static.mjs';

test('seven refinements: filters/history, cards, pin selector, clipboard, Markdown shortcuts and undo',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'ivan-refinements-')),filename=path.join(dir,'db.sqlite'),db=openDatabase(filename),site=path.join(dir,'site');
 const posts=Array.from({length:21},(_,i)=>db.create(validatePost({title:i%2?'Tiêu đề tiếng Việt rất dài '.repeat(5):'Game '+i,slug:'refinement-'+i,description:i%2?'Mô tả dài có dấu '.repeat(20):'Ngắn',category:i===20?'app':'game',images:[],status:'published'})));
 for(let i=0;i<20;i++)db.setPin(posts[i].id,1,i+1);
 let pending;const config={baseUrl:'http://127.0.0.1',redirectUri:'',adminEmail:'admin@example.test',clientId:'test',clientSecret:'test',sessionSecret:'s'.repeat(48)};
 const oauth={generateAuthUrl(p){pending=p;return config.baseUrl+`/auth/google/callback?state=${p.state}&code=test`;},async getToken(){return{tokens:{id_token:'test'}};},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const app=express();app.use('/IVAN-Base-Drive',express.static(site));app.use(createApp({config,db,oauthClient:oauth,uploadDir:path.join(dir,'uploads'),publisher:{status:async()=>({busy:false})}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));config.baseUrl=`http://127.0.0.1:${server.address().port}`;config.redirectUri=config.baseUrl+'/auth/google/callback';let browser;
 try{
  await exportStatic({databasePath:filename,outputDir:site});await mkdir('test-artifacts',{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await context.route('https://docs.google.com/forms/**',r=>r.fulfill({contentType:'text/html',body:'<p>Form fixture</p>'}));
   const url=config.baseUrl+'/IVAN-Base-Drive/';await page.goto(url);await page.waitForSelector('#post-grid .post-card');
   assert.deepEqual(await page.locator('#category-filters button').allTextContents(),['GAME','ỨNG DỤNG','KHÁC','TẤT CẢ']);
   assert.equal(await page.locator('[data-category=game]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('#post-grid .post-card').count(),20);
   await page.locator('[data-category=app]').click();assert.equal(await page.locator('#post-grid .post-card').count(),1);
   await page.goBack();await page.waitForFunction(()=>document.querySelector('[data-category=game]').getAttribute('aria-pressed')==='true');
   await page.goto(url+'?category=app#library');await page.waitForFunction(()=>document.querySelector('[data-category=app]').getAttribute('aria-pressed')==='true');
   await page.locator('[data-category=game]').click();await page.locator('[data-group=music]').click();await page.locator('#content-groups [data-group=library]').click();assert.equal(await page.locator('[data-category=game]').getAttribute('aria-pressed'),'true');
   await page.goto(url+'#library?category=all');await page.waitForFunction(()=>document.querySelectorAll('#post-grid .post-card').length===21);
   assert.equal(await page.locator('[data-category=all]').getAttribute('aria-pressed'),'true');
   const cards=await page.locator('#post-grid .post-card').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect(),cover=n.querySelector('.cover').getBoundingClientRect(),button=n.querySelector('.card-bottom').getBoundingClientRect();return{top:r.top,height:r.height,cover:cover.height,bottom:button.bottom};}));
   for(const card of cards){const row=cards.filter(p=>Math.abs(p.top-card.top)<1);assert.ok(row.every(p=>Math.abs(p.height-card.height)<1&&Math.abs(p.cover-card.cover)<1&&Math.abs(p.bottom-card.bottom)<1));}
   await page.locator('#search-input').fill('Game 0');assert.equal(await page.locator('#post-grid .post-card').count(),1);await page.locator('#search-input').fill('');
   await page.screenshot({path:`test-artifacts/refinements-${width}.png`});
   await page.evaluate(()=>document.documentElement.style.fontSize='150%');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.ambient-particles i').evaluateAll(nodes=>nodes.some(n=>n.getAnimations().length)),false);
   await page.goto(config.baseUrl+'/auth/google');await page.waitForSelector('#post-table');
   await page.goto(config.baseUrl+'/admin/editor.html?edit='+posts[19].id);await page.waitForSelector('#post-form:not([inert])');
   assert.equal(await page.locator('[name=pin_order] option[value="20"]').evaluate(n=>n.disabled),false);assert.equal(await page.locator('[name=pin_order] option[value="6"]').evaluate(n=>n.disabled),true);
   assert.equal(await page.locator('#media-source-rows,#add-media-source').count(),0);
   assert.equal(await page.locator('summary').filter({hasText:'Thông tin nội dung / file (nâng cao)'}).count(),1);assert.equal(await page.locator('summary').filter({hasText:'Liên kết ngoài / media nâng cao'}).count(),1);
   const field=page.locator('#introduction');await field.fill('Tiếng Việt');await field.evaluate(n=>n.setSelectionRange(0,n.value.length));await field.press('Control+b');assert.equal(await field.inputValue(),'**Tiếng Việt**');
   await field.press('Control+z');assert.equal(await field.inputValue(),'Tiếng Việt');await field.press('Control+y');assert.equal(await field.inputValue(),'**Tiếng Việt**');
   await field.evaluate(n=>n.setSelectionRange(2,n.value.length-2));await field.press('Control+b');assert.equal(await field.inputValue(),'Tiếng Việt');
   await field.evaluate(n=>n.setSelectionRange(0,n.value.length));await field.press('Control+i');assert.equal(await field.inputValue(),'*Tiếng Việt*');
   await field.press('Control+i');assert.equal(await field.inputValue(),'Tiếng Việt');
   await field.fill('Liên kết');await field.evaluate(n=>n.setSelectionRange(0,n.value.length));page.once('dialog',d=>d.accept('https://example.test/reference'));await field.press('Control+k');assert.equal(await field.inputValue(),'[Liên kết](https://example.test/reference)');
   await field.evaluate(n=>n.setSelectionRange(3,3));page.once('dialog',d=>d.accept('https://example.test/changed'));await field.press('Control+k');assert.equal(await field.inputValue(),'[Liên kết](https://example.test/changed)');
   await field.fill('Bôi đen chữ');await field.evaluate(n=>n.setSelectionRange(0,7));await page.locator('[data-editor=introduction] [data-md=bold]').click();assert.equal(await field.inputValue(),'**Bôi đen** chữ');
   await field.fill('## Tiêu đề\n**Đậm** và *nghiêng*\n- Một\n- Hai\n[an toàn](https://example.test)\n<script>window.XSS=true</script>\n[x](javascript:alert(1))');
   await page.locator('[data-editor=introduction] [data-md=preview]').click();assert.equal(await page.locator('#introduction-markdown-preview strong').textContent(),'Đậm');assert.equal(await page.locator('#introduction-markdown-preview em').textContent(),'nghiêng');assert.equal(await page.locator('#introduction-markdown-preview script').count(),0);assert.equal(await page.evaluate(()=>window.XSS),undefined);
   await context.grantPermissions(['clipboard-read','clipboard-write']);await page.evaluate(()=>navigator.clipboard.writeText('Văn bản dán bình thường'));await field.fill('');await field.press('Control+v');assert.equal(await field.inputValue(),'Văn bản dán bình thường');
   const png=await sharp({create:{width:32,height:32,channels:3,background:'#446633'}}).png().toBuffer();
   async function paste(zone,files){await zone.evaluate((node,files)=>{const data=new DataTransfer();for(const f of files)data.items.add(new File([new Uint8Array(f.bytes)],f.name,{type:f.type}));node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));},files);}
   const cover=page.locator('#cover-upload').locator('..').locator('+ .image-paste-zone'),gallery=page.locator('#gallery-upload').locator('..').locator('+ .image-paste-zone'),image={bytes:[...png],name:'clipboard.png',type:'image/png'};
   await paste(cover,[image]);await page.waitForFunction(()=>document.querySelector('#cover-preview img'));
   const original=await page.locator('[name=cover_url]').inputValue();assert.match(original,/^uploads\/[a-f0-9-]+\.webp$/);
   page.once('dialog',d=>d.dismiss());await paste(cover,[image]);assert.equal(await page.locator('[name=cover_url]').inputValue(),original);
   await paste(gallery,[image,image]);await page.waitForFunction(()=>document.querySelectorAll('#gallery-preview img').length===2);
   await paste(gallery,[{...image,bytes:[77,90,1,2]}]);await page.waitForFunction(()=>!document.querySelector('#gallery-upload').disabled);assert.equal(await page.locator('#gallery-preview img').count(),2);
   let uploads=0;page.on('request',r=>{if(r.url().endsWith('/api/admin/images'))uploads++;});
   await paste(gallery,[{bytes:[60,115,118,103,62],name:'unsafe.svg',type:'image/svg+xml'}]);assert.equal(uploads,0);
   await gallery.evaluate(node=>{const data=new DataTransfer();data.items.add(new File([new Uint8Array(5*1024*1024+1)],'large.png',{type:'image/png'}));node.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});assert.equal(uploads,0);
   await paste(gallery,Array.from({length:11},()=>image));assert.equal(uploads,0);assert.equal(await page.locator('#gallery-preview img').count(),2);
   await cover.evaluate(n=>{const data=new DataTransfer();data.setData('text/html','<img src="https://example.test/private.png">');n.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});assert.equal(uploads,0);
   await page.locator('#gallery-preview button').first().click();assert.equal(await page.locator('#gallery-preview img').count(),1);
   page.once('dialog',d=>d.accept());await page.goto(config.baseUrl+'/admin/music-editor.html');await page.waitForSelector('#music-form:not([inert])');
   await paste(page.locator('.image-paste-zone'),[image]);await page.waitForSelector('#cover-preview img');assert.match(await page.locator('[name=cover_url]').inputValue(),/\.webp$/);await page.locator('#cover-preview button').click();assert.equal(await page.locator('[name=cover_url]').inputValue(),'');
   assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await context.close();
  }
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();await rm(dir,{recursive:true,force:true});}
});

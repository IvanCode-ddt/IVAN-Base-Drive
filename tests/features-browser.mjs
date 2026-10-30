import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import express from 'express';
import {mkdtemp,rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {exportStatic} from '../scripts/export-static.mjs';
import {DEFAULT_FEEDBACK_FORM_URL} from '../server/public-settings.js';

test('desktop/mobile pinned feed, filters, Google Form dialog and safe feedback inbox',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-features-browser-')),filename=path.join(directory,'db.sqlite'),site=path.join(directory,'site'),db=openDatabase(filename);
 const first=db.create(validatePost({title:'First game',slug:'first-game',category:'game',description:'Game description',images:[],status:'published'}));
 const second=db.create(validatePost({title:'Second film',slug:'second-film',category:'film',description:'Film description',images:[],status:'published'}));
 const config={baseUrl:'http://127.0.0.1',redirectUri:'',adminEmail:'admin@example.test',clientId:'test',clientSecret:'test',sessionSecret:'x'.repeat(48),feedback:{enabled:true,spreadsheetId:'private-sheet-test',sheetName:'Responses',serviceAccountFile:'data/service-account.json'}};let pending,sheetCalls=0;
 const oauth={generateAuthUrl(p){pending=p;return config.baseUrl+`/auth/google/callback?state=${p.state}&code=test`;},async getToken(){return{tokens:{id_token:'test'}};},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const feedbackTransport=async()=>{sheetCalls++;return[['Timestamp','Loại','Tiêu đề','Nội dung chi tiết','Liên kết tham khảo','Email liên hệ'],['2026-10-31','Góp ý','<img src=x onerror="window.feedbackXSS=1">','<script>window.feedbackXSS=1</script>','javascript:alert(1)','private@example.test']];};
 const wrapper=express();wrapper.use('/IVAN-Base-Drive',express.static(site));wrapper.use(createApp({config,db,oauthClient:oauth,feedbackTransport,publisher:{status:async()=>({busy:false})}}));
 const server=wrapper.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));config.baseUrl=`http://127.0.0.1:${server.address().port}`;config.redirectUri=config.baseUrl+'/auth/google/callback';let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   db.setPin(first.id,1,5);db.setPin(second.id,0,0);await exportStatic({databasePath:filename,outputDir:site});
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await context.route('https://docs.google.com/forms/**',route=>route.fulfill({contentType:'text/html',body:'<p>Mock Google Form; no submission</p>'}));
   await page.goto(config.baseUrl+'/IVAN-Base-Drive/');await page.locator('#post-grid .post-card').first().waitFor();
   assert.equal(await page.locator('#post-grid .post-card').count(),2);assert.deepEqual(await page.locator('#post-grid h3').allTextContents(),['First game','Second film']);
   await page.locator('#feedback-open').click();await page.locator('#feedback-frame iframe').waitFor();assert.ok((await page.locator('#feedback-link').getAttribute('href')).startsWith(DEFAULT_FEEDBACK_FORM_URL));await page.locator('#feedback-close').click();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
   await page.goto(config.baseUrl+'/auth/google');await page.locator('#post-table .dashboard-row').first().waitFor();
   const row=page.locator('#post-table .dashboard-row').filter({hasText:'Second film'});await row.locator('[data-pin]').click();await row.getByText('★ Bỏ ghim',{exact:true}).waitFor();
   await row.locator('[data-pin-order]').fill('1');await row.locator('[data-pin-order]').press('Tab');
   await page.waitForFunction(async(id)=>(await(await fetch('/api/admin/posts')).json()).find(post=>post.id===id).pin_order===1,second.id);
   await exportStatic({databasePath:filename,outputDir:site});await page.goto(config.baseUrl+'/IVAN-Base-Drive/');await page.locator('#post-grid .post-card').first().waitFor();
   assert.deepEqual(await page.locator('#post-grid h3').allTextContents(),['Second film','First game']);assert.equal(await page.locator('#post-grid .post-card').count(),2);
   await page.locator('#search-input').fill('First');assert.equal(await page.locator('#post-grid .post-card').count(),1);assert.equal(await page.locator('#post-grid h3').textContent(),'First game');await page.locator('#search-input').fill('');await page.locator('[data-category="film"]').click();assert.equal(await page.locator('#post-grid .post-card').count(),1);
   await page.locator('#post-grid .post-card').click();await page.locator('#detail-view h1').waitFor();assert.match(await page.locator('#detail-view h1').textContent(),/Second film/);
   await page.goto(config.baseUrl+'/admin/editor.html?edit='+second.id);await page.waitForFunction(()=>!document.querySelector('#post-form').hasAttribute('inert'));
   assert.equal(await page.locator('[name=is_pinned]').isChecked(),true);await page.locator('[name=is_pinned]').uncheck();await page.locator('button[value=published]').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('Đã lưu bài xuất bản'));assert.equal(db.get(second.id).is_pinned,0);
   await page.goto(config.baseUrl+'/admin/feedback.html');await page.waitForFunction(()=>!document.querySelector('#feedback-sync').disabled);await page.locator('#feedback-sync').click();await page.locator('.feedback-item').waitFor();
   assert.equal(await page.locator('.feedback-item img').count(),0);assert.equal(await page.evaluate(()=>window.feedbackXSS),undefined);
   await page.locator('.feedback-item select').selectOption('processing');await page.waitForFunction(()=>document.querySelector('#feedback-message').textContent.includes('Đã lưu trạng thái'));
   await page.locator('#feedback-sync').click();await page.waitForFunction(()=>!document.querySelector('#feedback-sync').disabled);assert.equal(await page.locator('.feedback-item select').inputValue(),'processing');
   const calls=sheetCalls;await context.route('**/api/admin/feedback/status',route=>route.fulfill({json:{state:'not_configured',busy:false,missing:['service account'],message:'Chưa kết nối',lastSync:null}}));await page.reload();await page.locator('#feedback-state').filter({hasText:'Chưa kết nối'}).waitFor();assert.equal(await page.locator('#feedback-sync').isDisabled(),true);assert.equal(sheetCalls,calls);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);assert.deepEqual(errors,[]);await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true});}
});

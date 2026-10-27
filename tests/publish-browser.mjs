import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {exportStatic} from '../scripts/export-static.mjs';

test('publish card desktop/mobile requires preview, checkbox and final confirmation; no real Git commands',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'ivan-publish-browser-')),filename=path.join(directory,'db.sqlite'),db=openDatabase(filename);
 db.create(validatePost({title:'Xuất bản thử nghiệm',slug:'publish-preview',category:'app',description:'Bản xem trước',images:[],status:'published'}));
 const site=path.join(directory,'site');await exportStatic({databasePath:filename,sourceDir:process.cwd(),outputDir:site});
 let pending,owner,simulatedPushes=0,state={status:'idle',progress:0,message:'Chưa xuất bản',busy:false};
 const id='12345678-1234-1234-1234-123456789abc',commit='c'.repeat(40);
 const publisher={async status(){return state;},async prepare(session){owner=session;state={...state,status:'awaiting_confirmation',progress:60,message:'Chưa commit/push'};return{id,needsConfirmation:true,changes:[{path:'docs/content/posts.json',status:'modified'}],posts:[{title:'Xuất bản thử nghiệm',slug:'publish-preview',fileCount:0}],sourceChangeCount:2,siteUrl:`/api/admin/publish/previews/${id}/site/`};},previewDirectory(previewId,session){assert.equal(previewId,id);assert.equal(session,owner);return site;},async publish(){simulatedPushes++;state={status:'running',busy:true,progress:90,message:'Đang mô phỏng push'};await new Promise(resolve=>setTimeout(resolve,1200));state={status:'success',busy:false,progress:100,commit,message:'Đã push thành công (giả lập)',lastPublished:{commit,at:new Date().toISOString()}};}};
 const config={baseUrl:'http://127.0.0.1',redirectUri:'',adminEmail:'admin@example.com',clientId:'test',clientSecret:'test',sessionSecret:randomBytes(40).toString('hex'),secure:false};
 const oauth={generateAuthUrl(params){pending=params;return`${config.baseUrl}/auth/google/callback?state=${params.state}&code=test`;},async getToken(){return{tokens:{id_token:'test'}}},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})}}};
 const server=createApp({config,db,oauthClient:oauth,publisher}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));config.baseUrl=`http://127.0.0.1:${server.address().port}`;config.redirectUri=config.baseUrl+'/auth/google/callback';
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});await mkdir('test-artifacts',{recursive:true});
  for(const[name,viewport]of[['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]){
   const context=await browser.newContext({viewport}),page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(config.baseUrl+'/auth/google');await page.waitForSelector('#publish-start');
   const before=simulatedPushes;await page.locator('#publish-start').click();await page.waitForSelector('#publish-review[open]');
   assert.equal(await page.locator('#publish-confirm').isDisabled(),true);assert.ok((await page.locator('#publish-change-list').textContent()).includes('docs/content/posts.json'));
   await page.frameLocator('#publish-frame').getByRole('heading',{name:'Xuất bản thử nghiệm',exact:true}).waitFor();
   assert.equal(simulatedPushes,before);await page.locator('#publish-cancel').click();assert.equal(simulatedPushes,before);
   await page.locator('#publish-start').click();await page.waitForSelector('#publish-review[open]');await page.locator('#publish-consent').check();
   await page.screenshot({path:`test-artifacts/publish-review-${name}.png`});
   await page.locator('#publish-confirm').click();await page.waitForFunction(()=>document.querySelector('#publish-start').disabled);
   await page.waitForFunction(()=>document.querySelector('#publish-step').textContent.includes('Đã push thành công'));
   assert.equal(simulatedPushes,before+1);assert.equal(await page.locator('#publish-commit').getAttribute('href'),`https://github.com/IvanCode-ddt/IVAN-Base-Drive/commit/${commit}`);assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();await rm(directory,{recursive:true,force:true});}
});

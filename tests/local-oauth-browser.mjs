import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {chromium} from 'playwright';
import {createApp} from '../server/app.js';
import {openDatabase} from '../server/database.js';
import {DRIVE_SCOPE,FOLDER} from '../server/drive.js';

test('Admin aliases require Google login, complete cross-site OAuth and reconnect Drive without LOCAL_ONLY',async()=>{
 const db=openDatabase(':memory:');let pending;
 const config={localAdminMode:true,baseUrl:'http://localhost',adminEmail:'admin@example.com',clientId:'test',clientSecret:'test-secret',sessionSecret:'s'.repeat(48),driveRootId:'test-root',secure:false};
 const oauth={generateAuthUrl(params){pending=params;return 'https://accounts.google.com/ivan-test';},async getToken(params){assert.equal(params.redirect_uri,config.redirectUri);assert.ok(params.codeVerifier);return{tokens:{id_token:'test-id',access_token:'server-only',scope:DRIVE_SCOPE,expiry_date:Date.now()+3600000}};},async verifyIdToken(){return{getPayload:()=>({sub:'test',email:config.adminEmail,email_verified:true,nonce:pending.nonce})};}};
 const driveRequest=async(tokens,resource)=>{
  assert.equal(tokens.access_token,'server-only');
  if(resource==='files/test-root')return{id:'test-root',name:'Test Drive',mimeType:FOLDER};
  assert.equal(resource,'files');return{files:[{id:'test-file',name:'Test archive.zip',mimeType:'application/zip',parents:['test-root']}]};
 };
 const app=createApp({config,db,oauthClient:oauth,driveRequest,publisher:{status:async()=>({busy:false})}}),trace=[];
 const server=http.createServer((req,res)=>{
  res.on('finish',()=>{if(req.url.startsWith('/auth/')||req.url==='/admin')trace.push({path:req.url.split('?')[0],site:req.headers['sec-fetch-site'],origin:req.headers.origin,status:res.statusCode});});
  app(req,res);
 });
 server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const port=server.address().port;config.baseUrl=`http://localhost:${port}`;config.redirectUri=config.baseUrl+'/auth/google/callback';
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  for(const host of ['localhost','127.0.0.1']){
   const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(10000);
   await context.route('https://accounts.google.com/**',route=>route.fulfill({contentType:'text/html',body:`<a id="return" href="${config.redirectUri}?state=${pending.state}&code=test">Continue</a>`}));
   await page.goto(`http://${host}:${port}/admin`);await page.locator('a[href="/auth/google"]').waitFor();
   assert.equal(new URL(page.url()).hostname,'localhost');
   assert.equal(new URL(page.url()).pathname,'/login');
   assert.equal(await page.evaluate(async()=>(await fetch('/api/admin/posts')).status),401);
   await page.locator('a[href="/auth/google"]').click();await page.locator('#return').click();
   await page.locator('#dashboard-email').waitFor();
   await page.goto(config.baseUrl+'/admin/drive-library.html');await page.waitForLoadState('networkidle');
   await page.locator('a[href="/auth/google"]').click();
   await page.locator('#return').click();await page.waitForURL(config.baseUrl+'/admin**');
   assert.ok(!(await page.locator('body').innerText()).includes('LOCAL_ONLY'),JSON.stringify(trace));
   await page.locator('#dashboard-email').waitFor();
   const state=await page.evaluate(async()=>({session:await(await fetch('/api/admin/session')).json(),files:await(await fetch('/api/admin/drive/files')).json()}));
   assert.equal(state.session.authMode,'google');assert.equal(state.session.driveConnected,true);
   assert.equal(state.files.files[0].name,'Test archive.zip');
   await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));db.close();}
});

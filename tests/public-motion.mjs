import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {chromium} from 'playwright';
import {readFile,writeFile,mkdir,mkdtemp,copyFile,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import os from 'node:os';
const baseline=process.env.IVAN_MOTION_BASELINE==='1';
const artifacts=path.resolve('test-artifacts');
const files=['index.html','css/style.css',...['main','data','content','post-source','media','markdown'].map(name=>`js/${name}.js`)];
const posts=Array.from({length:24},(_,i)=>({id:'item-'+i,slug:'item-'+i,title:`Library item ${String(i).padStart(2,'0')}`,category:['film','game','music','app','other'][i%5],description:'A public motion test fixture.',introduction:'## Introduction\nContent stays immediately available.',instructions:'Download from the attached file.',images:[],cover_url:'',status:'published',is_pinned:i<2,pin_order:1-i,drive_files:[{file_id:'fixture-file',name:'Fixture archive',mime_type:'application/zip',size:'16',can_download:1,download_url:'https://drive.google.com/uc?export=download&id=fixture-file',web_url:'https://drive.google.com/file/d/fixture-file/view'}]}));
async function protectedHashes(){
 const result={};
 async function add(file){try{const bytes=await readFile(file);result[file]=createHash('sha256').update(bytes).digest('hex');}catch(error){if(error.code!=='ENOENT')throw error;}}
 for(const dir of ['admin','server','scripts'])for(const file of await readdir(dir,{recursive:true,withFileTypes:true}))if(file.isFile())await add(path.join(file.parentPath,file.name));
 for(const file of ['.env','data/ivan.sqlite','IVAN-Admin.cmd','Update-IVAN-Code.cmd','package.json','package-lock.json'])await add(file);
 return result;
}
async function metrics(session){const raw=await session.send('Performance.getMetrics');return Object.fromEntries(raw.metrics.map(m=>[m.name,m.value]));}
function delta(a,b){return Object.fromEntries(['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].map(key=>[key,Math.round((b[key]-a[key])*1e6)/1e6]));}
async function exercise(page,context){
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
 assert.equal(await page.locator('#featured-grid .post-card').count(),2);assert.equal(await page.locator('#post-grid .post-card').count(),22);
 await page.locator('#search-input').fill('Library item 01');assert.equal(await page.locator('#featured-grid .post-card').count(),1);assert.equal(await page.locator('#post-grid .post-card').count(),0);
 await page.locator('#search-input').fill('');
 for(const category of ['film','game','music','app','other']){await page.locator(`[data-category=${category}]`).click();assert.equal(await page.locator(`[data-category=${category}]`).getAttribute('aria-pressed'),'true');assert.ok(await page.locator('.post-card:visible').count()>0);}
 await page.locator('[data-category=game]').click();await page.locator('#featured-grid .post-card').click();await page.locator('#detail-view h1').waitFor();
 const link=page.locator('.download-panel a').filter({hasText:'Tải xuống'}).first();assert.equal(await link.getAttribute('href'),posts[1].drive_files[0].download_url);
 await context.route('https://drive.google.com/**',route=>route.fulfill({status:200,body:'fixture archive',headers:{'content-type':'application/octet-stream','content-disposition':'attachment; filename="fixture.zip"'}}));
 const [download]=await Promise.all([page.waitForEvent('download'),link.click()]);assert.equal(download.suggestedFilename(),'fixture.zip');await download.delete();
 await page.locator('.back-link').click();await page.locator('#collection-title').waitFor();
 await context.route('https://docs.google.com/forms/**',route=>route.fulfill({contentType:'text/html',body:'<p>Mock form, no submission.</p>'}));
 await page.locator('#feedback-open').click();await page.locator('#feedback-dialog').waitFor();await page.locator('#feedback-frame iframe').waitFor();
 assert.equal(await page.evaluate(()=>document.activeElement.closest('#feedback-dialog')!==null),true);
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('#feedback-dialog').open);
 assert.equal(await page.locator('#feedback-open').evaluate(node=>node===document.activeElement),true);
 await page.locator('#feedback-open').click();await page.locator('#feedback-close').click();
 await page.waitForFunction(()=>!document.querySelector('#feedback-dialog').open);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
}
test(baseline?'capture public motion baseline':'public motion behavior, accessibility, isolation and measured comparison',async()=>{
 await mkdir(artifacts,{recursive:true});
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-motion-')),site=path.join(directory,'site');
 for(const file of files){await mkdir(path.dirname(path.join(site,file)),{recursive:true});await copyFile(file,path.join(site,file));}
 const html=(await readFile(path.join(site,'index.html'),'utf8')).replace('data-feedback-form-url=""','data-feedback-form-url="https://docs.google.com/forms/d/e/fixture/viewform"');await writeFile(path.join(site,'index.html'),html);
 await mkdir(path.join(site,'content'));await writeFile(path.join(site,'content/posts.json'),JSON.stringify({schemaVersion:1,posts}));
 await writeFile(path.join(site,'admin-scope.html'),'<link rel="stylesheet" href="css/style.css"><button class="primary-button">Admin probe</button><a class="post-card">Admin card</a>');
 const app=express();app.use('/IVAN-Base-Drive',express.static(site));const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));const url=`http://127.0.0.1:${server.address().port}/IVAN-Base-Drive/`;
 const result={mode:baseline?'before':'after',fixturePosts:posts.length,browser:'Microsoft Edge headless',samples:[],sizes:{},protectedHashes:await protectedHashes()};
 for(const file of ['css/style.css','js/main.js']){const bytes=await readFile(file);result.sizes[file]={bytes:bytes.length,gzip:gzipSync(bytes).length};}
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});result.browserVersion=browser.version();
  for(const [device,viewport,repeats]of[['desktop',{width:1440,height:1000},3],['mobile',{width:390,height:844},3]]){
   for(let run=0;run<repeats;run++){
    const context=await browser.newContext({viewport,isMobile:device==='mobile',hasTouch:device==='mobile'}),page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
    await page.addInitScript(()=>{window.motionMetrics={cls:0,longTasks:0};new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.motionMetrics.cls+=entry.value;}).observe({type:'layout-shift',buffered:true});new PerformanceObserver(list=>window.motionMetrics.longTasks+=list.getEntries().length).observe({type:'longtask',buffered:true});});
    const session=await context.newCDPSession(page);await session.send('Performance.enable');
    await page.goto(url);await page.locator('#post-grid .post-card').first().waitFor();
    const initial=await page.evaluate(()=>({fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime||null,atCards:performance.now(),reduced:matchMedia('(prefers-reduced-motion: reduce)').matches}));
    await page.addStyleTag({content:'html{scroll-behavior:auto!important}'});
    await page.waitForTimeout(400);const start=await metrics(session);await page.waitForTimeout(1400);const idle=await metrics(session);
    for(let step=0;step<12;step++){await page.evaluate(step=>scrollTo({top:step*260,behavior:'instant'}),step);await page.waitForTimeout(35);}
    await page.waitForTimeout(350);const scrolled=await metrics(session);
    const observed=await page.evaluate(()=>({...window.motionMetrics,ambient:document.body.classList.contains('ambient-motion'),activeAnimations:document.getAnimations().filter(animation=>animation.playState==='running').length,overflow:document.documentElement.scrollWidth>innerWidth+1}));
    result.samples.push({device,run,initial,idle:delta(start,idle),scroll:delta(idle,scrolled),...observed,initialRequests:requests.length});assert.equal(observed.overflow,false);
    if(run===0){
     await exercise(page,context);
     if(!baseline){
      if(device==='mobile')assert.equal(await page.evaluate(()=>document.body.classList.contains('ambient-motion')),false);
      const card=page.locator('.post-card:visible').first();await card.hover();await page.waitForTimeout(300);
      if(device==='mobile')assert.equal(await card.evaluate(node=>getComputedStyle(node).transform),'none','touch must not inherit the shared hover lift');
      await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(100);await page.locator('[data-category=all]').click();
      assert.equal(await page.evaluate(()=>document.getAnimations().filter(animation=>animation.playState==='running').length),0);
      await page.locator('#feedback-open').click();assert.equal(await page.locator('#feedback-dialog').evaluate(node=>getComputedStyle(node).transitionDuration),'0s');await page.keyboard.press('Escape');
      await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForTimeout(100);
      await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
      assert.equal(await page.evaluate(()=>document.body.classList.contains('motion-paused')),true);
      await page.goto(url);await page.locator('#post-grid .post-card').first().waitFor();
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:path.join(artifacts,`motion-${device}.png`),fullPage:false});
     }
    }
    assert.deepEqual(errors,[]);await context.close();
   }
  }
  const context=await browser.newContext(),page=await context.newPage();await page.goto(url+'admin-scope.html');result.adminProbe=await page.locator('.primary-button').evaluate(node=>{const style=getComputedStyle(node);return{transition:style.transition,transform:style.transform,background:style.backgroundColor,padding:style.padding,animation:style.animation};});await context.close();
  if(!baseline){
   const weak=await browser.newContext({viewport:{width:1440,height:1000}});await weak.addInitScript(()=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>2});Object.defineProperty(navigator,'deviceMemory',{get:()=>2});});const p=await weak.newPage();await p.goto(url);await p.locator('#post-grid .post-card').first().waitFor();assert.equal(await p.evaluate(()=>document.body.classList.contains('ambient-motion')),false);await weak.close();
   const noJS=await browser.newContext({javaScriptEnabled:false}),p2=await noJS.newPage();await p2.goto(url);assert.equal(await p2.locator('.hero h1').isVisible(),true);assert.equal(await p2.locator('.hero').evaluate(node=>getComputedStyle(node).opacity),'1');await noJS.close();
   const before=await readFile(path.join(artifacts,'motion-before.json'),'utf8').then(JSON.parse,error=>{if(error.code==='ENOENT')return null;throw error;});
   if(before){
    assert.deepEqual(result.adminProbe,before.adminProbe,'shared CSS must not change Admin probe');assert.deepEqual(result.protectedHashes,before.protectedHashes,'Admin/backend/data/launchers must remain byte-identical');
    assert.deepEqual(result.samples.map(sample=>sample.initialRequests),before.samples.map(sample=>sample.initialRequests),'animation must not add network requests');
   }else{
    assert.equal(result.adminProbe.transform,'none');assert.match(result.adminProbe.transition,/0s/);
   }
  }
  await writeFile(path.join(artifacts,baseline?'motion-before.json':'motion-after.json'),JSON.stringify(result,null,2));
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
});

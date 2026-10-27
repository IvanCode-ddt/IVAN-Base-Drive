import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('Drive UI opens library, renders private links, attaches, creates draft and confirms only after checkbox', async () => {
  const nodes = new Map();
  function element(key) {
    if (!nodes.has(key)) nodes.set(key, { innerHTML:'', textContent:'', value:'', hidden:key==='#drive-panel', disabled:false, dataset:{}, events:{}, addEventListener(type, fn){this.events[type]=fn;},setAttribute(){}, });
    return nodes.get(key);
  }
  const previousDocument=globalThis.document;
  globalThis.document={querySelector:element};
  try {
    const moduleSource=readFileSync(new URL('../admin/drive.js',import.meta.url),'utf8').replace("'/js/content.js?v=9'",JSON.stringify(new URL('../js/content.js',import.meta.url).href)).replace("'/js/data.js?v=9'",JSON.stringify(new URL('../js/data.js',import.meta.url).href));
    const {initDrive}=await import('data:text/javascript;base64,'+Buffer.from(moduleSource).toString('base64'));
    const calls=[];let draftOpened=false,refreshes=0;
    const file={file_id:'file_123',name:'Private <img onerror=alert(1)>',mime_type:'application/zip',size:'1024',modified_time:'2026-10-27T00:00:00Z',sharing_confirmed:0};
    const api=async(url,options={})=>{
      calls.push({url,...options});
      if(url==='/api/admin/posts')return[{id:'post_123',title:'Post',status:'draft'}];
      if(url==='/api/admin/drive/status')return{connected:true,rootId:'root_123',expiresAt:Date.now()+100000};
      if(url.startsWith('/api/admin/drive/files?'))return{folderId:'root_123',breadcrumb:[{id:'root_123',name:'Root'}],files:[file],nextPageToken:null,syncedAt:'2026-10-27T00:00:00Z'};
      if(url==='/api/admin/posts/post_123/drive-files')return[file];
      if(url==='/api/admin/drive/drafts')return{id:'new_draft',title:'New',status:'draft'};
      return[];
    };
    const ui=await initDrive({api,openDraft:()=>draftOpened=true,refreshPosts:async()=>refreshes++,beforeDraft:()=>true});
    await element('#drive-toggle').events.click();
    assert.equal(element('#drive-panel').hidden,false);assert.ok(element('#drive-files').innerHTML.includes('&lt;img'));assert.ok(!element('#drive-files').innerHTML.includes('<img onerror'));
    await ui.showPost({id:'post_123'});assert.ok(element('#linked-drive-files').innerHTML.includes('data-confirm disabled'));assert.ok(element('#linked-drive-files').innerHTML.includes('sharing-check'));
    element('#drive-target').value='post_123';
    const attach={dataset:{attach:'file_123'},disabled:false};await element('#drive-panel').events.click({target:{closest:()=>attach}});
    assert.ok(calls.some(c=>c.method==='POST'&&c.url==='/api/admin/posts/post_123/drive-files'));
    const draft={dataset:{draft:'file_123'},disabled:false};await element('#drive-panel').events.click({target:{closest:()=>draft}});assert.equal(draftOpened,true);assert.equal(refreshes,1);
    const checkbox={checked:false};const row={dataset:{file:'file_123'},querySelector:()=>checkbox};
    const confirmButton={disabled:true,closest:()=>row,hasAttribute:key=>key==='data-confirm'};
    const initialWrites=calls.filter(c=>c.method==='PUT').length;
    await element('#linked-drive-files').events.click({target:{closest:()=>confirmButton}});assert.equal(calls.filter(c=>c.method==='PUT').length,initialWrites);
    checkbox.checked=true;await element('#linked-drive-files').events.click({target:{closest:()=>confirmButton}});
    const confirmed=calls.find(c=>c.method==='PUT');assert.equal(JSON.parse(confirmed.body).sharingConfirmed,true);
    const html=readFileSync(new URL('../admin/drive-library.html',import.meta.url),'utf8');
    for(const id of nodes.keys())assert.ok(html.includes(`id="${id.slice(1)}"`),`missing ${id}`);
    const adminSource=readFileSync(new URL('../admin/admin.js',import.meta.url),'utf8');assert.ok(adminSource.includes('driveUI.fill(post)'));
  } finally { globalThis.document=previousDocument; }
});

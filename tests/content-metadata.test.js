import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {smartMetadataHTML} from '../js/content.js';
import {formatBytes} from '../js/media.js';
import {publicPost} from '../server/public-post.js';
const base={title:'Old title',slug:'old-title',category:'app',description:'Description',images:[],status:'published'};
test('optional metadata validation, persistence, legacy updates and category allowlist',t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());const saved=db.create(validatePost({...base,metadata:{version:'2.0',platform:'Windows 11',artist:'Private irrelevant field'}}));
 assert.equal(db.get(saved.id).metadata.version,'2.0');db.update(saved.id,validatePost(base));assert.equal(db.get(saved.id).metadata.version,'2.0');
 const visible=db.publicPost(db.get(saved.id));assert.equal(visible.metadata.version,'2.0');assert.equal(visible.metadata.artist,undefined);
 for(const metadata of [{admin_email:'private'},[],{version:123},{release_year:'hello'},{content_updated_at:'2026-02-31'},{system_requirements:'x'.repeat(3001)}])assert.throws(()=>validatePost({...base,metadata}));
 assert.deepEqual(publicPost({...saved,metadata:undefined}).metadata,{});
});
test('facts use only supplied metadata and approved file facts, no filename speculation or unknown placeholders',()=>{
 const html=smartMetadataHTML({...base,metadata:{version:'<img src=x onerror=alert(1)>',platform:'Linux'}},[{name:'Windows_2026_4K_v99.exe',mime_type:'application/zip',size:'1048576',modified_time:'2026-10-31T00:00:00Z'}]);
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('1 MiB'));assert.ok(html.includes('Linux'));assert.ok(!html.includes('v99'));assert.ok(!html.includes('4K'));
 assert.equal(smartMetadataHTML(base,[]),'');assert.equal(formatBytes(null),'');assert.equal(formatBytes('bad'),'');assert.equal(formatBytes('0'),'0 B');
});

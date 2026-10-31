import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {detailHTML,smartMetadataHTML,albumDetailHTML} from '../js/content.js';
import {renderMarkdown} from '../js/markdown.js';
import {formatBytes} from '../js/media.js';
import {publicPost} from '../server/public-post.js';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {exportStatic} from '../scripts/export-static.mjs';
const base={title:'Old title',slug:'old-title',category:'app',description:'Description',images:[],status:'published'};
test('detail view keeps every public file download in the sidebar and orders the gallery after instructions',()=>{
 const html=detailHTML({...base,title:'Sekiro',category:'game',introduction:'Giới thiệu',instructions:'Hướng dẫn',images:['https://images.example.test/wide.webp','https://images.example.test/portrait.webp'],drive_files:[
  {file_id:'archive-one',name:'Sekiro.rar',mime_type:'application/zip',size:'1024',can_download:1,download_url:'https://drive.google.com/uc?id=archive-one',web_url:'https://drive.google.com/file/d/archive-one/view',sharing_confirmed:1,sharing_access:'anyone'},
  {file_id:'archive-two',name:'Patch.zip',mime_type:'application/zip',size:'2048',can_download:1,download_url:'https://drive.google.com/uc?id=archive-two',web_url:'https://drive.google.com/file/d/archive-two/view',sharing_confirmed:1,sharing_access:'anyone'}
 ]});
 const instructions=html.indexOf('Hướng dẫn cài đặt'),gallery=html.indexOf('Hình ảnh minh họa'),details=html.indexOf('<summary>Chi tiết tệp</summary>');
 assert.ok(instructions<gallery&&gallery<details);
 assert.equal((html.match(/https:\/\/drive\.google\.com\/uc\?id=archive-one/g)||[]).length,1);
 assert.equal((html.match(/https:\/\/drive\.google\.com\/uc\?id=archive-two/g)||[]).length,1);
 assert.ok(html.includes('Sekiro.rar')&&html.includes('Patch.zip'));
 assert.ok(html.includes('data-download-jump'));
 assert.equal((html.match(/loading="lazy"/g)||[]).length,2);
 assert.ok(!html.includes('<details class="detail-section file-details" open'));
});
test('album download page renders one or multiple archives without track or player controls',()=>{
 const one=albumDetailHTML({slug:'single',title:'Single archive',artist:'Artist',description:'Description',cover_url:'',bundle_downloads:[{name:'album.zip',download_url:'https://drive.google.com/uc?export=download&id=one',open_url:'https://drive.google.com/file/d/one/view'}]});
 assert.ok(one.includes('Tải album'));assert.ok(one.includes('Mở trên Google Drive'));assert.match(one,/id=one/);
 const many=albumDetailHTML({slug:'multiple',title:'Multi archive',artist:'Artist',description:'Description',cover_url:'',bundle_downloads:[
  {name:'part-a.zip',download_url:'https://drive.google.com/uc?export=download&id=a',open_url:'https://drive.google.com/file/d/a/view'},
  {name:'part-b.rar',download_url:'',open_url:'https://drive.google.com/file/d/b/view'},
 ]});
 assert.ok(many.includes('Tải xuống'));assert.ok(many.includes('part-a.zip')&&many.includes('part-b.rar'));assert.equal((many.match(/Mở trên Google Drive/g)||[]).length,2);
 for(const html of [one,many]){assert.ok(!html.includes('<audio'));assert.ok(!html.includes('<video'));assert.ok(!html.includes('Danh sách bài hát'));assert.ok(!html.includes('Play'));}
});
test('basic information is common to Game and App, trusts Drive file sizes, and uses the stored post timestamp',()=>{
 const file1={file_id:'large-file',name:'Game archive',size:'1073741824'},file2={file_id:'unknown-size',name:'Patch',size:null};
 for(const category of ['game','app']){
  const html=detailHTML({...base,category,updated_at:'2026-03-01T22:30:00.000Z',install_size:'Khoảng 40 GB dung lượng trống',operating_systems:['Windows','Linux'],drive_files:[file1,file2],metadata:{size_label:'999 GB',content_updated_at:'2000-01-01',platform:'Unsupported old value'}});
  assert.ok(html.includes('Thông tin cơ bản'));assert.ok(html.includes('1 GiB'));assert.ok(html.includes('Chưa có thông tin'));assert.ok(html.includes('Khoảng 40 GB dung lượng trống'));assert.ok(html.includes('02/03/2026'));assert.ok(html.includes('Windows')&&html.includes('Linux'));assert.ok(!html.includes('999 GB'));assert.ok(!html.includes('2000-01-01'));assert.ok(!html.includes('Unsupported old value'));
  assert.ok(html.includes('Game archive')&&html.includes('Patch'));
 }
 assert.equal(detailHTML({...base,drive_files:[]}).includes('Chưa có thông tin'),true);
 assert.throws(()=>validatePost({...base,operating_systems:['Windows','Windows']}),/Hệ điều hành hỗ trợ/);
 assert.throws(()=>validatePost({...base,operating_systems:['Android']}),/Hệ điều hành hỗ trợ/);
 assert.equal(validatePost({...base,install_size:'25 GB',operating_systems:['iOS']}).install_size,'25 GB');
});
test('Markdown auto-links safe URLs without nesting links or linking code, and rejects unsafe protocols',()=>{
 const html=renderMarkdown(`URL https://example.com/path. HTTP http://example.net! Inline \`https://code.example.test\` and [https://label.example.test](https://link.example.test/).

\`\`\`
https://block.example.test
\`\`\`

[unsafe](javascript:alert(1))`);
 assert.equal((html.match(/<a\b/g)||[]).length,3);
 assert.ok(html.includes('href=\"https://example.com/path\"'));assert.ok(html.includes('path</a>.'));assert.ok(html.includes('href=\"https://link.example.test/\"'));
 assert.ok(html.includes('href=\"http://example.net/\"'));assert.ok(html.includes('example.net</a>!'));
 assert.ok(html.includes('<code>https://code.example.test</code>'));assert.ok(html.includes('<pre><code>https://block.example.test</code></pre>'));
 assert.ok(!html.includes('href=\"javascript:'));assert.ok(!html.includes('<a><a'));
});
test('optional metadata validation, persistence, legacy updates and category allowlist',t=>{
 const db=openDatabase(':memory:');t.after(()=>db.close());const saved=db.create(validatePost({...base,metadata:{version:'2.0',platform:'Windows 11',artist:'Private irrelevant field'}}));
 assert.equal(db.get(saved.id).metadata.version,'2.0');db.update(saved.id,validatePost(base));assert.equal(db.get(saved.id).metadata.version,'2.0');
 const visible=db.publicPost(db.get(saved.id));assert.equal(visible.metadata.version,'2.0');assert.equal(visible.metadata.artist,undefined);
 for(const metadata of [{admin_email:'private'},[],{version:123},{release_year:'hello'},{content_updated_at:'2026-02-31'},{system_requirements:'x'.repeat(3001)}])assert.throws(()=>validatePost({...base,metadata}));
 assert.deepEqual(publicPost({...saved,metadata:undefined}).metadata,{});
});
test('viewing, exporting and saving an unchanged post preserve its update timestamp',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-post-timestamp-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);const saved=db.create(validatePost({...base,install_size:'20 GB',operating_systems:['Windows']}));
  const updatedAt=saved.updated_at;await new Promise(resolve=>setTimeout(resolve,5));
  const post=db.get(saved.id);detailHTML(db.publicPost(post));
  db.update(saved.id,validatePost(post));assert.equal(db.get(saved.id).updated_at,updatedAt);
  db.setPin(saved.id,0,0);assert.equal(db.get(saved.id).updated_at,updatedAt);
  await exportStatic({databasePath:filename,outputDir:path.join(directory,'docs')});
  assert.equal(JSON.parse(await readFile(path.join(directory,'docs/content/posts.json'),'utf8')).posts[0].updated_at,updatedAt);
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});
test('facts use only supplied metadata and approved file facts, no filename speculation or unknown placeholders',()=>{
 const html=smartMetadataHTML({...base,metadata:{version:'<img src=x onerror=alert(1)>',platform:'Linux'}},[{name:'Windows_2026_4K_v99.exe',mime_type:'application/zip',size:'1048576',modified_time:'2026-10-31T00:00:00Z'}]);
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));assert.ok(html.includes('ZIP'));assert.ok(!html.includes('Linux'));assert.ok(!html.includes('v99'));assert.ok(!html.includes('4K'));
 assert.equal(smartMetadataHTML(base,[]),'');assert.equal(formatBytes(null),'');assert.equal(formatBytes('bad'),'');assert.equal(formatBytes('0'),'0 B');
});
test('Game requirements preserve free text, render safely in separate cards and export publicly',async()=>{
 const db=openDatabase(':memory:');try{
  const minimum='CPU: bất kỳ\n- RAM: 8 GB\nGPU <script>alert(1)</script>',recommended='Windows\n• 16 GB RAM';
  const saved=db.create(validatePost({...base,category:'game',minimum_requirements:minimum,recommended_requirements:recommended,metadata:{system_requirements:'Legacy metadata stays unchanged'}}));
  assert.equal(db.get(saved.id).minimum_requirements,minimum);assert.equal(db.get(saved.id).recommended_requirements,recommended);
  const published=publicPost(db.get(saved.id)),html=detailHTML(published);
  assert.ok(html.indexOf('Giới thiệu')<html.indexOf('Cấu hình hệ thống'));
  assert.ok(html.includes('GPU &lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(html.includes(minimum.replace('<script>','&lt;script&gt;').replace('</script>','&lt;/script&gt;')));assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('requirements-card--recommended'));assert.equal(detailHTML({...published,minimum_requirements:'',recommended_requirements:''}).includes('requirements-grid'),false);
  db.update(saved.id,validatePost({...base,category:'game',introduction:'Old intro\n- existing bullet',metadata:{system_requirements:'Legacy metadata stays unchanged'},minimum_requirements:minimum,recommended_requirements:recommended}));
  assert.equal(db.get(saved.id).introduction,'Old intro\n- existing bullet');assert.equal(db.get(saved.id).metadata.system_requirements,'Legacy metadata stays unchanged');
 }finally{db.close();}
});
test('v10 migration backs up safely, preserves old post data and exports new fields',async()=>{
 const directory=await mkdtemp(path.join(os.tmpdir(),'ivan-requirements-migration-')),filename=path.join(directory,'db.sqlite');let db;
 try{
  db=openDatabase(filename);
  const saved=db.create(validatePost({...base,slug:'sekiro',title:'Sekiro',category:'game',introduction:'Intro remains\n- unchanged',metadata:{system_requirements:'Legacy metadata remains'},install_size:'Khoảng 25 GB',operating_systems:['Windows'],images:[]}));
  db.setPin(saved.id,1,7);db.linkFile(saved.id,{file_id:'preserved-file',name:'Sekiro archive',mime_type:'application/zip',size:'20',modified_time:'',web_url:'https://drive.google.com/file/d/preserved-file/view'});
  db.saveHighlightConfig({enabled:true,interval_seconds:6,slides:[{post_id:saved.id,enabled:true}]});db.close();db=null;
  const legacy=new DatabaseSync(filename);legacy.exec('ALTER TABLE posts DROP COLUMN minimum_requirements;ALTER TABLE posts DROP COLUMN recommended_requirements;ALTER TABLE posts DROP COLUMN install_size;ALTER TABLE posts DROP COLUMN operating_systems;PRAGMA user_version=10;');legacy.close();
  db=openDatabase(filename);
  const migrated=db.get(saved.id);assert.equal(migrated.minimum_requirements,'');assert.equal(migrated.recommended_requirements,'');
  assert.equal(migrated.introduction,'Intro remains\n- unchanged');assert.equal(migrated.metadata.system_requirements,'Legacy metadata remains');
  assert.equal(migrated.install_size,'');assert.deepEqual(migrated.operating_systems,[]);
  assert.equal(migrated.is_pinned,1);assert.equal(migrated.pin_order,7);assert.equal(migrated.drive_files[0].file_id,'preserved-file');assert.equal(db.highlightConfig().slides[0].post_id,saved.id);
  const backupDir=path.join(directory,'backups'),reportName=(await readdir(backupDir)).find(name=>name.endsWith('.verified.json'));
  assert.equal(JSON.parse(await readFile(path.join(backupDir,reportName),'utf8')).integrity,'ok');
  const check=new DatabaseSync(filename,{readOnly:true});assert.equal(check.prepare('PRAGMA user_version').get().user_version,14);check.close();
  db.update(saved.id,validatePost({...base,slug:'sekiro',title:'Sekiro',category:'game',minimum_requirements:'CPU\n- RAM\nGPU',recommended_requirements:'• 16 GB',install_size:'25 GB',operating_systems:['Windows','Linux'],metadata:migrated.metadata,introduction:migrated.introduction}));
  const updatedAt=db.get(saved.id).updated_at;
  db.close();db=null;
  const output=path.join(directory,'docs');await exportStatic({databasePath:filename,outputDir:output});
  const exported=JSON.parse(await readFile(path.join(output,'content/posts.json'),'utf8')).posts[0];
  assert.equal(exported.minimum_requirements,'CPU\n- RAM\nGPU');assert.equal(exported.recommended_requirements,'• 16 GB');
  assert.equal(exported.install_size,'25 GB');assert.deepEqual(exported.operating_systems,['Windows','Linux']);assert.equal(exported.updated_at,updatedAt);
  assert.equal(exported.metadata.system_requirements,'Legacy metadata remains');
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

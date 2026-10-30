import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {detailHTML,smartMetadataHTML} from '../js/content.js';
import {formatBytes} from '../js/media.js';
import {publicPost} from '../server/public-post.js';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {exportStatic} from '../scripts/export-static.mjs';
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
  const saved=db.create(validatePost({...base,slug:'sekiro',title:'Sekiro',category:'game',introduction:'Intro remains\n- unchanged',metadata:{system_requirements:'Legacy metadata remains'},images:[]}));
  db.setPin(saved.id,1,7);db.linkFile(saved.id,{file_id:'preserved-file',name:'Sekiro archive',mime_type:'application/zip',size:'20',modified_time:'',web_url:'https://drive.google.com/file/d/preserved-file/view'});
  db.saveHighlightConfig({enabled:true,interval_seconds:6,slides:[{post_id:saved.id,enabled:true}]});db.close();db=null;
  const legacy=new DatabaseSync(filename);legacy.exec('ALTER TABLE posts DROP COLUMN minimum_requirements;ALTER TABLE posts DROP COLUMN recommended_requirements;PRAGMA user_version=10;');legacy.close();
  db=openDatabase(filename);
  const migrated=db.get(saved.id);assert.equal(migrated.minimum_requirements,'');assert.equal(migrated.recommended_requirements,'');
  assert.equal(migrated.introduction,'Intro remains\n- unchanged');assert.equal(migrated.metadata.system_requirements,'Legacy metadata remains');
  assert.equal(migrated.is_pinned,1);assert.equal(migrated.pin_order,7);assert.equal(migrated.drive_files[0].file_id,'preserved-file');assert.equal(db.highlightConfig().slides[0].post_id,saved.id);
  const backupDir=path.join(directory,'backups'),reportName=(await readdir(backupDir)).find(name=>name.endsWith('.verified.json'));
  assert.equal(JSON.parse(await readFile(path.join(backupDir,reportName),'utf8')).integrity,'ok');
  const check=new DatabaseSync(filename,{readOnly:true});assert.equal(check.prepare('PRAGMA user_version').get().user_version,11);check.close();
  db.update(saved.id,validatePost({...base,slug:'sekiro',title:'Sekiro',category:'game',minimum_requirements:'CPU\n- RAM\nGPU',recommended_requirements:'• 16 GB',metadata:migrated.metadata,introduction:migrated.introduction}));
  db.close();db=null;
  const output=path.join(directory,'docs');await exportStatic({databasePath:filename,outputDir:output});
  const exported=JSON.parse(await readFile(path.join(output,'content/posts.json'),'utf8')).posts[0];
  assert.equal(exported.minimum_requirements,'CPU\n- RAM\nGPU');assert.equal(exported.recommended_requirements,'• 16 GB');
  assert.equal(exported.metadata.system_requirements,'Legacy metadata remains');
 }finally{db?.close();await rm(directory,{recursive:true,force:true});}
});

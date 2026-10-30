import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,copyFile,writeFile,readFile,rm,access} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {runGit,PublishError} from '../server/publish-git.js';
import {createPublisher} from '../server/publisher.js';
import {exportStatic} from '../scripts/export-static.mjs';
import {openDatabase} from '../server/database.js';
import {validatePost} from '../server/posts.js';
import {allowedPublishPath} from '../server/publish-bundle.js';

async function fixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'ivan-publish-test-')),databasePath=path.join(root,'data/db.sqlite');
 for(const dir of ['js','css','images'])await mkdir(path.join(root,dir),{recursive:true});
 for(const file of ['index.html','css/style.css',...['main','data','content','post-source','media','markdown','music-content','music-player'].map(name=>`js/${name}.js`)])await copyFile(file,path.join(root,file));
 await writeFile(path.join(root,'.gitignore'),'data/\nuploads/\n');await writeFile(path.join(root,'source.txt'),'committed source\n');
 const db=openDatabase(databasePath);t.after(async()=>{db.close();await rm(root,{recursive:true,force:true});});
 await exportStatic({databasePath,sourceDir:root,outputDir:path.join(root,'docs')});
 const local=args=>runGit(args,{cwd:root});
 await local(['init','-b','main']);await local(['config','user.name','Publish Test']);await local(['config','user.email','test@example.invalid']);await local(['config','core.autocrlf','false']);
 const fixtureHooks=path.join(root,'data/fixture-empty-hooks');await mkdir(fixtureHooks,{recursive:true});
 await local(['add','--','docs','source.txt','.gitignore']);await local(['-c',`core.hooksPath=${fixtureHooks}`,'-c','commit.gpgsign=false','commit','--no-gpg-sign','-m','Fixture baseline']);await local(['remote','add','origin','https://github.com/IvanCode-ddt/IVAN-Base-Drive.git']);
 const base=(await local(['rev-parse','HEAD'])).trim();let remote=base,mode='ok',pushes=[];const calls=[];
 // All network operations are intercepted. NO real git push, fetch or ls-remote is executed.
 const git=async(args,options)=>{
  assert.equal(path.resolve(options.cwd),root);calls.push(args);
  if(args[0]==='ls-remote'){
   if(mode==='auth'){const error=new Error('Auth');error.stderr='Authentication failed https://secret-token@github.com';throw error;}
   if(mode==='offline'){const error=new Error('Network');error.stderr='Could not resolve host github.com';throw error;}
   return`${remote}\trefs/heads/main\n`;
  }
  if(args[0]==='push'){
   assert.equal(args[1],'--porcelain');assert.equal(args[2],'origin');assert.match(args[3],/^[a-f0-9]{40}:refs\/heads\/main$/);assert.ok(!args.some(value=>/force/.test(value)));pushes.push(args);
   if(mode==='reject'){const error=new Error('Rejected');error.stderr='! [rejected] main -> main (non-fast-forward)';throw error;}
   if(mode==='push-offline'){const error=new Error('Offline');error.stderr='Failed to connect github.com';throw error;}
   if(mode==='push-auth'){const error=new Error('Authentication failed');error.stderr='Authentication failed: no stored credentials';throw error;}
   remote=args[3].split(':')[0];return'fake push accepted';
  }
  if(args.includes('fetch')||args.includes('pull'))throw new Error('Unexpected network operation');
  return runGit(args,options);
 };
 const publisher=createPublisher({root,databasePath,adminEmail:'private-admin@example.com',secrets:['local-secret-sentinel-1234'],git});
 const add=(slug='new-post',extra={})=>db.create(validatePost({title:'Public post',slug,category:'app',description:'Public description',images:[],status:'published',...extra}));
 return{root,databasePath,db,local,publisher,git,base,add,calls,pushes,setMode:value=>mode=value,setRemote:value=>remote=value};
}

test('publish preview then confirmed commit stages only allowed docs and preserves staged/unstaged source',async t=>{
 const f=await fixture(t);f.add();f.add('draft',{title:'PRIVATE_DRAFT_SENTINEL',status:'draft'});
 await writeFile(path.join(f.root,'source.txt'),'staged source change\n');await f.local(['add','--','source.txt']);
 await writeFile(path.join(f.root,'source.txt'),'unstaged source change\n');const stagedSource=(await f.local(['rev-parse',':source.txt'])).trim();
 await writeFile(path.join(f.root,'docs/do-not-publish.json'),'PRIVATE_UNTRACKED_DOCS');
 const preview=await f.publisher.prepare('owner');assert.ok(preview.needsConfirmation);assert.ok(preview.sourceChangeCount);assert.ok(preview.changes.every(change=>allowedPublishPath(change.path)));
 assert.equal((await f.local(['rev-parse','HEAD'])).trim(),f.base);assert.equal(f.pushes.length,0);
 assert.ok(!(await readFile(path.join(f.publisher.previewDirectory(preview.id,'owner'),'content/posts.json'),'utf8')).includes('PRIVATE_DRAFT_SENTINEL'));
 assert.throws(()=>f.publisher.previewDirectory(preview.id,'other'),/không còn hợp lệ/);
 await f.publisher.publish(preview.id,'owner');const status=await f.publisher.status();assert.equal(status.status,'success');assert.ok(status.lastPublished.commit);assert.equal(f.pushes.length,1);
 const changed=(await f.local(['diff','--name-only',f.base,'HEAD'])).trim().split('\n');assert.ok(changed.every(allowedPublishPath));
 assert.ok(!(await f.local(['ls-tree','-r','--name-only','HEAD','--','docs'])).includes('do-not-publish'));
 assert.equal((await f.local(['rev-parse',':source.txt'])).trim(),stagedSource);assert.equal(await readFile(path.join(f.root,'source.txt'),'utf8'),'unstaged source change\n');assert.ok((await f.local(['diff','--cached','--name-only'])).includes('source.txt'));
 assert.ok(!f.calls.some(args=>args[0]==='add'&&args.includes('.')));
 const unchanged=await f.publisher.prepare('owner');assert.equal(unchanged.needsConfirmation,false);assert.equal((await f.publisher.status()).message,'Website đã ở phiên bản mới nhất');assert.equal(f.pushes.length,1);
 const restored=createPublisher({root:f.root,databasePath:f.databasePath,git:f.git});assert.equal((await restored.status()).lastPublished.commit,status.lastPublished.commit);
});

test('auth failure, offline network and new remote commits stop before commit',async t=>{
 const f=await fixture(t);f.add();
 for(const[mode,code]of[['auth','GIT_AUTH'],['offline','NETWORK']]){f.setMode(mode);await assert.rejects(()=>f.publisher.prepare('owner'),error=>error.code===code);assert.equal((await f.local(['rev-parse','HEAD'])).trim(),f.base);assert.ok(!JSON.stringify(await f.publisher.status()).includes('secret-token'));}
 f.setMode('ok');f.setRemote('a'.repeat(40));await assert.rejects(()=>f.publisher.prepare('owner'),error=>error.code==='REMOTE_CHANGED');assert.equal(f.pushes.length,0);
 f.setRemote(f.base);const preview=await f.publisher.prepare('owner');f.setRemote('b'.repeat(40));await assert.rejects(()=>f.publisher.publish(preview.id,'owner'),error=>error.code==='REMOTE_CHANGED');assert.equal((await f.local(['rev-parse','HEAD'])).trim(),f.base);
});

test('rejected push keeps docs-only local commit; retry pushes same exact commit without another commit',async t=>{
 const f=await fixture(t);f.add();const preview=await f.publisher.prepare('owner');f.setMode('reject');await assert.rejects(()=>f.publisher.publish(preview.id,'owner'),error=>error.code==='PUSH_REJECTED');
 const commit=(await f.local(['rev-parse','HEAD'])).trim();assert.notEqual(commit,f.base);assert.equal((await f.publisher.status()).pending.commit,commit);
 f.setMode('ok');const retry=await f.publisher.prepare('owner');assert.equal(retry.retryCommit,commit);await f.publisher.publish(retry.id,'owner');assert.equal((await f.local(['rev-parse','HEAD'])).trim(),commit);assert.equal(f.pushes.length,2);
});

test('auth/network failure during push can retry without force push',async t=>{
 const f=await fixture(t);f.add();const preview=await f.publisher.prepare('owner');f.setMode('push-auth');await assert.rejects(()=>f.publisher.publish(preview.id,'owner'),error=>error.code==='GIT_AUTH');
 const commit=(await f.local(['rev-parse','HEAD'])).trim();f.setMode('push-offline');const offline=await f.publisher.prepare('owner');await assert.rejects(()=>f.publisher.publish(offline.id,'owner'),error=>error.code==='NETWORK');
 f.setMode('ok');const retry=await f.publisher.prepare('owner');await f.publisher.publish(retry.id,'owner');assert.equal((await f.publisher.status()).lastPublished.commit,commit);
});

test('staged docs, conflicts and private artifact edits are rejected safely',async t=>{
 const f=await fixture(t);f.add();await writeFile(path.join(f.root,'docs/index.html'),'manual staged docs');await f.local(['add','--','docs/index.html']);await assert.rejects(()=>f.publisher.prepare('owner'),error=>error.code==='STAGED_DOCS');
 await f.local(['restore','--staged','--','docs/index.html']);const preview=await f.publisher.prepare('owner');
 const payload=path.join(f.publisher.previewDirectory(preview.id,'owner'),'content/posts.json');await writeFile(payload,'{"schemaVersion":1,"posts":[{"status":"draft","admin_email":"private-admin@example.com"}]}');
 await assert.rejects(()=>f.publisher.publish(preview.id,'owner'),error=>error.code==='DATA_CHANGED');assert.equal(f.pushes.length,0);assert.equal((await f.local(['rev-parse','HEAD'])).trim(),f.base);
 await writeFile(path.join(f.root,'js/data.js'),"export const accidentallyEmbeddedSecret='local-secret-sentinel-1234';");await assert.rejects(()=>f.publisher.prepare('owner'),error=>error.code==='PRIVATE_DATA');
});

test('only one job can run per process and per data directory',async t=>{
 const f=await fixture(t);f.add();let entered,release;
 const started=new Promise(resolve=>entered=resolve),barrier=new Promise(resolve=>release=resolve);
 const first=createPublisher({root:f.root,databasePath:f.databasePath,git:f.git,exporter:async options=>{entered();await barrier;return exportStatic(options);}});
 const operation=first.prepare('owner');await started;await assert.rejects(()=>first.prepare('owner'),error=>error.code==='BUSY');
 const second=createPublisher({root:f.root,databasePath:f.databasePath,git:f.git});await assert.rejects(()=>second.prepare('owner'),error=>error.code==='LOCKED');release();await operation;assert.equal((await first.status()).busy,false);await assert.rejects(()=>access(path.join(f.root,'data/publish.lock')));
});

test('unmerged source index stops publication without changing the repository',async t=>{
 const f=await fixture(t);f.add();const blob=(await f.local(['rev-parse','HEAD:source.txt'])).trim();
 await runGit(['update-index','--index-info'],{cwd:f.root,stdin:`0 ${'0'.repeat(40)}\tsource.txt\n100644 ${blob} 1\tsource.txt\n100644 ${blob} 2\tsource.txt\n100644 ${blob} 3\tsource.txt\n`});
 const before=await f.local(['ls-files','-u']);assert.ok(before);
 await assert.rejects(()=>f.publisher.prepare('owner'),error=>error.code==='CONFLICT');assert.equal(await f.local(['ls-files','-u']),before);assert.equal(f.pushes.length,0);
});

test('changing Published data after review invalidates the preview before any commit or push',async t=>{
 const f=await fixture(t),post=f.add();const preview=await f.publisher.prepare('owner');
 f.db.softDelete(post.id);await assert.rejects(()=>f.publisher.publish(preview.id,'owner'),error=>error.code==='DATA_CHANGED');
 assert.equal(f.pushes.length,0);assert.equal((await f.local(['rev-parse','HEAD'])).trim(),f.base);
});

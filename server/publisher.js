import path from 'node:path';
import {readFile,writeFile,mkdir,rename,open,rm,copyFile,lstat,realpath} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {exportStatic} from '../scripts/export-static.mjs';
import {allowedPublishPath,bundleManifest,manifestHash,validateBundle} from './publish-bundle.js';
import {runGit,gitFailure,PublishError} from './publish-git.js';

export const PAGES_URL='https://ivancode-ddt.github.io/IVAN-Base-Drive/';
const ORIGINS=new Set(['https://github.com/IvanCode-ddt/IVAN-Base-Drive.git','https://github.com/IvanCode-ddt/IVAN-Base-Drive']);
const split=value=>value.split('\0').filter(Boolean);
const sha=value=>/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(value);
const fail=(code,message,hint='')=>{throw new PublishError(code,message,hint);};

export function createPublisher({root,databasePath,dataDir=path.join(root,'data'),adminEmail='',secrets=[],git=runGit,exporter=exportStatic,now=()=>Date.now()}={}){
 root=path.resolve(root);dataDir=path.resolve(dataDir);
 const statePath=path.join(dataDir,'publish-state.json'),lockPath=path.join(dataDir,'publish.lock'),previewRoot=path.join(dataDir,'publish-previews');
 const previews=new Map();let busy=false,initialized=false,state={status:'idle',step:'idle',progress:0,message:'Chưa có lần xuất bản nào.',lastPublished:null,pending:null};
 const command=(args,options={})=>git(args,{cwd:root,...options});
 async function init(){if(initialized)return;try{state={...state,...JSON.parse(await readFile(statePath,'utf8'))};if(state.status==='running')state={...state,status:'interrupted',message:'Tiến trình trước bị gián đoạn. Kiểm tra Git và publish.lock trước khi thử lại.'};}catch(error){if(error.code!=='ENOENT')fail('STATE','Không đọc được trạng thái xuất bản.','Kiểm tra data/publish-state.json; không xóa commit local.');}initialized=true;}
 async function save(patch){await init();state={...state,...patch,updatedAt:new Date(now()).toISOString()};await mkdir(dataDir,{recursive:true});const temporary=statePath+'.'+randomUUID()+'.tmp';await writeFile(temporary,JSON.stringify(state,null,2),{mode:0o600});await rename(temporary,statePath);}
 const step=(name,progress,message)=>save({status:'running',step:name,progress,message,error:null});
 async function exclusive(task){
  if(busy)fail('BUSY','Đang có một tiến trình xuất bản. Vui lòng chờ.');busy=true;let handle;
  try{await init();await mkdir(dataDir,{recursive:true});try{handle=await open(lockPath,'wx',0o600);await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date(now()).toISOString()}));}catch(error){if(error.code==='EEXIST')fail('LOCKED','Có khóa xuất bản trên máy.','Nếu server từng bị dừng đột ngột: xác nhận không còn tiến trình xuất bản, rồi xóa riêng data/publish.lock trong terminal.');throw error;}return await task();}
  catch(error){const safe=gitFailure(error);if(!['BUSY','LOCKED'].includes(safe.code))await save({status:'failed',step:'failed',error:{code:safe.code,message:safe.message,hint:safe.hint},message:safe.message}).catch(()=>{});throw safe;}
  finally{if(handle){await handle.close();await rm(lockPath,{force:true});}busy=false;}
 }
 async function remoteHead(){const result=await command(['ls-remote','--exit-code','origin','refs/heads/main']);const value=result.trim().split(/\s/)[0];if(!sha(value))fail('REMOTE','Không đọc được origin/main.','Kiểm tra nhánh main và Git Credential Manager.');return value;}
 async function verifyOrigin(){for(const args of [['remote','get-url','--all','origin'],['remote','get-url','--push','--all','origin']]){const urls=(await command(args)).trim().split(/\r?\n/);if(urls.length!==1||!ORIGINS.has(urls[0]))fail('ORIGIN','origin phải trỏ đúng IvanCode-ddt/IVAN-Base-Drive trên GitHub.','Không dùng URL có token; dùng Git Credential Manager.');}}
 async function tree(){
  const result=new Map();for(const entry of split(await command(['ls-tree','-r','-z','HEAD','--','docs']))){const[meta,file]=entry.split('\t');const[mode,type,hash]=meta.split(' ');if(allowedPublishPath(file)){if(mode==='120000'||type!=='blob')fail('UNSAFE_TREE','docs/ chứa symlink hoặc đối tượng không an toàn.');result.set(file,hash);}else if(!/^docs\/[A-Za-z0-9_-]+\.md$/.test(file))fail('UNSAFE_TREE','Có file không được phép trong docs/ đã theo dõi bởi Git.','Kiểm tra và xử lý thủ công file lạ trong docs/ trước khi đăng.');}return result;
 }
 async function preflight(){
  if(path.resolve((await command(['rev-parse','--show-toplevel'])).trim()).toLowerCase()!==root.toLowerCase())fail('REPOSITORY','Thư mục source không phải gốc repository.');
  if((await command(['symbolic-ref','--short','HEAD'])).trim()!=='main')fail('BRANCH','Chỉ xuất bản từ nhánh main.','Chuyển nhánh thủ công sau khi bảo toàn thay đổi hiện tại.');
  await verifyOrigin();
  if((await command(['ls-files','-u','-z'])).length)fail('CONFLICT','Repository đang có conflict.','Xử lý conflict thủ công; CMS không pull, merge hoặc reset.');
  for(const marker of ['MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply']){const target=(await command(['rev-parse','--git-path',marker])).trim();try{await lstat(path.resolve(root,target));fail('CONFLICT','Git đang có thao tác merge/rebase/cherry-pick chưa hoàn tất.');}catch(error){if(error instanceof PublishError)throw error;if(error.code!=='ENOENT')throw error;}}
  if((await command(['diff','--cached','--name-only','-z','--','docs'])).length)fail('STAGED_DOCS','Đã có file docs/ được stage từ trước.','Commit hoặc bỏ stage riêng các file docs/ đó thủ công rồi tạo bản xem trước mới. Source đã stage ngoài docs/ được giữ nguyên.');
  await command(['var','GIT_AUTHOR_IDENT']);
  const head=(await command(['rev-parse','HEAD'])).trim(),remote=await remoteHead();
  if(!sha(head))fail('HEAD','Không đọc được commit hiện tại.');
  const retry=!!state.pending&&state.pending.commit===head&&state.pending.base===remote;
  if(head!==remote&&!retry)fail('REMOTE_CHANGED','main local khác origin/main. Đã dừng để tránh ghi đè hoặc đẩy commit ngoài dự kiến.','Đồng bộ và xử lý Git thủ công, rồi tạo bản xem trước mới. CMS không tự pull hoặc force push.');
  if(retry){const paths=split(await command(['diff','--name-only','-z',state.pending.base,head]));if(paths.some(file=>!allowedPublishPath(file)))fail('PENDING','Commit đang chờ push có thay đổi ngoài docs/ được phép.');}
  const sourceChanges=[...new Set([...split(await command(['diff','--name-only','-z','HEAD'])),...split(await command(['ls-files','--others','--exclude-standard','-z']))].filter(file=>!file.startsWith('docs/')))];
  const algorithm=(await command(['rev-parse','--show-object-format'])).trim();if(!['sha1','sha256'].includes(algorithm))fail('OBJECT_FORMAT','Định dạng Git object chưa hỗ trợ.');
  return{head,remote,retry,sourceChanges,algorithm,tracked:await tree()};
 }
 function differences(files,tracked){const current=new Map(files.map(file=>[file.path,file]));return[...new Set([...tracked.keys(),...current.keys()])].sort().flatMap(file=>!current.has(file)?[{path:file,status:'deleted',size:0}]:tracked.get(file)===current.get(file).gitHash?[]:[{path:file,status:tracked.has(file)?'modified':'added',size:current.get(file).size}]);}
 async function cleanPreview(preview){const resolved=path.resolve(preview.directory);if(!resolved.startsWith(previewRoot+path.sep))throw new Error('Invalid preview cleanup path');await rm(path.dirname(resolved),{recursive:true,force:true});previews.delete(preview.id);}
 function getPreview(id,owner){const preview=previews.get(id);if(!preview||preview.owner!==owner||preview.expiresAt<=now())fail('PREVIEW_EXPIRED','Bản xem trước không còn hợp lệ.','Tạo bản xem trước mới.');return preview;}
 function publicPreview(p){return{id:p.id,expiresAt:p.expiresAt,changes:p.changes,posts:p.posts.map(post=>({title:post.title,slug:post.slug,category:post.category,fileCount:post.drive_files.length})),sourceChangeCount:p.sourceChangeCount,retryCommit:p.retry?p.head:null,needsConfirmation:p.changes.length>0||p.retry,siteUrl:`/api/admin/publish/previews/${p.id}/site/`,pagesUrl:PAGES_URL};}
 async function ensureTarget(file){if(!allowedPublishPath(file))fail('PATH','Đường dẫn không thuộc allowlist.');const target=path.resolve(root,file);if(!target.startsWith(path.join(root,'docs')+path.sep))fail('PATH','Đường dẫn vượt ra ngoài docs/.');let current=root;for(const piece of file.split('/')){current=path.join(current,piece);try{if((await lstat(current)).isSymbolicLink())fail('PATH','docs/ có symlink, không thể ghi bản xuất.');}catch(error){if(error.code!=='ENOENT')throw error;}}return target;}
 return{
  async status(){await init();return{...state,busy,pagesUrl:PAGES_URL};},
  previewDirectory(id,owner){return getPreview(id,owner).directory;},
  async prepare(owner){return exclusive(async()=>{
   for(const previous of previews.values())if(previous.owner===owner||previous.expiresAt<=now())await cleanPreview(previous);
   await step('checking',5,'Kiểm tra nhánh main, origin, staged files và remote…');const checks=await preflight();
   await step('exporting',20,'Xuất dữ liệu công khai bằng exporter hiện có…');const id=randomUUID(),directory=path.join(previewRoot,id,'site');await exporter({databasePath,sourceDir:root,outputDir:directory});
   await step('validating',45,'Kiểm tra Published, file chia sẻ và dữ liệu riêng tư…');const bundle=await validateBundle({directory,databasePath,secrets,adminEmail});const files=await bundleManifest(directory,checks.algorithm);
   const changes=differences(files,checks.tracked);
   if(checks.retry&&changes.length)fail('PENDING_CHANGED','Có commit chưa push và nội dung mới đã thay đổi.','Thử push lại commit đang chờ trước khi thay đổi nội dung, hoặc xử lý Git thủ công.');
   let reviewChanges=changes;
   if(checks.retry)reviewChanges=(await command(['diff','--name-status','--no-renames',state.pending.base,checks.head,'--','docs'])).trim().split('\n').filter(Boolean).map(line=>{const[status,file]=line.split('\t');return{path:file,status:status==='D'?'deleted':status==='A'?'added':'modified'};});
   const preview={id,owner,directory,head:checks.head,remote:checks.remote,retry:checks.retry,files,hash:manifestHash(files),changes:reviewChanges,posts:bundle.posts,sourceChangeCount:checks.sourceChanges.length,expiresAt:now()+15*60*1000};previews.set(id,preview);
   if(!changes.length&&!checks.retry){await save({status:'up_to_date',step:'done',progress:100,message:'Website đã ở phiên bản mới nhất',error:null,...state.pending?.commit===checks.head?{pending:null,lastPublished:{commit:checks.head,pagesUrl:PAGES_URL,at:new Date(now()).toISOString()}}:{}});}
   else await save({status:'awaiting_confirmation',step:'review',progress:60,message:'Bản xem trước đã sẵn sàng. Chưa commit hoặc push.',error:null});
   return publicPreview(preview);
  });},
  async publish(id,owner){return exclusive(async()=>{
   const preview=getPreview(id,owner);await step('rechecking',62,'Kiểm tra lại dữ liệu và origin/main trước khi đăng…');
   const checks=await preflight();if(checks.head!==preview.head||checks.remote!==preview.remote)fail('STALE_PREVIEW','Git đã đổi sau khi xem trước.','Tạo bản xem trước mới.');
   await validateBundle({directory:preview.directory,databasePath,secrets,adminEmail});
   if(manifestHash(await bundleManifest(preview.directory,checks.algorithm))!==preview.hash)fail('STALE_PREVIEW','File xem trước đã thay đổi.','Tạo bản xem trước mới.');
   let commit=checks.head;
   if(!checks.retry){
    const changes=differences(preview.files,checks.tracked);if(!changes.length){await save({status:'up_to_date',progress:100,step:'done',message:'Website đã ở phiên bản mới nhất'});return this.status();}
    await step('staging',70,'Cập nhật và stage riêng các file docs/ đã duyệt…');
    for(const change of changes){const target=await ensureTarget(change.path);if(change.status==='deleted')await rm(target,{force:true});else{await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(preview.directory,change.path.slice(5)),target);}}
    // Recheck staged docs immediately before our own stage operation.
    if((await command(['diff','--cached','--name-only','-z','--','docs'])).length)fail('STAGED_DOCS','docs/ được stage bởi thao tác khác trong lúc xuất bản.');
    const paths=changes.map(change=>change.path),stdin=paths.join('\0')+'\0';
    await command(['--literal-pathspecs','add','--pathspec-from-file=-','--pathspec-file-nul'],{stdin});
    for(const file of preview.files){if((await command(['rev-parse',`:${file.path}`])).trim()!==file.gitHash)fail('STAGED_MISMATCH','Nội dung staged không khớp bản xem trước.','Kiểm tra Git filters/line endings và staged docs/ trong terminal.');}
    if((await command(['rev-parse','HEAD'])).trim()!==preview.head)fail('HEAD_CHANGED','Có tiến trình Git khác vừa tạo commit.');
    try{await validateBundle({directory:preview.directory,databasePath,secrets,adminEmail});}
    catch(error){await command(['--literal-pathspecs','restore','--staged','--source=HEAD','--pathspec-from-file=-','--pathspec-file-nul'],{stdin}).catch(()=>{});throw error;}
    const hooks=path.join(path.dirname(preview.directory),'empty-hooks');await mkdir(hooks,{recursive:true});
    await step('committing',80,'Tạo commit chỉ chứa các file docs/ được phép…');
    await command(['-c',`core.hooksPath=${hooks}`,'-c','commit.gpgsign=false','--literal-pathspecs','commit','--only','--no-gpg-sign','-m','Publish IVAN Base Drive static website','--pathspec-from-file=-','--pathspec-file-nul'],{stdin});
    commit=(await command(['rev-parse','HEAD'])).trim();const parents=(await command(['rev-list','--parents','-n','1',commit])).trim().split(' ');
    const changed=split(await command(['diff','--name-only','-z',preview.head,commit]));
    if(!sha(commit)||parents.length!==2||parents[1]!==preview.head||changed.some(file=>!allowedPublishPath(file)))fail('COMMIT_SCOPE','Commit không đúng phạm vi docs/. Đã dừng trước push.','Kiểm tra commit local; không tự reset hoặc force push.');
    await save({commit,pending:{commit,base:preview.head,at:new Date(now()).toISOString()}});
   }
   await step('pushing',90,'Push commit docs/ lên origin/main bằng Git Credential Manager…');
   await verifyOrigin();
   await validateBundle({directory:preview.directory,databasePath,secrets,adminEmail});
   // No force flag; a concurrent remote update is rejected by Git.
   await command(['push','--porcelain','origin',`${commit}:refs/heads/main`],{timeout:120000});
   if(await remoteHead()!==commit)fail('PUSH_UNCONFIRMED','Chưa xác nhận được commit mới trên remote.','Kiểm tra mạng rồi tạo bản xem trước để thử lại; commit local được giữ nguyên.');
   await save({status:'success',step:'done',progress:100,commit,pending:null,error:null,lastPublished:{commit,pagesUrl:PAGES_URL,at:new Date(now()).toISOString()},message:'Đã push thành công. GitHub Pages có thể cần vài phút để cập nhật.'});
   await cleanPreview(preview);return this.status();
  });},
 };
}

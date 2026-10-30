import {readFile,readdir,lstat} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {readPublished,readHighlights} from '../scripts/export-static.mjs';
import {PublishError} from './publish-git.js';

const fixed=new Set(['docs/index.html','docs/.nojekyll','docs/content/posts.json','docs/content/highlights.json','docs/css/style.css',...['main','data','content','post-source','media','markdown'].map(name=>`docs/js/${name}.js`)]);
export function allowedPublishPath(value){
 return fixed.has(value)||/^docs\/images\/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|gif|avif|ico)$/i.test(value)||/^docs\/uploads\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(value);
}
export async function bundleManifest(directory,algorithm='sha1'){
 const files=[];
 async function walk(folder){
  for(const entry of await readdir(folder,{withFileTypes:true})){
   const absolute=path.join(folder,entry.name),stat=await lstat(absolute);
   if(stat.isSymbolicLink())throw new PublishError('UNSAFE_BUNDLE','Bản xuất chứa symlink; đã dừng.');
   if(stat.isDirectory()){await walk(absolute);continue;}
   const relative='docs/'+path.relative(directory,absolute).split(path.sep).join('/');
   if(!stat.isFile()||!allowedPublishPath(relative))throw new PublishError('UNSAFE_BUNDLE','Bản xuất chứa đường dẫn ngoài allowlist.');
   const bytes=await readFile(absolute);
   files.push({path:relative,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),gitHash:createHash(algorithm).update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')});
  }
 }
 await walk(directory);return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export function manifestHash(files){return createHash('sha256').update(JSON.stringify(files)).digest('hex');}
export async function validateBundle({directory,databasePath,secrets=[],adminEmail=''}){
 const payload=JSON.parse(await readFile(path.join(directory,'content/posts.json'),'utf8'));
 const expected={schemaVersion:1,posts:readPublished(databasePath)};
 if(JSON.stringify(payload)!==JSON.stringify(expected))throw new PublishError('DATA_CHANGED','Dữ liệu đã đổi hoặc bản xuất không khớp dữ liệu công khai.','Tạo bản xem trước mới trước khi đăng.');
 const highlights=JSON.parse(await readFile(path.join(directory,'content/highlights.json'),'utf8'));
 if(JSON.stringify(highlights)!==JSON.stringify(readHighlights(databasePath)))throw new PublishError('DATA_CHANGED','Cấu hình Highlight đã đổi hoặc bản xuất không khớp dữ liệu công khai.','Tạo bản xem trước mới trước khi đăng.');
 const json=JSON.stringify(payload);
 if(adminEmail&&json.toLowerCase().includes(adminEmail.toLowerCase()))throw new PublishError('PRIVATE_DATA','Bản xuất chứa email quản trị.','Xóa email khỏi nội dung công khai trước khi đăng.');
 const files=await bundleManifest(directory);
 for(const file of files.filter(f=>/\.(?:json|js|html|css)$/.test(f.path))){
  const text=await readFile(path.join(directory,file.path.slice(5)),'utf8');
  if(secrets.some(secret=>typeof secret==='string'&&secret.length>=12&&text.includes(secret))||/(?:gh[pousr]_[a-zA-Z0-9]{25,}|github_pat_[a-zA-Z0-9_]{30,}|GOCSPX-[a-zA-Z0-9_-]{20,}|ya29\.[a-zA-Z0-9_-]{20,}|1\/\/[a-zA-Z0-9_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(text))throw new PublishError('PRIVATE_DATA','Phát hiện chuỗi credential trong bản xuất.','Kiểm tra source công khai; credential không được đưa vào docs/.');
 }
 return{posts:payload.posts,files};
}

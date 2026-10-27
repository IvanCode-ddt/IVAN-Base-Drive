import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir, writeFile, rename, rm, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { publicPost } from '../server/public-post.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export function readPublished(filename) {
  // No migrations, writes, Google calls or OAuth configuration required.
  const db = new DatabaseSync(filename, { readOnly:true });
  try {
    db.exec('BEGIN');
    const posts = db.prepare("SELECT * FROM posts WHERE status='published' ORDER BY updated_at DESC,id").all();
    const files = db.prepare('SELECT * FROM post_drive_files WHERE post_id=? AND sharing_confirmed=1 ORDER BY linked_at,file_id');
    const result = posts.map(post => publicPost({...post, images:JSON.parse(post.images), drive_files:files.all(post.id)}));
    db.exec('COMMIT'); return result;
  } finally { db.close(); }
}
async function copyImages(source, target) {
  await mkdir(target,{recursive:true});
  for (const entry of await readdir(source,{withFileTypes:true})) {
    // Exclude symlinks and non-image files from the public bundle.
    if(entry.isFile() && /\.(jpe?g|png|webp|gif|avif|ico)$/i.test(entry.name)) await copyFile(path.join(source,entry.name),path.join(target,entry.name));
  }
}
export async function exportStatic({ databasePath=path.resolve(process.env.DATABASE_PATH || 'data/ivan.sqlite'), outputDir=path.join(projectRoot,'docs'), sourceDir=projectRoot }={}) {
  const posts = readPublished(databasePath);
  const contentDir=path.join(outputDir,'content');
  await mkdir(contentDir,{recursive:true});
  await mkdir(path.join(outputDir,'css'),{recursive:true});
  await mkdir(path.join(outputDir,'js'),{recursive:true});
  const html=(await readFile(path.join(sourceDir,'index.html'),'utf8')).replace(/<a\b[^>]*\bdata-local-admin\b[^>]*>.*?<\/a>/g,'');
  await writeFile(path.join(outputDir,'index.html'),html,'utf8');
  await copyFile(path.join(sourceDir,'css/style.css'),path.join(outputDir,'css/style.css'));
  for(const file of ['main.js','data.js','content.js','post-source.js']) await copyFile(path.join(sourceDir,'js',file),path.join(outputDir,'js',file));
  await copyImages(path.join(sourceDir,'images'),path.join(outputDir,'images'));
  await writeFile(path.join(outputDir,'.nojekyll'),'','utf8');
  const temporary=path.join(contentDir,`posts.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary,JSON.stringify({schemaVersion:1,posts},null,2)+'\n','utf8');
    await rename(temporary,path.join(contentDir,'posts.json'));
  } finally { await rm(temporary,{force:true}); }
  return { count:posts.length, outputDir };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { const result=await exportStatic();console.log(`Đã xuất ${result.count} bài Published vào docs/. Không commit, push hoặc deploy.`); }
  catch(error) { console.error('Xuất tĩnh thất bại. Kiểm tra DATABASE_PATH, schema SQLite và quyền ghi docs/.',error.code||error.name);process.exitCode=1; }
}

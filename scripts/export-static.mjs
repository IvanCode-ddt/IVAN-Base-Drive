import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir, writeFile, rename, rm, copyFile, readdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { publicPost } from '../server/public-post.js';
import { localImages, isUploadPath,spotlightImageSet } from '../js/media.js';
import {publicFormURL,DEFAULT_FEEDBACK_FORM_URL} from '../server/public-settings.js';
import {publicMusicAlbum} from '../server/music.js';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
export function readPublished(filename) {
  // No migrations, writes, Google calls or OAuth configuration required.
  const db = new DatabaseSync(filename, { readOnly:true });
  try {
    db.exec('BEGIN');
    const hasTrash=db.prepare('PRAGMA table_info(posts)').all().some(column=>column.name==='deleted_at');
    const hasMusicAlbums=!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='music_albums'").get();
    const hasExternalLinks=!!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='post_external_links'").get();
    const musicIds=new Set(hasMusicAlbums?db.prepare('SELECT post_id FROM music_albums').all().map(row=>row.post_id):[]);
    const posts = db.prepare(`SELECT * FROM posts WHERE status='published' ${hasTrash?'AND deleted_at IS NULL':''} ORDER BY updated_at DESC,id`).all();
    const files = db.prepare('SELECT * FROM post_drive_files WHERE post_id=? AND sharing_confirmed=1 ORDER BY linked_at,file_id');
    const externalLinks=hasExternalLinks?db.prepare('SELECT name,url,kind,provider,size,priority FROM post_external_links WHERE post_id=? ORDER BY priority,id'):null;
    const result = posts.map(post => {
      const value=publicPost({...post, images:JSON.parse(post.images), drive_files:files.all(post.id),external_links:externalLinks?.all(post.id)||[]});
      return value?{...value,content_type:musicIds.has(post.id)?'music_album':'post'}:null;
    }).filter(Boolean);
    db.exec('COMMIT'); return result;
  } finally { db.close(); }
}
export function readHighlights(filename){
  const db=new DatabaseSync(filename,{readOnly:true});
  try{
    const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='highlight_settings'").get();
    if(!tables)return{schemaVersion:1,enabled:false,interval_seconds:6,slides:[]};
    const settings=db.prepare('SELECT enabled,interval_seconds FROM highlight_settings WHERE id=1').get()||{enabled:0,interval_seconds:6};
    const slides=db.prepare(`SELECT h.post_id,h.enabled FROM highlight_slides h
      JOIN posts p ON p.id=h.post_id WHERE p.status='published' AND p.deleted_at IS NULL
      ORDER BY h.position,h.post_id`).all().map(slide=>({post_id:slide.post_id,enabled:slide.enabled===1}));
    return{schemaVersion:1,enabled:settings.enabled===1,interval_seconds:settings.interval_seconds,slides};
  }finally{db.close();}
}
export function readMusicAlbums(filename){
  const db=new DatabaseSync(filename,{readOnly:true});
  try{
    const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='music_albums'").get();
    if(!table)return[];
    const posts=db.prepare("SELECT * FROM posts WHERE status='published' AND deleted_at IS NULL AND id IN(SELECT post_id FROM music_albums) ORDER BY updated_at DESC,id").all();
    const files=db.prepare('SELECT * FROM post_drive_files WHERE post_id=? ORDER BY linked_at,file_id');
    const album=db.prepare('SELECT * FROM music_albums WHERE post_id=?');
    const tracks=db.prepare('SELECT * FROM music_tracks WHERE album_id=? ORDER BY position,id');
    return posts.map(row=>{
      const linked=files.all(row.id),post=publicPost({...row,images:JSON.parse(row.images),drive_files:linked});
      return publicMusicAlbum({...album.get(row.id),post:{...post,drive_files:linked},tracks:tracks.all(row.id)});
    }).filter(Boolean);
  }finally{db.close();}
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
  const highlights=readHighlights(databasePath);
  const albums=readMusicAlbums(databasePath);
  const highlightIds=new Set(highlights.slides.map(slide=>slide.post_id));
  const contentDir=path.join(outputDir,'content');
  await mkdir(contentDir,{recursive:true});
  await mkdir(path.join(outputDir,'css'),{recursive:true});
  await mkdir(path.join(outputDir,'js'),{recursive:true});
  let html=(await readFile(path.join(sourceDir,'index.html'),'utf8')).replace(/<a\b[^>]*\bdata-local-admin\b[^>]*>.*?<\/a>/g,'').replace('data-feedback-form-url=""',`data-feedback-form-url="${publicFormURL(process.env.FEEDBACK_FORM_URL??DEFAULT_FEEDBACK_FORM_URL)}"`);
  await writeFile(path.join(outputDir,'index.html'),html,'utf8');
  await copyFile(path.join(sourceDir,'css/style.css'),path.join(outputDir,'css/style.css'));
  for(const file of ['main.js','data.js','content.js','post-source.js','media.js','markdown.js']) await copyFile(path.join(sourceDir,'js',file),path.join(outputDir,'js',file));
  const uploads=[...new Set(posts.flatMap(localImages))];
  for(const relative of uploads){
    const from=path.join(sourceDir,relative);
    if(!(await lstat(from)).isFile())throw new Error('Referenced upload is not a regular file');
    await mkdir(path.join(outputDir,'uploads'),{recursive:true});
    await copyFile(from,path.join(outputDir,relative));
  }
  await copyImages(path.join(sourceDir,'images'),path.join(outputDir,'images'));
  const generated=new Set();
  for(const post of posts.filter(post=>highlightIds.has(post.id)&&isUploadPath(post.cover_url))){
    const original=path.join(sourceDir,post.cover_url);
    if(!(await lstat(original)).isFile())throw new Error('Highlight image must be a regular file');
    const imageBytes=await readFile(original),{default:sharp}=await import('sharp');
    for(const image of spotlightImageSet(post.cover_url)){
      generated.add(path.basename(image.url));
      await sharp(imageBytes,{limitInputPixels:16000000}).resize({width:image.width}).webp({quality:90}).toFile(path.join(outputDir,image.url));
    }
  }
  for(const name of await readdir(path.join(outputDir,'images')))if(/^spotlight-[a-f0-9-]{36}-(640|960|1440)\.webp$/.test(name)&&!generated.has(name))await rm(path.join(outputDir,'images',name));
  await writeFile(path.join(outputDir,'.nojekyll'),'','utf8');
  const temporary=path.join(contentDir,`posts.${randomUUID()}.tmp`);
  const highlightsTemporary=path.join(contentDir,`highlights.${randomUUID()}.tmp`);
  const musicTemporary=path.join(contentDir,`music.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary,JSON.stringify({schemaVersion:1,posts},null,2)+'\n','utf8');
    await rename(temporary,path.join(contentDir,'posts.json'));
    await writeFile(highlightsTemporary,JSON.stringify(highlights,null,2)+'\n','utf8');
    await rename(highlightsTemporary,path.join(contentDir,'highlights.json'));
    await writeFile(musicTemporary,JSON.stringify({schemaVersion:1,albums},null,2)+'\n','utf8');
    await rename(musicTemporary,path.join(contentDir,'music.json'));
    const uploaded=await readdir(path.join(outputDir,'uploads')).catch(error=>{if(error.code==='ENOENT')return[];throw error;});
    for(const name of uploaded)if(isUploadPath(`uploads/${name}`)&&!uploads.includes(`uploads/${name}`))await rm(path.join(outputDir,'uploads',name));
  } finally { await rm(temporary,{force:true});await rm(highlightsTemporary,{force:true});await rm(musicTemporary,{force:true}); }
  return { count:posts.length, outputDir };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { const result=await exportStatic();console.log(`Đã xuất ${result.count} bài Published vào docs/. Không commit, push hoặc deploy.`); }
  catch(error) { console.error('Xuất tĩnh thất bại. Kiểm tra DATABASE_PATH, schema SQLite và quyền ghi docs/.',error.code||error.name);process.exitCode=1; }
}

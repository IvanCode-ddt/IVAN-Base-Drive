import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { publicPost } from './public-post.js';
import {verifiedBackup} from './backup.js';
import {InputError} from './posts.js';
export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  const initialVersion=db.prepare('PRAGMA user_version').get().user_version;
  if(initialVersion>12){db.close();throw new Error('Database mới hơn ứng dụng.');}
  if(filename!==':memory:'&&initialVersion<12&&db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='posts'").get()){
    try{const saved=verifiedBackup(db,filename);console.log(`Verified pre-migration backup: ${saved.path} (${saved.postCount} posts; integrity ok)`);}catch(error){db.close();throw error;}
  }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('film','game','music','app','other')),
      description TEXT NOT NULL, introduction TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '',
      cover_url TEXT NOT NULL DEFAULT '', images TEXT NOT NULL DEFAULT '[]',
      attachment_url TEXT NOT NULL DEFAULT '', drive_file_id TEXT NOT NULL DEFAULT '', media_url TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('draft','published')),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    ); CREATE INDEX IF NOT EXISTS posts_status_updated ON posts(status, updated_at DESC);`);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 12) { db.close(); throw new Error('Database mới hơn phiên bản ứng dụng. Không tự động hạ cấp.'); }
  if (version < 2) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE IF NOT EXISTS post_drive_files (
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        file_id TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', mime_type TEXT NOT NULL DEFAULT '',
        size TEXT, modified_time TEXT NOT NULL DEFAULT '', web_url TEXT NOT NULL DEFAULT '',
        sharing_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(sharing_confirmed IN (0,1)),
        confirmed_by TEXT, confirmed_at TEXT, linked_at TEXT NOT NULL,
        PRIMARY KEY(post_id,file_id)
      );
      INSERT OR IGNORE INTO post_drive_files(post_id,file_id,linked_at)
        SELECT id,drive_file_id,updated_at FROM posts WHERE drive_file_id <> '';
      PRAGMA user_version=2; COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  if (version < 3) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`ALTER TABLE post_drive_files ADD COLUMN download_url TEXT NOT NULL DEFAULT '';
        ALTER TABLE post_drive_files ADD COLUMN resource_key TEXT NOT NULL DEFAULT '';
        ALTER TABLE post_drive_files ADD COLUMN can_download INTEGER CHECK(can_download IN (0,1));
        ALTER TABLE post_drive_files ADD COLUMN sharing_access TEXT NOT NULL DEFAULT 'unknown';
        ALTER TABLE post_drive_files ADD COLUMN metadata_checked_at TEXT NOT NULL DEFAULT '';
        PRAGMA user_version=3; COMMIT;`);
    } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  db.exec('PRAGMA foreign_keys=ON');
  if(version<4){
    db.exec('BEGIN IMMEDIATE');
    try{
      if(!db.prepare('PRAGMA table_info(posts)').all().some(column=>column.name==='deleted_at'))db.exec('ALTER TABLE posts ADD COLUMN deleted_at TEXT');
      db.exec('CREATE INDEX IF NOT EXISTS posts_deleted ON posts(deleted_at); PRAGMA user_version=4; COMMIT;');
    }catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<5){
    db.exec('BEGIN IMMEDIATE');
    try{
      const names=db.prepare('PRAGMA table_info(posts)').all().map(column=>column.name);
      if(!names.includes('is_pinned'))db.exec('ALTER TABLE posts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0 CHECK(is_pinned IN (0,1))');
      if(!names.includes('pin_order'))db.exec('ALTER TABLE posts ADD COLUMN pin_order INTEGER NOT NULL DEFAULT 0 CHECK(pin_order BETWEEN 0 AND 9999)');
      db.exec('CREATE INDEX IF NOT EXISTS posts_pinned ON posts(is_pinned,pin_order); PRAGMA user_version=5; COMMIT;');
    }catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<6){
    db.exec('BEGIN IMMEDIATE');
    try{
      db.exec(`CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,source_key TEXT NOT NULL,source_row INTEGER NOT NULL,received_at TEXT NOT NULL,
        type TEXT NOT NULL,title TEXT NOT NULL,detail TEXT NOT NULL,reference_url TEXT NOT NULL,contact_email TEXT NOT NULL,
        processing_status TEXT NOT NULL DEFAULT 'unread' CHECK(processing_status IN ('unread','read','processing','done')),
        first_synced_at TEXT NOT NULL,last_synced_at TEXT NOT NULL,status_updated_at TEXT);
        CREATE INDEX IF NOT EXISTS feedback_source ON feedback(source_key,received_at);
        CREATE TABLE IF NOT EXISTS feedback_sync_state(source_key TEXT PRIMARY KEY,last_synced_at TEXT NOT NULL,row_count INTEGER NOT NULL);
        PRAGMA user_version=6; COMMIT;`);
    }catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  const linkedFiles = id => db.prepare('SELECT * FROM post_drive_files WHERE post_id=? ORDER BY linked_at,file_id').all(id);
  if(version<7){
    db.exec('BEGIN IMMEDIATE');try{
      if(!db.prepare('PRAGMA table_info(posts)').all().some(column=>column.name==='is_spotlight'))db.exec('ALTER TABLE posts ADD COLUMN is_spotlight INTEGER NOT NULL DEFAULT 0 CHECK(is_spotlight IN (0,1))');
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS posts_spotlight ON posts(is_spotlight) WHERE is_spotlight=1 AND deleted_at IS NULL; PRAGMA user_version=7; COMMIT;');
    }catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<8){
    db.exec('BEGIN IMMEDIATE');try{
      if(!db.prepare('PRAGMA table_info(posts)').all().some(column=>column.name==='metadata'))db.exec("ALTER TABLE posts ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata) AND json_type(metadata)='object')");
      db.exec('PRAGMA user_version=8; COMMIT;');
    }catch(error){db.exec('ROLLBACK');db.close();throw error;}
  }
  if(version<9){db.exec('BEGIN IMMEDIATE');try{
    if(!db.prepare('PRAGMA table_info(posts)').all().some(column=>column.name==='media_sources'))db.exec("ALTER TABLE posts ADD COLUMN media_sources TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(media_sources) AND json_type(media_sources)='array')");
    db.exec('PRAGMA user_version=9; COMMIT;');
  }catch(error){db.exec('ROLLBACK');db.close();throw error;}}
  if(version<10){db.exec('BEGIN IMMEDIATE');try{
    db.exec(`CREATE TABLE IF NOT EXISTS highlight_settings(
      id INTEGER PRIMARY KEY CHECK(id=1),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
      interval_seconds INTEGER NOT NULL DEFAULT 6 CHECK(interval_seconds BETWEEN 3 AND 20)
    );
    CREATE TABLE IF NOT EXISTS highlight_slides(
      post_id TEXT PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 19),
      enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
    );
    INSERT OR IGNORE INTO highlight_settings(id,enabled,interval_seconds) VALUES(1,1,6);
    INSERT OR IGNORE INTO highlight_slides(post_id,position,enabled)
      SELECT id,0,1 FROM posts WHERE is_spotlight=1 AND status='published' AND deleted_at IS NULL;
    UPDATE posts SET is_spotlight=0 WHERE is_spotlight=1;
    PRAGMA user_version=10; COMMIT;`);
  }catch(error){db.exec('ROLLBACK');db.close();throw error;}}
  if(version<11){db.exec('BEGIN IMMEDIATE');try{
    const names=db.prepare('PRAGMA table_info(posts)').all().map(column=>column.name);
    if(!names.includes('minimum_requirements'))db.exec("ALTER TABLE posts ADD COLUMN minimum_requirements TEXT NOT NULL DEFAULT ''");
    if(!names.includes('recommended_requirements'))db.exec("ALTER TABLE posts ADD COLUMN recommended_requirements TEXT NOT NULL DEFAULT ''");
    db.exec('PRAGMA user_version=11; COMMIT;');
  }catch(error){db.exec('ROLLBACK');db.close();throw error;}}
  if(version<12){db.exec('BEGIN IMMEDIATE');try{
    const names=db.prepare('PRAGMA table_info(posts)').all().map(column=>column.name);
    if(!names.includes('install_size'))db.exec("ALTER TABLE posts ADD COLUMN install_size TEXT NOT NULL DEFAULT ''");
    if(!names.includes('operating_systems'))db.exec("ALTER TABLE posts ADD COLUMN operating_systems TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(operating_systems) AND json_type(operating_systems)='array')");
    db.exec('PRAGMA user_version=12; COMMIT;');
  }catch(error){db.exec('ROLLBACK');db.close();throw error;}}
  const decode = row => row ? { ...row, images: JSON.parse(row.images),metadata:JSON.parse(row.metadata),media_sources:JSON.parse(row.media_sources),operating_systems:JSON.parse(row.operating_systems), drive_files: linkedFiles(row.id) } : null;
  const columns = ['slug','title','category','description','introduction','instructions','cover_url','images','attachment_url','drive_file_id','media_url','status','is_pinned','pin_order','is_spotlight','metadata','media_sources','minimum_requirements','recommended_requirements','install_size','operating_systems'];
  const values = post => columns.map(key => ['images','metadata','media_sources','operating_systems'].includes(key) ? JSON.stringify(post[key]) : post[key]);
  const pinFields=(post,old)=>{
    const is_spotlight=0;
    const is_pinned=post.is_pinned??old?.is_pinned??0,pin_order=post.pin_order??old?.pin_order??0;
    if(is_pinned===1&&(pin_order<1||pin_order>20))throw new InputError('Vị trí ghim phải từ 1 đến 20.');
    if(is_pinned===1){
      const conflict=db.prepare('SELECT title FROM posts WHERE is_pinned=1 AND pin_order=? AND deleted_at IS NULL AND id<>?').get(pin_order,old?.id||'');
      if(conflict)throw new InputError(`Vị trí ghim ${pin_order} đã có bài sử dụng: “${conflict.title}”. Chọn số khác.`);
    }
    if(is_pinned===1&&db.prepare('SELECT COUNT(*) AS n FROM posts WHERE is_pinned=1 AND deleted_at IS NULL AND id<>?').get(old?.id||'').n>=5)throw new InputError('Tối đa 5 bài ghim. Hãy bỏ ghim một bài trước.');
    return{...post,is_pinned,pin_order,is_spotlight,metadata:post.metadata??old?.metadata??{},media_sources:post.media_sources??old?.media_sources??[],minimum_requirements:Object.hasOwn(post,'minimum_requirements')?post.minimum_requirements:old?.minimum_requirements??'',recommended_requirements:Object.hasOwn(post,'recommended_requirements')?post.recommended_requirements:old?.recommended_requirements??'',install_size:Object.hasOwn(post,'install_size')?post.install_size:old?.install_size??'',operating_systems:post.operating_systems??old?.operating_systems??[]};
  };
  return {
    close: () => db.close(),
    linkedFiles,
    publicPost,
    feedbackState:key=>db.prepare('SELECT last_synced_at,row_count FROM feedback_sync_state WHERE source_key=?').get(key)||null,
    highlightConfig({publicOnly=false}={}){
      const settings=db.prepare('SELECT enabled,interval_seconds FROM highlight_settings WHERE id=1').get()||{enabled:1,interval_seconds:6};
      const slides=db.prepare(`SELECT h.post_id,h.position,h.enabled,p.status,p.deleted_at
        FROM highlight_slides h JOIN posts p ON p.id=h.post_id
        ${publicOnly?"WHERE h.enabled=1 AND p.status='published' AND p.deleted_at IS NULL":''}
        ORDER BY h.position,h.post_id`).all();
      return{enabled:settings.enabled===1,interval_seconds:settings.interval_seconds,slides:slides.map(slide=>({
        post_id:slide.post_id,position:slide.position,enabled:slide.enabled===1,
        ...(publicOnly?{}:{status:slide.status,deleted_at:slide.deleted_at})
      }))};
    },
    saveHighlightConfig(config){
      db.exec('BEGIN IMMEDIATE');try{
        for(const slide of config.slides){
          const post=db.prepare("SELECT id FROM posts WHERE id=? AND status='published' AND deleted_at IS NULL").get(slide.post_id);
          if(!post)throw new InputError('Chỉ thêm được bài viết Published còn hoạt động vào Highlight.');
        }
        db.prepare('UPDATE highlight_settings SET enabled=?,interval_seconds=? WHERE id=1').run(Number(config.enabled),config.interval_seconds);
        db.prepare('DELETE FROM highlight_slides').run();
        const insert=db.prepare('INSERT INTO highlight_slides(post_id,position,enabled) VALUES(?,?,?)');
        config.slides.forEach((slide,position)=>insert.run(slide.post_id,position,Number(slide.enabled)));
        const saved=this.highlightConfig();db.exec('COMMIT');return saved;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    syncFeedback(key,rows){
      db.exec('BEGIN IMMEDIATE');try{
        const now=new Date().toISOString(),statement=db.prepare(`INSERT INTO feedback(id,source_key,source_row,received_at,type,title,detail,reference_url,contact_email,first_synced_at,last_synced_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET source_row=excluded.source_row,last_synced_at=excluded.last_synced_at`);
        for(const row of rows)statement.run(row.id,key,row.source_row,row.received_at,row.type,row.title,row.detail,row.reference_url,row.contact_email,now,now);
        db.prepare('INSERT INTO feedback_sync_state VALUES(?,?,?) ON CONFLICT(source_key) DO UPDATE SET last_synced_at=excluded.last_synced_at,row_count=excluded.row_count').run(key,now,rows.length);
        db.exec('COMMIT');return{last_synced_at:now,row_count:rows.length};
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    listFeedback({search='',status='',type='',offset=0}={}){
      const clauses=[],params=[];
      if(search){clauses.push("(title LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\' OR contact_email LIKE ? ESCAPE '\\')");const value='%'+search.replace(/[\\%_]/g,'\\$&')+'%';params.push(value,value,value);}
      if(status){clauses.push('processing_status=?');params.push(status);}if(type){clauses.push('type=?');params.push(type);}
      const where=clauses.length?'WHERE '+clauses.join(' AND '):'';
      return{items:db.prepare(`SELECT * FROM feedback ${where} ORDER BY first_synced_at DESC,id LIMIT 100 OFFSET ?`).all(...params,offset),total:db.prepare(`SELECT COUNT(*) AS n FROM feedback ${where}`).get(...params).n};
    },
    feedbackStatus(id,status){return db.prepare('UPDATE feedback SET processing_status=?,status_updated_at=? WHERE id=? RETURNING *').get(status,new Date().toISOString(),id)||null;},
    saveWithFiles(post, id, files, adminEmail) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const old=id?this.get(id):null,beforeFiles=id?linkedFiles(id):[];
        const saved=id?this.update(id,post):this.create(post);
        if(!saved){db.exec('ROLLBACK');return null;}
        if(files!==undefined){
          const selected=new Set(files.map(file=>file.file_id));
          for(const old of linkedFiles(saved.id))if(!selected.has(old.file_id))this.unlinkFile(saved.id,old.file_id);
          for(const file of files){
            this.linkFile(saved.id,file);
            if(file.requested_sharing!==undefined)this.confirmFile(saved.id,file.file_id,file.requested_sharing?file:null,adminEmail);
          }
        }
        if(old&&JSON.stringify(beforeFiles)!==JSON.stringify(linkedFiles(saved.id))&&this.get(saved.id).updated_at===old.updated_at)
          db.prepare('UPDATE posts SET updated_at=? WHERE id=?').run(new Date().toISOString(),saved.id);
        const result=this.get(saved.id);db.exec('COMMIT');return result;
      }catch(error){db.exec('ROLLBACK');error.postSaveRolledBack=true;throw error;}
    },
    linkFile(postId, file) {
      db.prepare(`INSERT INTO post_drive_files(post_id,file_id,name,mime_type,size,modified_time,web_url,download_url,resource_key,can_download,sharing_access,metadata_checked_at,linked_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(post_id,file_id) DO NOTHING`).run(postId,file.file_id,file.name,file.mime_type,file.size,file.modified_time,file.web_url,file.download_url||'',file.resource_key||'',file.can_download??null,file.sharing_access||'unknown',file.metadata_checked_at||'',new Date().toISOString());
      return linkedFiles(postId);
    },
    confirmFile(postId, fileId, file, email) {
      if (file) db.prepare(`UPDATE post_drive_files SET name=?,mime_type=?,size=?,modified_time=?,web_url=?,download_url=?,resource_key=?,can_download=?,sharing_access=?,metadata_checked_at=?,sharing_confirmed=1,confirmed_by=?,confirmed_at=? WHERE post_id=? AND file_id=?`).run(file.name,file.mime_type,file.size,file.modified_time,file.web_url,file.download_url||'',file.resource_key||'',file.can_download??null,file.sharing_access||'unknown',file.metadata_checked_at||'',email,new Date().toISOString(),postId,fileId);
      else db.prepare('UPDATE post_drive_files SET sharing_confirmed=0,confirmed_by=NULL,confirmed_at=NULL WHERE post_id=? AND file_id=?').run(postId,fileId);
      return linkedFiles(postId);
    },
    unlinkFile(postId, fileId) { db.prepare('DELETE FROM post_drive_files WHERE post_id=? AND file_id=?').run(postId,fileId); },
    createDriveDraft(post, file) {
      db.exec('BEGIN IMMEDIATE');
      try { const saved=this.create(post); this.linkFile(saved.id,file); db.exec('COMMIT'); return this.get(saved.id); }
      catch(error) { db.exec('ROLLBACK'); throw error; }
    },
    list: (publishedOnly = false) => db.prepare(`SELECT * FROM posts WHERE deleted_at IS NULL ${publishedOnly ? "AND status='published'" : ''} ORDER BY updated_at DESC, id`).all().map(decode),
    trash:()=>db.prepare('SELECT * FROM posts WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC').all().map(decode),
    get: (id,includeDeleted=false) => decode(db.prepare(`SELECT * FROM posts WHERE id=? ${includeDeleted?'':'AND deleted_at IS NULL'}`).get(id)),
    published: slug => decode(db.prepare("SELECT * FROM posts WHERE slug=? AND status='published' AND deleted_at IS NULL").get(slug)),
    softDelete(id){const now=new Date().toISOString();return db.prepare('UPDATE posts SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL').run(now,now,id).changes>0;},
    restore(id){const old=this.get(id,true);if(old?.deleted_at)pinFields(old,old);return db.prepare('UPDATE posts SET deleted_at=NULL,updated_at=? WHERE id=? AND deleted_at IS NOT NULL').run(new Date().toISOString(),id).changes>0;},
    setPin(id,is_pinned,pin_order){
      db.exec('BEGIN IMMEDIATE');try{const old=this.get(id);if(!old){db.exec('ROLLBACK');return null;}const next=pinFields({...old,is_pinned,pin_order},old);
        if(next.is_pinned===old.is_pinned&&next.pin_order===old.pin_order){db.exec('COMMIT');return old;}
        db.prepare('UPDATE posts SET is_pinned=?,pin_order=?,is_spotlight=?,updated_at=? WHERE id=?').run(next.is_pinned,next.pin_order,next.is_spotlight,new Date().toISOString(),id);
        const result=this.get(id);db.exec('COMMIT');return result;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
    purge(id){return db.prepare('DELETE FROM posts WHERE id=? AND deleted_at IS NOT NULL').run(id).changes>0;},
    create(post) {
      post=pinFields(post);
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare(`INSERT INTO posts (id,${columns.join(',')},created_at,updated_at) VALUES (${Array(columns.length+3).fill('?').join(',')})`).run(id,...values(post),now,now);
      return this.get(id);
    },
    update(id, post) {
      const old=this.get(id);if(!old)return null;post=pinFields(post,old);
      if(values(post).every((value,index)=>value===values(old)[index]))return old;
      const result = db.prepare(`UPDATE posts SET ${columns.map(key => `${key}=?`).join(',')},updated_at=? WHERE id=? AND deleted_at IS NULL`).run(...values(post),new Date().toISOString(),id);
      return result.changes ? this.get(id) : null;
    }
  };
}

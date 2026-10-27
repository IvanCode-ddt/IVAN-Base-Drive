import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { publicPost } from './public-post.js';
export function openDatabase(filename) {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
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
  if (version > 3) { db.close(); throw new Error('Database mới hơn phiên bản ứng dụng. Không tự động hạ cấp.'); }
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
  const linkedFiles = id => db.prepare('SELECT * FROM post_drive_files WHERE post_id=? ORDER BY linked_at,file_id').all(id);
  const decode = row => row ? { ...row, images: JSON.parse(row.images), drive_files: linkedFiles(row.id) } : null;
  const columns = ['slug','title','category','description','introduction','instructions','cover_url','images','attachment_url','drive_file_id','media_url','status'];
  const values = post => columns.map(key => key === 'images' ? JSON.stringify(post.images) : post[key]);
  return {
    close: () => db.close(),
    linkedFiles,
    publicPost,
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
    list: (publishedOnly = false) => db.prepare(`SELECT * FROM posts ${publishedOnly ? "WHERE status='published'" : ''} ORDER BY updated_at DESC, id`).all().map(decode),
    get: id => decode(db.prepare('SELECT * FROM posts WHERE id=?').get(id)),
    published: slug => decode(db.prepare("SELECT * FROM posts WHERE slug=? AND status='published'").get(slug)),
    create(post) {
      const id = randomUUID(), now = new Date().toISOString();
      db.prepare(`INSERT INTO posts (id,${columns.join(',')},created_at,updated_at) VALUES (${Array(15).fill('?').join(',')})`).run(id,...values(post),now,now);
      return this.get(id);
    },
    update(id, post) {
      const result = db.prepare(`UPDATE posts SET ${columns.map(key => `${key}=?`).join(',')},updated_at=? WHERE id=?`).run(...values(post),new Date().toISOString(),id);
      return result.changes ? this.get(id) : null;
    }
  };
}

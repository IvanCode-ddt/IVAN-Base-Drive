import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
const fingerprint=db=>{
  const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('posts','post_drive_files') ORDER BY name").all();
  return createHash('sha256').update(JSON.stringify(tables.map(({name})=>[name,db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]))).digest('hex');
};
export function verifiedBackup(db,filename){
 const directory=path.join(path.dirname(filename),'backups');mkdirSync(directory,{recursive:true});
 const destination=path.join(directory,`pre-v4-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.sqlite`);
 db.prepare('VACUUM INTO ?').run(destination);
 const copy=new DatabaseSync(destination,{readOnly:true});
 try{
  const integrity=copy.prepare('PRAGMA integrity_check').get().integrity_check;
  const hash=fingerprint(copy);if(integrity!=='ok'||hash!==fingerprint(db))throw new Error('Backup validation failed; migration refused.');
  const report={backup:path.basename(destination),integrity,sha256:hash,postCount:copy.prepare('SELECT COUNT(*) AS n FROM posts').get().n,createdAt:new Date().toISOString()};
  writeFileSync(destination+'.verified.json',JSON.stringify(report,null,2));
  return{...report,path:destination};
 }finally{copy.close();}
}

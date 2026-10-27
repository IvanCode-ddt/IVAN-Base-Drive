import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { verifiedBackup } from '../server/backup.js';
const filename=path.resolve(process.env.DATABASE_PATH||'data/ivan.sqlite');
const db=new DatabaseSync(filename,{readOnly:true});
try{console.log(JSON.stringify(verifiedBackup(db,filename),null,2));}finally{db.close();}

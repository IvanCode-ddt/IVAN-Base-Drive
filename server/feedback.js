import {createHash} from 'node:crypto';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {JWT} from 'google-auth-library';
const root=fileURLToPath(new URL('../',import.meta.url));
const SCOPE='https://www.googleapis.com/auth/spreadsheets.readonly';
const digest=value=>createHash('sha256').update(value).digest('hex');
export class FeedbackError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
const fail=(status,code,message)=>{throw new FeedbackError(status,code,message);};
export function feedbackSource(config){return digest(JSON.stringify([config.spreadsheetId||'',config.sheetName||'']));}
export function parseFeedback(values,key){
 if(!Array.isArray(values)||values.length>10001)fail(400,'FEEDBACK_LIMIT','Sheet vượt giới hạn 10.000 phản hồi. Tách/lưu trữ dữ liệu cũ trước khi đồng bộ.');
 if(!values.length)fail(400,'FEEDBACK_HEADERS','Sheet chưa có hàng tiêu đề. Hãy liên kết Google Form trước.');
 const normalize=value=>String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').toLowerCase().trim();
 const headers=values[0].map(normalize),names=['loai','tieu de','noi dung chi tiet','lien ket tham khao','email lien he'];
 const indices=names.map(name=>headers.indexOf(name)),time=headers.findIndex(name=>['timestamp','dau thoi gian'].includes(name));
 if(time<0||indices.some((index,i)=>index<0||headers.lastIndexOf(names[i])!==index))fail(400,'FEEDBACK_HEADERS','Cột Sheet không khớp. Cần Dấu thời gian/Timestamp, Loại, Tiêu đề, Nội dung chi tiết, Liên kết tham khảo, Email liên hệ.');
 const occurrences=new Map(),rows=[];
 for(let i=1;i<values.length;i++){
  const row=values[i];if(!Array.isArray(row)||row.every(value=>String(value).trim()===''))continue;
  const cells=[time,...indices].map(index=>String(row[index]??'').trim()),limits=[120,120,200,10000,2048,254];
  if(cells.some((value,index)=>value.length>limits[index])||!cells[0]||!cells[1]||!cells[2]||!cells[3])fail(400,'FEEDBACK_INPUT',`Phản hồi hàng ${i+1} thiếu dữ liệu hoặc vượt giới hạn. Chưa cập nhật hộp góp ý.`);
  const hash=digest(JSON.stringify([key,...cells])),occurrence=occurrences.get(hash)||0;occurrences.set(hash,occurrence+1);
  rows.push({id:digest(hash+':'+occurrence),source_row:i+1,received_at:cells[0],type:cells[1],title:cells[2],detail:cells[3],reference_url:cells[4],contact_email:cells[5]});
 }
 return rows;
}
async function requestSheet(config){
 const filename=path.resolve(config.serviceAccountFile),relative=path.relative(root,filename);
 if(!relative.startsWith('..')&&!path.isAbsolute(relative)&&!relative.startsWith('data'+path.sep))fail(400,'FEEDBACK_CREDENTIAL_PATH','Đặt credential ngoài source hoặc trong data/ (đã gitignore), không đặt trong docs/.');
 const info=await stat(filename);if(!info.isFile()||info.size>65536)fail(400,'FEEDBACK_CREDENTIAL','File service account không hợp lệ.');
 const credential=JSON.parse(await readFile(filename,'utf8'));
 if(credential.type!=='service_account'||typeof credential.private_key!=='string'||!credential.private_key.startsWith('-----BEGIN PRIVATE KEY-----')||!credential.client_email?.endsWith('.iam.gserviceaccount.com'))fail(400,'FEEDBACK_CREDENTIAL','Cần key JSON của service account riêng, không dùng OAuth Client Secret.');
 // Explicit opt-in only. Never reuse or expand the Google Admin/Drive OAuth scopes.
 const client=new JWT({email:credential.client_email,key:credential.private_key,scopes:[SCOPE]});
 const range=`'${config.sheetName.replace(/'/g,"''")}'!A1:Z10002`;
 const url=`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheetId)}/values/${encodeURIComponent(range)}`;
 const response=await client.request({url,params:{majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'},timeout:20000,retry:false});
 return response.data.values||[];
}
export function createFeedbackService({db,config={},transport=requestSheet}){
 const key=feedbackSource(config);let busy=false,state='ready',lastError='';
 const missing=()=>[!config.enabled&&'FEEDBACK_SHEETS_ENABLED=true (xác nhận dùng service account chỉ đọc)',!config.spreadsheetId&&'FEEDBACK_SPREADSHEET_ID',!config.sheetName&&'FEEDBACK_SHEET_NAME',!config.serviceAccountFile&&'FEEDBACK_SERVICE_ACCOUNT_FILE'].filter(Boolean);
 const status=()=>({state:missing().length?'not_configured':state,busy,missing:missing(),message:missing().length?'Chưa kết nối Google Sheets. Xem hướng dẫn FEEDBACK-SETUP.md.':lastError||'Dùng service account riêng chỉ đọc. Nhấn đồng bộ để kiểm tra quyền truy cập hiện tại.',lastSync:db.feedbackState(key)});
 return{status,async sync(){
  if(missing().length)fail(409,'FEEDBACK_NOT_CONFIGURED','Chưa cấu hình/cho phép kết nối Sheets. Xem FEEDBACK-SETUP.md.');
  if(busy)fail(409,'FEEDBACK_BUSY','Đang đồng bộ góp ý.');
  if(!/^[a-zA-Z0-9_-]{10,200}$/.test(config.spreadsheetId)||config.sheetName.length>100)fail(400,'FEEDBACK_CONFIG','Spreadsheet ID hoặc tên tab không hợp lệ.');
  busy=true;
  try{const rows=parseFeedback(await transport(config),key);db.syncFeedback(key,rows);state='connected';lastError='';return{...status(),busy:false,imported:rows.length};}
  catch(error){state='error';
   if(error instanceof FeedbackError){lastError=error.message;throw error;}
   const code=error.response?.status||error.code;
   lastError=code===401||code===403?'Sheets từ chối xác thực/quyền truy cập. Bật Sheets API, kiểm tra key và chia sẻ Sheet riêng cho service account với quyền Viewer.':code===404?'Không tìm thấy Sheet/tab hoặc chưa có quyền truy cập.':'Không đọc được Sheets. Kiểm tra mạng, cấu hình và key service account; dữ liệu cũ vẫn giữ nguyên.';
   fail(502,'FEEDBACK_UNAVAILABLE',lastError);
  }finally{busy=false;}
 }};
}
export function registerFeedbackRoutes(app,{db,config,csrf,transport}){
 const service=createFeedbackService({db,config:config.feedback,transport});
 app.get('/api/admin/feedback/status',(req,res)=>res.json(service.status()));
 app.post('/api/admin/feedback/sync',csrf,async(req,res)=>res.json(await service.sync()));
 app.get('/api/admin/feedback',(req,res)=>{
  const search=req.query.search||'',status=req.query.status||'',type=req.query.type||'',offset=Number(req.query.offset||0);
  if(typeof search!=='string'||search.length>200||typeof type!=='string'||type.length>120||!['','unread','read','processing','done'].includes(status)||!Number.isInteger(offset)||offset<0||offset>100000)fail(400,'FEEDBACK_INPUT','Bộ lọc góp ý không hợp lệ.');
  res.json(db.listFeedback({search,status,type,offset}));
 });
 app.patch('/api/admin/feedback/:id',csrf,(req,res)=>{
  if(!/^[a-f0-9]{64}$/.test(req.params.id)||!['unread','read','processing','done'].includes(req.body?.status))fail(400,'FEEDBACK_INPUT','Trạng thái góp ý không hợp lệ.');
  const row=db.feedbackStatus(req.params.id,req.body.status);row?res.json(row):res.status(404).json({error:'Không tìm thấy phản hồi.'});
 });
}

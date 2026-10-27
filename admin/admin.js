import { initEditor } from './editor.js?v=9';
import { initDrivePicker } from './drive-picker.js?v=9';
import { detailHTML } from '/js/content.js?v=9';
import {createPostActions} from './actions.js?v=9';
const $=s=>document.querySelector(s),form=$('#post-form');
let driveUI;
let csrf='',editingId=null,currentStatus='draft',dirty=false;
let loadedPost=null;
const message=(text,error=false)=>{$('#message').textContent=text;$('#message').dataset.error=String(error);};
const editorUI=initEditor({form,getCSRF:()=>csrf,onError:text=>message(text,true),onDirty:()=>{dirty=true;}});
driveUI=initDrivePicker({api,onDirty:()=>{dirty=true;}});
const postActions=createPostActions({api,onComplete:()=>{dirty=false;location.assign('/admin/');}});
$('#delete-post').addEventListener('click',()=>{if(loadedPost)postActions.open(loadedPost);});
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
 if(response.status===401){location.assign('/login');throw new Error('Phiên đăng nhập đã hết hạn.');}
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Yêu cầu không thành công.');return data;
}
function fill(post=null){
 form.reset();editingId=post?.id||null;currentStatus=post?.status||'draft';
 loadedPost=post;$('#delete-post').hidden=!post;
 if(post)for(const key of Object.keys(post)){const field=form.elements.namedItem(key);if(field)field.value=key==='images'?post.images.join('\n'):post[key];}
 $('#editor-title').textContent=post?'Chỉnh sửa bài viết':'Bài viết mới';$('#saved-info').textContent=post?`ID: ${post.id} · ${post.status} · Cập nhật: ${new Date(post.updated_at).toLocaleString('vi-VN')}`:'';
 $('#preview').hidden=true;dirty=false;driveUI.fill(post);editorUI.fill(post);
 const badge=$('#post-status');badge.textContent=post?(post.status==='published'?'Published · Đã xuất bản':'Draft · Bản nháp'):'Bài mới · Draft';badge.dataset.status=post?.status||'draft';
}
form.addEventListener('input',()=>{dirty=true;});
form.addEventListener('submit',async event=>{
 event.preventDefault();const intent=event.submitter?.value||'draft';
 if(form.querySelector('input[type=file]:disabled'))return message('Vui lòng chờ ảnh tải lên xong trước khi lưu hoặc xem trước.',true);
 const body=Object.fromEntries(new FormData(form));body.images=body.images.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);body.status=intent==='preview'?currentStatus:intent;
 body.drive_file_ids=driveUI.ids();
 body.cms_contract=2;
 body.drive_public_file_ids=driveUI.files().filter(file=>file.sharing_confirmed===1&&file.sharing_access==='anyone').map(file=>file.file_id);
 const buttons=[...form.querySelectorAll('button')],disabledState=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
 try{
  if(intent==='preview'){
   const post=await api('/api/admin/preview',{method:'POST',body:JSON.stringify(body)});post.drive_files=driveUI.files();$('#preview-content').innerHTML=detailHTML(post,{preview:true});$('#preview').hidden=false;$('#preview').scrollIntoView({behavior:'smooth'});message('Đang xem trước. Thay đổi chưa được lưu.');
  }else{
   const post=await api(editingId?`/api/admin/posts/${editingId}`:'/api/admin/posts',{method:editingId?'PUT':'POST',body:JSON.stringify(body)});
   const savedIds=new Set((post.drive_files||[]).map(file=>file.file_id));
   if(savedIds.size!==body.drive_file_ids.length||body.drive_file_ids.some(id=>!savedIds.has(id)))throw new Error('Danh sách file sau khi lưu không khớp. Giữ nguyên form; hãy tải lại phiên bản CMS và kiểm tra bài vừa lưu.');
   fill(post);const pending=post.drive_files.filter(file=>file.sharing_confirmed!==1||file.sharing_access==='restricted').length;
   message(`Đã lưu ${post.status==='published'?'bài xuất bản':'bản nháp'} cùng ${savedIds.size} file.${pending?` ${pending} file chưa được công khai; kiểm tra quyền và ô xác nhận chia sẻ.`:''}`);
  }
 }catch(error){message(error.message,true);}finally{buttons.forEach((b,index)=>b.disabled=disabledState[index]);}
});
$('#new-post').addEventListener('click',()=>{if(dirty&&!confirm('Bỏ các thay đổi chưa lưu?'))return;fill();message('Đang tạo bài viết mới.');});
$('#logout').addEventListener('click',async()=>{if(dirty&&!confirm('Đăng xuất và bỏ thay đổi chưa lưu?'))return;try{await api('/api/admin/logout',{method:'POST',body:'{}'});dirty=false;location.assign('/login');}catch(error){message(error.message,true);}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
try{const session=await api('/api/admin/session');if(session.saveContractVersion!==2)throw new Error('Backend đang chạy phiên bản cũ. Khởi động lại npm.cmd start rồi tải lại CMS trước khi lưu bài.');csrf=session.csrfToken;$('#admin-email').textContent=session.email;const edit=new URLSearchParams(location.search).get('edit');fill(edit?await api(`/api/admin/posts/${encodeURIComponent(edit)}`):null);form.removeAttribute('inert');}catch(error){message(error.message,true);}

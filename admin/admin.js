import { initDrive } from './drive.js?v=5';
import { detailHTML,escapeHTML,categoryName } from '/js/content.js?v=5';
const $=s=>document.querySelector(s),form=$('#post-form');
let driveUI;
let csrf='',editingId=null,currentStatus='draft',dirty=false;
const message=(text,error=false)=>{$('#message').textContent=text;$('#message').dataset.error=String(error);};
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
 if(response.status===401){location.assign('/login');throw new Error('Phiên đăng nhập đã hết hạn.');}
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Yêu cầu không thành công.');return data;
}
function fill(post=null){
 form.reset();editingId=post?.id||null;currentStatus=post?.status||'draft';
 if(post)for(const key of Object.keys(post)){const field=form.elements.namedItem(key);if(field)field.value=key==='images'?post.images.join('\n'):post[key];}
 $('#editor-title').textContent=post?'Chỉnh sửa bài viết':'Bài viết mới';$('#saved-info').textContent=post?`ID: ${post.id} · ${post.status} · Cập nhật: ${new Date(post.updated_at).toLocaleString('vi-VN')}`:'';
 $('#preview').hidden=true;dirty=false;driveUI?.showPost(post);
}
async function list(){const posts=await api('/api/admin/posts');$('#admin-list').innerHTML=posts.length?posts.map(p=>`<button type="button" data-id="${p.id}">${escapeHTML(p.title)}<small>${categoryName(p.category)} · ${p.status==='published'?'Đã xuất bản':'Bản nháp'}</small></button>`).join(''):'<p>Chưa có bài viết. Hãy tạo bài đầu tiên.</p>';}
form.addEventListener('input',()=>{dirty=true;});
form.addEventListener('submit',async event=>{
 event.preventDefault();const intent=event.submitter?.value||'draft';
 const body=Object.fromEntries(new FormData(form));body.images=body.images.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);body.status=intent==='preview'?currentStatus:intent;
 const buttons=[...form.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{
  if(intent==='preview'){
   const post=await api('/api/admin/preview',{method:'POST',body:JSON.stringify(body)});if(editingId)post.drive_files=await api(`/api/admin/posts/${editingId}/drive-files`);$('#preview-content').innerHTML=detailHTML(post,{preview:true});$('#preview').hidden=false;$('#preview').scrollIntoView({behavior:'smooth'});message('Đang xem trước. Thay đổi chưa được lưu.');
  }else{
   const post=await api(editingId?`/api/admin/posts/${editingId}`:'/api/admin/posts',{method:editingId?'PUT':'POST',body:JSON.stringify(body)});fill(post);await list();await driveUI?.targets();message(post.status==='published'?'Đã xuất bản bài viết.':'Đã lưu bản nháp.');
  }
 }catch(error){message(error.message,true);}finally{buttons.forEach(b=>b.disabled=false);}
});
$('#new-post').addEventListener('click',()=>{if(dirty&&!confirm('Bỏ các thay đổi chưa lưu?'))return;fill();message('Đang tạo bài viết mới.');});
$('#admin-list').addEventListener('click',async event=>{const b=event.target.closest('[data-id]');if(!b)return;if(dirty&&!confirm('Bỏ các thay đổi chưa lưu?'))return;try{fill(await api(`/api/admin/posts/${b.dataset.id}`));message('');}catch(error){message(error.message,true);}});
$('#logout').addEventListener('click',async()=>{if(dirty&&!confirm('Đăng xuất và bỏ thay đổi chưa lưu?'))return;try{await api('/api/admin/logout',{method:'POST',body:'{}'});dirty=false;location.assign('/login');}catch(error){message(error.message,true);}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
try{const session=await api('/api/admin/session');csrf=session.csrfToken;$('#admin-email').textContent=session.email;await list();driveUI=await initDrive({api,openDraft:fill,refreshPosts:list,beforeDraft:()=>!dirty||confirm('Bỏ các thay đổi chưa lưu để mở bài Draft mới?')});fill();}catch(error){message(error.message,true);}

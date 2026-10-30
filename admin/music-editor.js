import { initDrivePicker } from './drive-picker.js?v=9';
import { slugify } from './editor.js?v=9';
import { imageURL,isDownloadArchive } from '/js/media.js?v=18';
import { escapeHTML } from '/js/content.js?v=19';
import { createNotifications } from './notifications.js';

const $=selector=>document.querySelector(selector),form=$('#music-form'),notifications=createNotifications();
let csrf='',editingId=null,loadedPost=null,loadedAlbum=null,selectedBundleFileIds=new Set(),dirty=false;
function message(text,error=false){$('#music-message').textContent=text;$('#music-message').dataset.error=String(error);}
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
 if(response.status===401){location.assign('/login');throw new Error('Phiên đăng nhập đã hết hạn.');}
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Yêu cầu không thành công.');return data;
}
function setDirty(){dirty=true;}
function renderPackages(){
 const files=driveUI.files().filter(isDownloadArchive),selected=new Set(driveUI.ids());
 $('#album-package-files').innerHTML=files.length?files.map(file=>`<label class="album-package-option"><input type="checkbox" data-package="${escapeHTML(file.file_id)}" ${selectedBundleFileIds.has(file.file_id)&&selected.has(file.file_id)?'checked':''}><span><strong>${escapeHTML(file.name||file.file_id)}</strong><small>${file.sharing_confirmed===1&&file.sharing_access==='anyone'?'Đã xác nhận công khai':'Chưa xác nhận công khai · chỉ quản trị thấy file'}</small></span></label>`).join(''):'<p class="field-help">Chưa có file ZIP/RAR/7z được chọn. Dùng nút phía trên để thêm file.</p>';
}
function renderCover(){
 const target=$('#cover-preview');target.replaceChildren();const value=form.elements.cover_url.value;if(!value)return;
 const image=document.createElement('img');image.src=imageURL(value);image.alt='Ảnh bìa album';image.loading='lazy';image.className='music-cover-preview';target.append(image);
}
const driveUI=initDrivePicker({api,displayFilter:isDownloadArchive,onDirty:()=>{setDirty();renderPackages();}});
function fill(album=null){
 form.reset();editingId=album?.post_id||null;loadedAlbum=album;loadedPost=album?.post||null;
 const post=loadedPost;form.elements.title.value=post?.title||'';form.elements.slug.value=post?.slug||'';
 form.elements.description.value=post?.description||'';form.elements.artist.value=album?.artist||'';
 form.elements.cover_url.value=post?.cover_url||'';form.elements.status.value=post?.status||'draft';
 selectedBundleFileIds=new Set(album?.bundle_file_ids?.length?album.bundle_file_ids:album?.bundle_file_id?[album.bundle_file_id]:[]);
 $('#editor-title').textContent=album?'Chỉnh sửa album':'Album nhạc mới';
 $('#album-status').textContent=post?.status==='published'?'Published':'Bản nháp';$('#album-status').dataset.status=post?.status||'draft';
 $('#saved-info').textContent=post?`ID: ${post.id} · ${post.status} · Cập nhật: ${new Date(post.updated_at).toLocaleString('vi-VN')}`:'';
 driveUI.fill(post);renderPackages();renderCover();dirty=false;
}
form.elements.title.addEventListener('input',()=>{if(!editingId)form.elements.slug.value=slugify(form.elements.title.value);setDirty();});
$('#album-package-files').addEventListener('change',event=>{
 const checkbox=event.target.closest('[data-package]');if(!checkbox)return;
 if(checkbox.checked)selectedBundleFileIds.add(checkbox.dataset.package);else selectedBundleFileIds.delete(checkbox.dataset.package);
 setDirty();
});
form.addEventListener('input',event=>{if(!event.target.matches('#album-package-files *'))setDirty();});
$('#cover-upload').addEventListener('change',async event=>{
 const input=event.target,file=input.files[0];if(!file)return;
 if(file.size>5*1024*1024){message('Ảnh bìa tối đa 5 MB.',true);return;}
 input.disabled=true;
 try{const response=await fetch('/api/admin/images',{method:'POST',headers:{'Content-Type':file.type,'X-CSRF-Token':csrf},body:file});const data=await response.json();if(!response.ok)throw new Error(data.error||'Không tải ảnh lên được.');form.elements.cover_url.value=data.path;renderCover();setDirty();}
 catch(error){message(error.message,true);notifications.error(error.message);}
 finally{input.disabled=false;input.value='';}
});
form.addEventListener('submit',async event=>{
 event.preventDefault();const intent=event.submitter?.value||'draft';
 const post={...(loadedPost||{}),title:form.elements.title.value,slug:form.elements.slug.value,category:'music',
  description:form.elements.description.value,introduction:loadedPost?.introduction||'',instructions:loadedPost?.instructions||'',
  cover_url:form.elements.cover_url.value,images:loadedPost?.images||[],attachment_url:loadedPost?.attachment_url||'',
  drive_file_id:loadedPost?.drive_file_id||'',media_url:loadedPost?.media_url||'',status:intent};
 const bundleFileIds=[...selectedBundleFileIds].filter(id=>driveUI.ids().includes(id));
 const albumData={artist:form.elements.artist.value,release_year:loadedAlbum?.release_year??null,genre:loadedAlbum?.genre||'',bundle_file_ids:bundleFileIds,bundle_file_id:bundleFileIds[0]||''};
 const body={cms_contract:2,post,drive_file_ids:driveUI.ids(),
  drive_public_file_ids:driveUI.files().filter(file=>file.sharing_confirmed===1&&file.sharing_access==='anyone').map(file=>file.file_id),
  album:albumData};
 const buttons=[...form.querySelectorAll('button')],disabled=buttons.map(button=>button.disabled);buttons.forEach(button=>button.disabled=true);
 try{
  const saved=await api(editingId?`/api/admin/music/albums/${editingId}`:'/api/admin/music/albums',{method:editingId?'PUT':'POST',body:JSON.stringify(body)});
  fill(saved);message(`Đã lưu album “${saved.post.title}” ở trạng thái ${saved.post.status}. Chạy export để cập nhật bản tĩnh.`);
  notifications.success(`${saved.post.status==='published'?'Đã xuất bản':'Đã lưu bản nháp'} album: ${saved.post.title}.`);
 }catch(error){message(error.message,true);notifications.error(error.message);}
 finally{buttons.forEach((button,index)=>button.disabled=disabled[index]);}
});
$('#logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:'{}'});dirty=false;location.assign('/login');}catch(error){message(error.message,true);notifications.error(error.message);}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
try{
 const session=await api('/api/admin/session');if(session.contentSchemaVersion!==13)throw new Error('Backend đang chạy phiên bản cũ. Khởi động lại IVAN Admin rồi tải lại trình soạn album.');
 csrf=session.csrfToken;$('#admin-email').textContent=session.email;
 const edit=new URLSearchParams(location.search).get('edit'),album=edit?await api(`/api/admin/music/albums/${encodeURIComponent(edit)}`):null;
 if(edit&&!album)throw new Error('Không tìm thấy album.');
 fill(album);form.removeAttribute('inert');
}catch(error){message(error.message,true);notifications.error(error.message);}

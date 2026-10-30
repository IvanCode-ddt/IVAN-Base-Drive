import { initEditor } from './editor.js?v=9';
import { initDrivePicker } from './drive-picker.js?v=9';
import { detailHTML } from '/js/content.js?v=16';
import {createPostActions} from './actions.js?v=10';
import {CONTENT_FIELDS,MEDIA_TYPES} from '/js/media.js?v=16';
import {createNotifications} from './notifications.js';
const $=s=>document.querySelector(s),form=$('#post-form');
const notifications=createNotifications();
let driveUI;
let csrf='',editingId=null,currentStatus='draft',dirty=false,pinPosts=[];
let loadedPost=null;
let metadataDraft={};
let mediaDraft=[];
const basicMetadataKeys=new Set(['size_label','content_updated_at','platform']);
function renderMediaSources(){
 const container=$('#media-source-rows');container.replaceChildren();
 mediaDraft.forEach((source,index)=>{
  const fieldset=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=`Nguồn ${index+1}`;fieldset.append(legend);
  const field=(title,element)=>{const label=document.createElement('label');label.textContent=title;label.append(element);fieldset.append(label);return element;};
  const kind=field('Loại nguồn',document.createElement('select'));for(const[value,label]of [['direct','HTML5 trực tiếp'],['drive_preview','Google Drive preview']]){const option=document.createElement('option');option.value=value;option.textContent=label;kind.append(option);}kind.value=source.kind;
  const name=field('Tên hiển thị',document.createElement('input'));name.value=source.label;name.maxLength=120;
  const url=field('URL HTTPS',document.createElement('input'));url.type='url';url.maxLength=2048;url.value=source.url;
  const mime=field('MIME type (chỉ HTML5)',document.createElement('select'));for(const value of MEDIA_TYPES){const option=document.createElement('option');option.value=value;option.textContent=value;mime.append(option);}mime.value=source.mime_type||'';mime.disabled=source.kind==='drive_preview';
  const consent=field('Tôi có quyền chia sẻ/phân phối và cho phép nhúng công khai nguồn này',document.createElement('input'));consent.type='checkbox';consent.checked=!!source.sharing_confirmed;
  consent.closest('label').classList.add('content-option');
  kind.addEventListener('change',()=>{source.kind=kind.value;mime.disabled=kind.value==='drive_preview';});name.addEventListener('input',()=>source.label=name.value);url.addEventListener('input',()=>source.url=url.value);mime.addEventListener('change',()=>source.mime_type=mime.value);consent.addEventListener('change',()=>source.sharing_confirmed=consent.checked);
  const remove=document.createElement('button');remove.type='button';remove.className='secondary-button';remove.textContent='Gỡ nguồn';remove.addEventListener('click',()=>{mediaDraft.splice(index,1);renderMediaSources();dirty=true;});fieldset.append(remove);container.append(fieldset);
 });
}
$('#add-media-source').addEventListener('click',()=>{if(mediaDraft.length>=10)return message('Tối đa 10 nguồn phát.',true);mediaDraft.push({kind:'direct',label:'',url:'',mime_type:form.elements.category.value==='music'?'audio/mpeg':'video/mp4',sharing_confirmed:false});renderMediaSources();dirty=true;});
function captureMetadata(){for(const input of form.querySelectorAll('[data-metadata-key]'))metadataDraft[input.dataset.metadataKey]=input.value;}
function renderMetadata(){
 const container=$('#metadata-fields');container.replaceChildren();
 for(const[key,title,max,type]of CONTENT_FIELDS[form.elements.category.value]||[]){
  if(basicMetadataKeys.has(key))continue;
  const label=document.createElement('label');label.textContent=title;
  const input=document.createElement(type==='textarea'?'textarea':'input');input.dataset.metadataKey=key;input.maxLength=max;input.value=metadataDraft[key]||'';
  if(type==='year'){input.type='number';input.min='1888';input.max='2200';}else if(type==='date')input.type='date';
  label.append(input);container.append(label);
 }
}
form.elements.category.addEventListener('change',()=>{captureMetadata();renderMetadata();$('#game-requirements').hidden=form.elements.category.value!=='game';});
form.elements.is_pinned.addEventListener('change',()=>{
 const enabled=form.elements.is_pinned.checked;
 $('#pin-order-wrap').hidden=!enabled;
 if(enabled&&form.elements.pin_order.selectedOptions[0]?.disabled){
  const available=[...form.elements.pin_order.options].find(option=>!option.disabled);
  if(available)form.elements.pin_order.value=available.value;
  else{form.elements.is_pinned.checked=false;$('#pin-order-wrap').hidden=true;notifications.error('Không còn vị trí ghim trống.');}
 }
});
const message=(text,error=false)=>{$('#message').textContent=text;$('#message').dataset.error=String(error);};
const editorUI=initEditor({form,getCSRF:()=>csrf,onError:text=>{message(text,true);notifications.error(text);},onDirty:()=>{dirty=true;}});
driveUI=initDrivePicker({api,onDirty:()=>{dirty=true;}});
const postActions=createPostActions({api,notifications,onComplete:()=>{dirty=false;location.assign('/admin/');}});
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
 $('#game-requirements').hidden=form.elements.category.value!=='game';
 form.elements.is_pinned.checked=!!post?.is_pinned;
 form.elements.install_size.value=post?.install_size||'';
 const operatingSystems=new Set(post?.operating_systems||[]);
 for(const checkbox of form.querySelectorAll('[name="operating_systems"]'))checkbox.checked=operatingSystems.has(checkbox.value);
 renderPinOrders(post);
 $('#pin-order-wrap').hidden=!form.elements.is_pinned.checked;
 metadataDraft={...post?.metadata};renderMetadata();
 mediaDraft=(post?.media_sources||[]).map(source=>({...source}));renderMediaSources();
 $('#editor-title').textContent=post?'Chỉnh sửa bài viết':'Bài viết mới';$('#saved-info').textContent=post?`ID: ${post.id} · ${post.status} · Cập nhật: ${new Date(post.updated_at).toLocaleString('vi-VN')}`:'';
 $('#preview').hidden=true;dirty=false;driveUI.fill(post);editorUI.fill(post);
 const badge=$('#post-status');badge.textContent=post?(post.status==='published'?'Published · Đã xuất bản':'Draft · Bản nháp'):'Bài mới · Draft';badge.dataset.status=post?.status||'draft';
}
function renderPinOrders(post){
 const select=form.elements.pin_order,competitors=new Map(pinPosts.filter(item=>item.is_pinned&&item.id!==post?.id).map(item=>[item.pin_order,item.title]));
 select.replaceChildren();
 for(let position=1;position<=20;position++){
  const option=document.createElement('option'),owner=competitors.get(position),isCurrent=!!post?.is_pinned&&post.pin_order===position;
  option.value=String(position);
  option.textContent=owner?(isCurrent?`${position} — Vị trí hiện tại đang trùng với: ${owner}`:`${position} — Đã có bài sử dụng: ${owner}`):isCurrent?`${position} — Vị trí hiện tại`:String(position);
  option.disabled=!!owner&&!isCurrent;select.append(option);
 }
 const current=post?.is_pinned&&post.pin_order>=1&&post.pin_order<=20?post.pin_order:[...select.options].find(option=>!option.disabled)?.value||'1';
 select.value=String(current);
}
form.addEventListener('input',()=>{dirty=true;});
form.addEventListener('submit',async event=>{
 event.preventDefault();const intent=event.submitter?.value||'draft';
 if(form.querySelector('input[type=file]:disabled'))return message('Vui lòng chờ ảnh tải lên xong trước khi lưu hoặc xem trước.',true);
 const body=Object.fromEntries(new FormData(form));body.images=body.images.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);body.status=intent==='preview'?currentStatus:intent;
 body.is_pinned=form.elements.is_pinned.checked;body.pin_order=Number(form.elements.pin_order.value);
 body.install_size=form.elements.install_size.value;
 body.operating_systems=[...form.querySelectorAll('[name="operating_systems"]:checked')].map(checkbox=>checkbox.value);
 captureMetadata();body.metadata={...metadataDraft};
 body.media_sources=mediaDraft.map(source=>({...source}));
 body.drive_file_ids=driveUI.ids();
 body.cms_contract=2;
 body.drive_public_file_ids=driveUI.files().filter(file=>file.sharing_confirmed===1&&file.sharing_access==='anyone').map(file=>file.file_id);
 const buttons=[...form.querySelectorAll('button')],disabledState=buttons.map(b=>b.disabled);buttons.forEach(b=>b.disabled=true);
 try{
  if(intent==='preview'){
   const post=await api('/api/admin/preview',{method:'POST',body:JSON.stringify(body)});post.drive_files=driveUI.files();$('#preview-content').innerHTML=detailHTML(post,{preview:true});$('#preview').hidden=false;$('#preview').scrollIntoView({behavior:'smooth'});message('Đang xem trước. Thay đổi chưa được lưu.');
  }else{
    const wasEditing=!!editingId,previousFiles=new Set((loadedPost?.drive_files||[]).map(file=>file.file_id));
    const post=await api(editingId?`/api/admin/posts/${editingId}`:'/api/admin/posts',{method:editingId?'PUT':'POST',body:JSON.stringify(body)});
   const savedIds=new Set((post.drive_files||[]).map(file=>file.file_id));
   if(savedIds.size!==body.drive_file_ids.length||body.drive_file_ids.some(id=>!savedIds.has(id)))throw new Error('Danh sách file sau khi lưu không khớp. Giữ nguyên form; hãy tải lại phiên bản CMS và kiểm tra bài vừa lưu.');
   pinPosts=await api('/api/admin/posts');fill(post);const pending=post.drive_files.filter(file=>file.sharing_confirmed!==1||file.sharing_access==='restricted').length;
   message(`Đã lưu ${post.status==='published'?'bài xuất bản':'bản nháp'} cùng ${savedIds.size} file.${pending?` ${pending} file chưa được công khai; kiểm tra quyền và ô xác nhận chia sẻ.`:''}`);
   const action=post.status==='published'?'Đã xuất bản bài viết':wasEditing?'Đã cập nhật bản nháp':'Đã lưu bản nháp';
   notifications.success(`${action}: ${post.title}.`);
   const attached=post.drive_files.filter(file=>!previousFiles.has(file.file_id)).length;
   if(attached)notifications.success(`Đã gắn ${attached} file Drive vào bài viết.`);
   if(pending)notifications.warning(`${pending} file đã gắn nhưng chưa được công khai.`);
  }
 }catch(error){message(error.message,true);notifications.error(error.message);}finally{buttons.forEach((b,index)=>b.disabled=disabledState[index]);}
});
$('#new-post').addEventListener('click',()=>{if(dirty&&!confirm('Bỏ các thay đổi chưa lưu?'))return;fill();message('Đang tạo bài viết mới.');});
$('#logout').addEventListener('click',async()=>{if(dirty&&!confirm('Đăng xuất và bỏ thay đổi chưa lưu?'))return;try{await api('/api/admin/logout',{method:'POST',body:'{}'});dirty=false;location.assign('/login');}catch(error){message(error.message,true);}});
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue='';}});
try{const session=await api('/api/admin/session');if(session.saveContractVersion!==2||session.contentSchemaVersion!==12)throw new Error('Backend đang chạy phiên bản cũ. Khởi động lại IVAN Admin rồi tải lại CMS.');csrf=session.csrfToken;$('#admin-email').textContent=session.email;pinPosts=await api('/api/admin/posts');const edit=new URLSearchParams(location.search).get('edit');fill(edit?await api(`/api/admin/posts/${encodeURIComponent(edit)}`):null);form.removeAttribute('inert');}catch(error){message(error.message,true);notifications.error(error.message);}

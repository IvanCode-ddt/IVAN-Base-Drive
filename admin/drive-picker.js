import {escapeHTML} from '/js/content.js?v=9';
import {normalizeSearch} from '/js/data.js?v=9';
const $=s=>document.querySelector(s),esc=escapeHTML;
const size=value=>value==null?'—':Number(value)<1024?`${value} B`:`${(Number(value)/1024/1024).toFixed(2)} MB`;
export function initDrivePicker({api,onDirty,displayFilter=()=>true}){
 const dialog=$('#drive-picker'),cache=new Map();let selected=new Map(),working=new Map(),visible=[],folderId,pageToken,nextToken,history=[],version=0;
 function selectedList(){
  const visible=[...selected.values()].filter(displayFilter);
  $('#selected-drive-files').innerHTML=visible.length?visible.map(f=>`<article class="selected-file"><div><strong>${esc(f.name||f.file_id)}</strong><small>${esc(f.mime_type||'Metadata cũ')} · ${size(f.size)} · ${f.sharing_confirmed===1?'Đã xác nhận chia sẻ':'Chưa xác nhận công khai'}</small></div><label class="attachment-consent"><input type="checkbox" data-share="${esc(f.file_id)}" ${f.sharing_confirmed===1?'checked':String()} ${f.sharing_access!=='anyone'?'disabled':String()}> ${f.sharing_access==='restricted'?'Restricted: chỉ quản trị thấy file, không công khai':f.sharing_access==='anyone'?'Tôi xác nhận cho phép công khai file này':'Chưa xác minh quyền Anyone; chọn lại file để cập nhật metadata'}</label><button type="button" class="secondary-button" data-remove="${esc(f.file_id)}">Gỡ</button></article>`).join(''):selected.size?'<p class="field-help">Các tệp đính kèm cũ khác vẫn được giữ nguyên khi lưu album.</p>':'<p class="field-help">Chưa chọn file nén cho album.</p>';
 }
 function render(){
  const query=normalizeSearch($('#picker-search').value.trim());const files=query?[...cache.values()].filter(f=>normalizeSearch(f.name).includes(query)):visible;
  $('#picker-files').innerHTML=files.length?files.map(f=>`<div class="picker-row">${f.is_folder?`<button type="button" class="secondary-button" data-folder="${esc(f.file_id)}">▣ ${esc(f.name)}</button>`:f.is_shortcut?`<span>${esc(f.name)} · Shortcut không được hỗ trợ</span>`:`<label><input type="checkbox" data-pick="${esc(f.file_id)}" ${working.has(f.file_id)?'checked':''}><span><strong>${esc(f.name)}</strong><small>${esc(f.mime_type)} · ${size(f.size)}</small></span></label>`}</div>`).join(''):'<p>Không có file phù hợp.</p>';
  $('#picker-count').textContent=`Đã chọn ${working.size}/50 file`;
 }
 async function browse(folder=folderId,page){
  const current=++version;$('#picker-message').textContent='Đang tải…';$('#picker-files').innerHTML='';$('#picker-next').disabled=true;$('#picker-prev').disabled=true;
  try{
   const params=new URLSearchParams();if(folder)params.set('folderId',folder);if(page)params.set('pageToken',page);
   const data=await api(`/api/admin/drive/files?${params}`);if(current!==version||!dialog.open)return;
   folderId=data.folderId;pageToken=page;nextToken=data.nextPageToken;visible=data.files;for(const f of visible)cache.set(f.file_id,f);
   $('#picker-breadcrumb').innerHTML=data.breadcrumb.map((part,i)=>`${i?' / ':''}<button type="button" class="secondary-button" data-folder="${esc(part.id)}">${esc(part.name)}</button>`).join('');
   $('#picker-prev').disabled=!history.length;$('#picker-next').disabled=!nextToken;$('#picker-message').textContent=data.incompleteSearch?'Kết quả Google chưa đầy đủ. Hãy thử làm mới.':'';render();
  }catch(error){if(current===version)$('#picker-message').textContent=error.message;}
 }
 $('#choose-drive').addEventListener('click',()=>{working=new Map(selected);$('#picker-search').value='';dialog.showModal();render();history=[];browse();});
 const cancel=()=>{++version;dialog.close();};
 for(const id of ['picker-close','picker-cancel'])$('#'+id).addEventListener('click',cancel);
 dialog.addEventListener('cancel',()=>{++version;});
 $('#picker-confirm').addEventListener('click',()=>{selected=new Map(working);selectedList();onDirty();cancel();});
 $('#selected-drive-files').addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(button){selected.delete(button.dataset.remove);selectedList();onDirty();}});
 $('#selected-drive-files').addEventListener('change',event=>{const id=event.target.dataset.share;if(id&&selected.has(id)){selected.set(id,{...selected.get(id),sharing_confirmed:event.target.checked?1:0});onDirty();}});
 dialog.addEventListener('click',event=>{const button=event.target.closest('[data-folder]');if(button){history=[];$('#picker-search').value='';browse(button.dataset.folder);}});
 dialog.addEventListener('change',event=>{
  const id=event.target.dataset.pick;if(!id)return;
  if(event.target.checked){if(working.size>=50){event.target.checked=false;$('#picker-message').textContent='Tối đa 50 file.';return;}working.set(id,{...selected.get(id),...cache.get(id),sharing_confirmed:selected.get(id)?.sharing_confirmed||0});}else working.delete(id);
  $('#picker-count').textContent=`Đã chọn ${working.size}/50 file`;
 });
 $('#picker-search').addEventListener('input',render);
 $('#picker-refresh').addEventListener('click',()=>{history=[];browse();});
 $('#picker-next').addEventListener('click',()=>{if(nextToken){history.push(pageToken);browse(folderId,nextToken);}});
 $('#picker-prev').addEventListener('click',()=>{if(history.length)browse(folderId,history.pop());});
 return{
  fill(post){++version;if(dialog.open)dialog.close();folderId=undefined;pageToken=undefined;nextToken=undefined;history=[];selected=new Map((post?.drive_files||[]).map(f=>[f.file_id,f]));selectedList();},
  ids:()=>[...selected.keys()],files:()=>[...selected.values()],
 };
}

import {escapeHTML,detailHTML,categoryName} from '/js/content.js?v=16';
import {normalizeSearch,CATEGORIES} from '/js/data.js?v=7';
import {createPostActions} from './actions.js?v=10';
import {initPublishUI} from './publish.js?v=11';
import {createNotifications} from './notifications.js';
const $=s=>document.querySelector(s);let csrf='',posts=[],trash=[];
const notifications=createNotifications();
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
 if(response.status===401){location.assign('/login');throw new Error('Cần đăng nhập.');}
 const body=await response.json();if(!response.ok)throw new Error([body.error||'Yêu cầu thất bại.',body.hint||''].filter(Boolean).join(' '));return body;
}
function render(){
 const query=normalizeSearch($('#post-search').value),category=$('#post-category').value,status=$('#post-filter-status').value;
 const shown=posts.filter(p=>(!category||p.category===category)&&(!status||p.status===status)&&normalizeSearch(p.title+' '+p.slug).includes(query));
 $('#dashboard-count').textContent=`${posts.length} bài · ${posts.filter(p=>p.status==='published').length} Published · ${trash.length} trong Thùng rác`;
 $('#post-table').innerHTML=shown.length?shown.map(p=>`<article class="dashboard-row"><div><h3>${escapeHTML(p.title)}</h3><p>${categoryName(p.category)} · <span class="status-badge" data-status="${p.status}">${p.status==='published'?'Published':'Draft'}</span>${p.is_pinned?` · <span class="status-badge">★ Ghim ${p.pin_order}</span>`:''}</p><small>${p.drive_files.length} file đã gắn · ${p.drive_files.filter(f=>f.sharing_confirmed===1&&f.sharing_access!=='restricted').length} file được công khai</small></div><div class="drive-actions"><a class="secondary-button" href="/admin/editor.html?edit=${p.id}">Sửa</a><button class="secondary-button" data-pin="${p.id}">${p.is_pinned?"★ Bỏ ghim":"☆ Ghim"}</button><button class="secondary-button" data-preview="${p.id}">Xem trước</button><button class="secondary-button" data-delete="${p.id}">Xóa</button></div></article>`).join(''):'<p>Không có bài phù hợp.</p>';
 $('#trash-table').innerHTML=trash.length?trash.map(p=>`<article class="dashboard-row"><div><h3>${escapeHTML(p.title)}</h3><p>Đã xóa: ${new Date(p.deleted_at).toLocaleString('vi-VN')}</p></div><div class="drive-actions"><button class="secondary-button" data-restore="${p.id}">Khôi phục</button><button class="secondary-button" data-purge="${p.id}">Xóa vĩnh viễn</button></div></article>`).join(''):'<p>Thùng rác trống.</p>';
}
async function load(){[posts,trash]=await Promise.all([api('/api/admin/posts'),api('/api/admin/trash')]);render();}
const actions=createPostActions({api,notifications,onComplete:async()=>{await load();$('#dashboard-message').textContent='Đã cập nhật. Chạy export để cập nhật bản tĩnh.';}});
for(const id of ['post-search','post-category','post-filter-status'])$('#'+id).addEventListener('input',render);
document.addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.pin){const post=posts.find(p=>p.id===button.dataset.pin);if(post){const order=post.is_pinned?post.pin_order:Array.from({length:20},(_,index)=>index+1).find(position=>!posts.some(item=>item.is_pinned&&item.pin_order===position));if(order)savePin(post,!post.is_pinned,order);else notifications.error('Không còn vị trí ghim trống.');}}
 for(const kind of ['delete','restore','purge'])if(button.dataset[kind]){const post=[...posts,...trash].find(p=>p.id===button.dataset[kind]);if(post)actions.open(post,kind);}
 if(button.dataset.preview){const post=posts.find(p=>p.id===button.dataset.preview);$('#dashboard-preview-content').innerHTML=detailHTML(post,{preview:true});$('#dashboard-preview').showModal();}
});
async function savePin(post,pinned,order){try{await api(`/api/admin/posts/${post.id}/pin`,{method:'PATCH',body:JSON.stringify({is_pinned:pinned,pin_order:order})});await load();$('#dashboard-message').textContent='Đã cập nhật ghim. Export để cập nhật website công khai.';notifications.success(pinned?`Đã ghim “${post.title}”.`:`Đã bỏ ghim “${post.title}”.`);}catch(error){$('#dashboard-message').textContent=error.message;notifications.error(error.message);}}
$('#preview-close').addEventListener('click',()=>$('#dashboard-preview').close());
function route(){const view=location.hash==='#trash'?'trash':location.hash==='#settings'?'settings':'posts';for(const key of ['posts','trash','settings'])$('#'+key+'-dashboard').hidden=key!==view;}
window.addEventListener('hashchange',route);route();
$('#dashboard-logout').addEventListener('click',async()=>{await api('/api/admin/logout',{method:'POST',body:'{}'});location.assign('/login');});
try{
 const session=await api('/api/admin/session');if(session.contentSchemaVersion!==12)throw new Error('Backend đang chạy phiên bản cũ. Khởi động lại IVAN Admin rồi tải lại Dashboard.');csrf=session.csrfToken;$('#dashboard-email').textContent=session.email;
 initPublishUI({api,notifications});
 $('#post-category').innerHTML='<option value="">Tất cả danh mục</option>'+CATEGORIES.map(c=>`<option value="${c.id}">${c.name}</option>`).join('');
 await load();const settings=await api('/api/admin/settings');$('#settings-info').textContent=`Tài khoản: ${settings.email}\nThư mục Drive: ${settings.driveRootId||'Mặc định'}\nXuất bản: ${settings.exportCommand}\nQuản trị và OAuth chạy local. Trang này không hiển thị secret/token.`;
}catch(error){$('#dashboard-message').textContent=error.message;notifications.error(error.message);}

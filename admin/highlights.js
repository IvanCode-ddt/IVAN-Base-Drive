import {escapeHTML,spotlightHTML} from '/js/content.js?v=15';
import {createNotifications} from './notifications.js';

const $=selector=>document.querySelector(selector),notifications=createNotifications();
let csrf='',posts=[],config={enabled:true,interval_seconds:6,slides:[]},busy=false;
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
 if(response.status===401){location.assign('/login');throw new Error('Phiên đăng nhập đã hết hạn.');}
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Yêu cầu không thành công.');return data;
}
function render(){
 $('#highlight-enabled').checked=config.enabled;
 $('#highlight-interval').value=config.interval_seconds;
 const selected=new Set(config.slides.map(slide=>slide.post_id));
 const options=posts.filter(post=>post.status==='published'&&!post.deleted_at&&!selected.has(post.id));
 $('#highlight-add-post').innerHTML='<option value="">Chọn bài viết…</option>'+options.map(post=>`<option value="${escapeHTML(post.id)}">${escapeHTML(post.title)}</option>`).join('');
 $('#highlight-slides').innerHTML=config.slides.length?config.slides.map((slide,index)=>`<article class="highlight-slide-row" data-slide="${escapeHTML(slide.post_id)}"><div><h3>${escapeHTML(slide.title||'Bài đã xóa')}</h3><p>${slide.status==='published'&&!slide.deleted_at?'Published':`Không còn Published (${escapeHTML(slide.status||'deleted')}) · sẽ không xuất công khai`}</p></div><div class="highlight-slide-actions"><label><input type="checkbox" data-slide-enabled ${slide.enabled?'checked':''} ${slide.status==='published'&&!slide.deleted_at?'':'disabled'}> Bật slide</label><button type="button" class="secondary-button" data-move="-1" aria-label="Đưa ${escapeHTML(slide.title||'slide')} lên trước" ${index===0?'disabled':''}>↑</button><button type="button" class="secondary-button" data-move="1" aria-label="Đưa ${escapeHTML(slide.title||'slide')} xuống sau" ${index===config.slides.length-1?'disabled':''}>↓</button><button type="button" class="secondary-button" data-remove-slide>Gỡ slide</button></div></article>`).join(''):'<p>Chưa có slide. Hãy chọn một bài Published.</p>';
 renderPreview();
}
function renderPreview(){
 const eligible=config.slides.filter(slide=>slide.enabled&&posts.some(post=>post.id===slide.post_id&&post.status==='published'));
 const preview=$('#highlight-preview');
 preview.innerHTML=eligible.map((slide,index)=>spotlightHTML(posts.find(post=>post.id===slide.post_id),{active:index===0,index})).join('');
 preview.hidden=!eligible.length;
 $('#highlight-preview-status').textContent=eligible.length?`${eligible.length} slide đang bật${config.enabled?'':' · carousel hiện đang tắt'}`:'Chưa có slide đang bật để xem trước.';
}
function updateStatus(message,error=false){$('#highlight-status').textContent=message;$('#highlight-status').dataset.error=String(error);}
$('#highlight-slides').addEventListener('click',event=>{
 const row=event.target.closest('[data-slide]');if(!row)return;
 const index=config.slides.findIndex(slide=>slide.post_id===row.dataset.slide);
 if(event.target.closest('[data-remove-slide]'))config.slides.splice(index,1);
 else if(event.target.closest('[data-move]')){
  const delta=Number(event.target.closest('[data-move]').dataset.move),target=index+delta;
  if(target<0||target>=config.slides.length)return;
  [config.slides[index],config.slides[target]]=[config.slides[target],config.slides[index]];
 }else return;
 render();
});
$('#highlight-slides').addEventListener('change',event=>{
 if(!event.target.matches('[data-slide-enabled]'))return;
 const row=event.target.closest('[data-slide]'),slide=config.slides.find(item=>item.post_id===row.dataset.slide);
 if(slide){slide.enabled=event.target.checked;renderPreview();}
});
$('#highlight-add').addEventListener('click',()=>{
 const id=$('#highlight-add-post').value,post=posts.find(item=>item.id===id&&item.status==='published');
 if(!post)return notifications.warning('Chọn một bài Published trước khi thêm slide.');
 config.slides.push({post_id:post.id,title:post.title,status:post.status,enabled:true});
 render();$('#highlight-add-post').focus();
});
$('#highlight-enabled').addEventListener('change',event=>{config.enabled=event.target.checked;renderPreview();});
$('#highlight-interval').addEventListener('input',event=>{config.interval_seconds=Number(event.target.value)||6;});
$('#highlight-save').addEventListener('click',async()=>{
 if(busy)return;
 const interval=Number($('#highlight-interval').value);
 if(!Number.isInteger(interval)||interval<3||interval>20){notifications.error('Thời gian tự chuyển phải từ 3 đến 20 giây.');$('#highlight-interval').focus();return;}
 busy=true;$('#highlight-save').disabled=true;
 try{
  const slides=config.slides.filter(slide=>posts.some(post=>post.id===slide.post_id&&post.status==='published'&&!post.deleted_at)).map(({post_id,enabled})=>({post_id,enabled}));
  const saved=await api('/api/admin/highlights',{method:'PUT',body:JSON.stringify({enabled:config.enabled,interval_seconds:interval,slides})});
  config={...saved,slides:saved.slides.map(slide=>({...slide,...posts.find(post=>post.id===slide.post_id)}))};
  render();updateStatus('Đã lưu cấu hình Highlight. Chạy export để cập nhật bản công khai.');notifications.success('Đã lưu cấu hình Highlight.');
 }catch(error){updateStatus(error.message,true);notifications.error(error.message);}
 finally{busy=false;$('#highlight-save').disabled=false;}
});
$('#highlight-logout').addEventListener('click',async()=>{try{await api('/api/admin/logout',{method:'POST',body:'{}'});location.assign('/login');}catch(error){notifications.error(error.message);}});
try{
 const session=await api('/api/admin/session');if(session.contentSchemaVersion!==11)throw new Error('Backend đang chạy phiên bản cũ. Khởi động lại IVAN Admin rồi tải lại trang Highlight.');csrf=session.csrfToken;$('#highlight-email').textContent=session.email;
 [posts,config]=await Promise.all([api('/api/admin/posts'),api('/api/admin/highlights')]);
 config.slides=config.slides.map(slide=>({...slide,...posts.find(post=>post.id===slide.post_id)}));
 render();
}catch(error){updateStatus(error.message,true);notifications.error(error.message);}

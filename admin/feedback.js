const $=selector=>document.querySelector(selector),labels={unread:'Chưa đọc',read:'Đã đọc',processing:'Đang xử lý',done:'Hoàn thành'};
let csrf='',offset=0,version=0;
async function api(url,options={}){
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
 if(response.status===401){location.assign('/login');throw Error('Cần đăng nhập Google Admin.');}
 const body=await response.json();if(!response.ok)throw Error(body.error||'Yêu cầu thất bại.');return body;
}
function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
async function status(){
 const data=await api('/api/admin/feedback/status');$('#feedback-state').textContent=`${{not_configured:'Chưa kết nối',ready:'Chưa kiểm tra kết nối',connected:'Đã đồng bộ',error:'Lỗi kết nối'}[data.state]} · ${data.message}${data.missing.length?' Thiếu: '+data.missing.join(', '):''}${data.lastSync?' Lần thành công: '+new Date(data.lastSync.last_synced_at).toLocaleString('vi-VN'):''}`;
 $('#feedback-sync').disabled=data.state==='not_configured'||data.busy;
}
async function load(){
 const current=++version,query=new URLSearchParams({search:$('#feedback-search').value,status:$('#feedback-status').value,type:$('#feedback-type').value,offset:String(offset)});
 const data=await api('/api/admin/feedback?'+query);if(current!==version)return;
 $('#feedback-items').replaceChildren();$('#feedback-count').textContent=data.total?`${data.total} phản hồi · ${offset+1}–${offset+data.items.length}`:'0 phản hồi';
 if(!data.items.length)$('#feedback-items').append(text('p','Chưa có phản hồi đã đồng bộ phù hợp.'));
 for(const row of data.items){
  const article=document.createElement('article');article.className='feedback-item';article.append(text('h2',row.title),text('p',`${row.type} · ${row.received_at}`));
  const detail=text('p',row.detail);detail.className='plain-content';article.append(detail);
  if(row.reference_url){let url;try{url=new URL(row.reference_url);}catch{}if(url?.protocol==='https:'&&!url.username&&!url.password){const link=text('a','Liên kết tham khảo ↗');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';article.append(link);}else article.append(text('p','Tham khảo: '+row.reference_url));}
  if(row.contact_email)article.append(text('p','Liên hệ: '+row.contact_email));
  const label=text('label','Xử lý: '),select=document.createElement('select');select.setAttribute('aria-label','Trạng thái '+row.title);
  for(const[value,name]of Object.entries(labels)){const option=text('option',name);option.value=value;select.append(option);}select.value=row.processing_status;
  select.addEventListener('change',async()=>{select.disabled=true;try{await api('/api/admin/feedback/'+row.id,{method:'PATCH',body:JSON.stringify({status:select.value})});$('#feedback-message').textContent='Đã lưu trạng thái trên SQLite. Đồng bộ lại không ghi đè trạng thái này.';await load();}catch(error){$('#feedback-message').textContent=error.message;select.value=row.processing_status;}finally{select.disabled=false;}});
  label.append(select);article.append(label);$('#feedback-items').append(article);
 }
 $('#feedback-prev').disabled=offset===0;$('#feedback-next').disabled=offset+data.items.length>=data.total;
}
let timer;for(const id of ['feedback-search','feedback-type','feedback-status'])$('#'+id).addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{offset=0;load().catch(error=>$('#feedback-message').textContent=error.message);},200);});
$('#feedback-prev').addEventListener('click',()=>{offset=Math.max(0,offset-100);load().catch(error=>$('#feedback-message').textContent=error.message);});
$('#feedback-next').addEventListener('click',()=>{offset+=100;load().catch(error=>$('#feedback-message').textContent=error.message);});
$('#feedback-sync').addEventListener('click',async()=>{const button=$('#feedback-sync');button.disabled=true;$('#feedback-message').textContent='Đang đọc Sheets…';try{const result=await api('/api/admin/feedback/sync',{method:'POST',body:'{}'});$('#feedback-message').textContent=`Đã đọc ${result.imported} phản hồi. Trạng thái xử lý cũ được giữ nguyên.`;await load();}catch(error){$('#feedback-message').textContent=error.message;}finally{await status().catch(error=>$('#feedback-message').textContent=error.message);}});
try{csrf=(await api('/api/admin/session')).csrfToken;await Promise.all([status(),load()]);}catch(error){$('#feedback-message').textContent=error.message;}

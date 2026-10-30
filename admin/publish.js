export function initPublishUI({api,notifications}){
 const $=selector=>document.querySelector(selector),dialog=$('#publish-review');let preview=null,working=false,lastStatus={},timer=null,lastError='';
 let publicationPending=false,publishBaseAt='',publishBaseCommit='';
 function progress(status){
  lastStatus=status;$('#publish-progress').value=status.progress||0;
  $('#publish-step').textContent=status.message||'Chưa xuất bản.';
  $('#publish-error').textContent=status.error?`${status.error.message} ${status.error.hint||''}`:lastError;
  $('#publish-start').disabled=working||!!status.busy;
  const last=status.lastPublished;
  if(publicationPending&&status.error){publicationPending=false;notifications?.error(status.error.message||'Không xuất bản được bản cập nhật.');}
  else if(publicationPending&&!status.busy&&last&&(last.at!==publishBaseAt||last.commit!==publishBaseCommit)){publicationPending=false;notifications?.success('Đã xác nhận push cập nhật lên origin/main.');}
  $('#publish-last').textContent=last?`Lần push thành công: ${new Date(last.at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}`:'Chưa có lần xuất bản thành công được ghi nhận.';
  const commit=status.commit||last?.commit,link=$('#publish-commit');link.hidden=!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(commit||'');
  if(!link.hidden){link.textContent=`Commit ${commit.slice(0,12)}`;link.href=`https://github.com/IvanCode-ddt/IVAN-Base-Drive/commit/${commit}`;}
 }
 async function poll(){try{progress(await api('/api/admin/publish/status'));}catch{ $('#publish-error').textContent=lastError||'Không đọc được trạng thái server. Tải lại trang để kiểm tra; không tự chạy push lần nữa.';}}
 const startPoll=()=>{if(!timer)timer=setInterval(poll,1000);};
 startPoll();poll();
 $('#publish-start').addEventListener('click',async()=>{
  if(working||lastStatus.busy)return;working=true;lastError='';$('#publish-start').disabled=true;$('#publish-error').textContent='';
  try{
   preview=await api('/api/admin/publish/preview',{method:'POST',body:'{}'});
   if(!preview.needsConfirmation){await poll();return;}
   $('#publish-change-list').replaceChildren();
   for(const change of preview.changes){const row=document.createElement('li');row.textContent=`${{added:'Thêm',modified:'Sửa',deleted:'Xóa'}[change.status]||change.status}: ${change.path}`;$('#publish-change-list').append(row);}
   $('#publish-post-list').replaceChildren();for(const post of preview.posts){const row=document.createElement('li');row.textContent=`${post.title} · ${post.slug} · ${post.fileCount} file công khai`;$('#publish-post-list').append(row);}
   $('#publish-source-note').textContent=preview.sourceChangeCount?`${preview.sourceChangeCount} file source ngoài docs/ chưa commit sẽ được giữ nguyên, không đưa vào commit xuất bản.`:'Không có thay đổi source ngoài docs/.';
   $('#publish-retry-note').textContent=preview.retryCommit?`Thử push lại commit local ${preview.retryCommit.slice(0,12)}; không tạo commit trùng.`:'';
   $('#publish-review-error').textContent='';$('#publish-frame').src=preview.siteUrl;$('#publish-consent').checked=false;$('#publish-confirm').disabled=true;dialog.showModal();
  }catch(error){lastError=error.message;$('#publish-error').textContent=lastError;notifications?.error(error.message);}finally{working=false;$('#publish-start').disabled=!!lastStatus.busy;await poll();}
 });
 $('#publish-consent').addEventListener('change',()=>{$('#publish-confirm').disabled=!$('#publish-consent').checked;});
 $('#publish-cancel').addEventListener('click',()=>{dialog.close();$('#publish-frame').removeAttribute('src');});
 dialog.addEventListener('cancel',()=>{$('#publish-frame').removeAttribute('src');});
 $('#publish-confirm').addEventListener('click',async()=>{
  if(!preview||!$('#publish-consent').checked||working)return;working=true;$('#publish-confirm').disabled=true;$('#publish-start').disabled=true;
  try{await api('/api/admin/publish/confirm',{method:'POST',body:JSON.stringify({previewId:preview.id,confirm:true})});publishBaseAt=lastStatus.lastPublished?.at||'';publishBaseCommit=lastStatus.lastPublished?.commit||'';publicationPending=true;dialog.close();$('#publish-frame').removeAttribute('src');await poll();}
  catch(error){lastError=error.message;$('#publish-error').textContent=lastError;$('#publish-review-error').textContent=lastError;notifications?.error(error.message);}
  finally{working=false;$('#publish-start').disabled=!!lastStatus.busy;}
 });
 window.addEventListener('pagehide',()=>{if(timer)clearInterval(timer);});
 return{refresh:poll};
}

export function createPostActions({api,onComplete}){
 const dialog=document.createElement('dialog');dialog.className='action-dialog';
 dialog.innerHTML='<h2></h2><p class="action-description"></p><strong class="action-post-title"></strong><label class="purge-input" hidden>Nhập đúng tên bài để xóa vĩnh viễn<input autocomplete="off"></label><p role="alert"></p><div class="drive-actions"><button type="button" class="secondary-button" data-cancel>Hủy</button><button type="button" class="primary-button" data-execute>Xác nhận</button></div>';
 document.body.append(dialog);let current,busy=false;
 const execute=dialog.querySelector('[data-execute]'),input=dialog.querySelector('input'),error=dialog.querySelector('[role=alert]');
 dialog.querySelector('[data-cancel]').addEventListener('click',()=>{if(!busy)dialog.close();});
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 input.addEventListener('input',()=>{execute.disabled=current?.kind==='purge'&&input.value!==current.post.title;});
 execute.addEventListener('click',async()=>{
  if(!current||busy)return;const{post,kind}=current;
  if(kind==='purge'&&input.value!==post.title)return;
  busy=true;execute.disabled=true;error.textContent='';
  try{
   await api(kind==='restore'?`/api/admin/trash/${post.id}/restore`:kind==='purge'?`/api/admin/trash/${post.id}`:`/api/admin/posts/${post.id}`,{method:kind==='restore'?'POST':'DELETE',body:JSON.stringify({confirmTitle:post.title,...kind==='purge'?{action:'purge'}:{}})});
   dialog.close();await onComplete(post,kind);
  }catch(failure){error.textContent=failure.message;}finally{busy=false;execute.disabled=kind==='purge'&&input.value!==post.title;}
 });
 return{open(post,kind='delete'){
  current={post,kind};input.value='';error.textContent='';
  dialog.querySelector('h2').textContent=kind==='purge'?'Xóa vĩnh viễn bài viết?':kind==='restore'?'Khôi phục bài viết?':'Chuyển bài viết vào Thùng rác?';
  dialog.querySelector('.action-post-title').textContent=post.title;
  dialog.querySelector('.action-description').textContent=kind==='purge'?'Không thể khôi phục sau thao tác này. Không xóa file Drive hoặc ảnh trên ổ đĩa.':kind==='restore'?`Bài sẽ trở lại trạng thái ${post.status==='published'?'Published và xuất hiện trên website local':'Draft'}.`:'Bài sẽ ẩn khỏi website local; có thể khôi phục trong Thùng rác. Chạy export lại để cập nhật GitHub Pages.';
  dialog.querySelector('.purge-input').hidden=kind!=='purge';execute.textContent=kind==='purge'?'Xóa vĩnh viễn':kind==='restore'?'Khôi phục':'Chuyển vào Thùng rác';execute.disabled=kind==='purge';dialog.showModal();
 }};
}

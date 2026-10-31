// Clipboard access occurs only inside a user paste event on an explicit target.
export function initImagePaste(input,onFiles){
 const zone=document.createElement('div');zone.className='image-paste-zone';zone.tabIndex=0;zone.setAttribute('role','group');zone.setAttribute('aria-label','Dán ảnh cho '+input.closest('label').textContent.trim());
 zone.textContent='Ctrl+V để dán ảnh hoặc chọn từ máy';input.closest('label').after(zone);
 zone.addEventListener('paste',event=>{
  if(event.target!==zone||input.disabled)return;
  const files=[...(event.clipboardData?.items||[])].filter(item=>item.kind==='file'&&item.type.startsWith('image/')).map(item=>item.getAsFile()).filter(Boolean);
  if(!files.length)return;
  event.preventDefault();onFiles(input.multiple?files:files.slice(0,1));
 });
 return zone;
}

import {initImagePaste} from './clipboard-images.js?v=1';
import {renderMarkdown} from '/js/markdown.js?v=21';
import { imageURL } from '/js/media.js';
export function slugify(value){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,180).replace(/-$/,'');}
export function insertMarkdown(field,kind,url=''){
 let start=field.selectionStart,end=field.selectionEnd,selected=field.value.slice(start,end),text,caret;
 const marker=kind==='bold'?'**':kind==='italic'?'*':'';
 if(marker){
  if(selected.startsWith(marker)&&selected.endsWith(marker)&&selected.length>=marker.length*2){text=selected.slice(marker.length,-marker.length);}
  else if(field.value.slice(start-marker.length,start)===marker&&field.value.slice(end,end+marker.length)===marker){start-=marker.length;end+=marker.length;text=selected;}
  else{text=marker+selected+marker;caret=marker.length;}
 }else if(kind==='link'){
  const matches=[...field.value.matchAll(/\[([^\]\n]*)\]\(([^\s)]+)\)/g)];
  const match=matches.find(m=>start>=m.index&&end<=m.index+m[0].length);
  if(match){start=match.index;end=start+match[0].length;selected=match[1];}
  text='['+(selected||'Tên liên kết')+']('+url+')';
 }else{
  const lineStart=start&&!field.value.slice(0,start).endsWith('\n')?'\n':'';
  text={heading:lineStart+'## '+(selected||'Tiêu đề'),list:lineStart+(selected||'Mục thứ nhất\nMục thứ hai').split('\n').map(line=>'- '+line).join('\n'),image:'!['+(selected||'Ảnh minh họa')+']('+url+')'}[kind];
 }
 if(text===undefined)return;
 const scroll=field.scrollTop;field.focus({preventScroll:true});field.setSelectionRange(start,end);
 // insertText keeps the native Chromium undo/redo stack, unlike assigning value.
 if(!document.execCommand('insertText',false,text)){field.setRangeText(text,start,end,'end');field.dispatchEvent(new Event('input',{bubbles:true}));}
 if(caret!==undefined)field.setSelectionRange(start+caret,start+text.length-caret);
 else field.setSelectionRange(start+text.length,start+text.length);
 field.scrollTop=scroll;
}
export function initEditor({form,getCSRF,onError,onDirty}){
 let slugManual=false,existing=false,inlineTarget;
 const title=form.elements.namedItem('title'),slug=form.elements.namedItem('slug');
 const cover=form.elements.namedItem('cover_url'),gallery=form.elements.namedItem('images');
 const externalRows=document.getElementById('external-link-rows');
 title.addEventListener('input',()=>{if(!existing&&!slugManual)slug.value=slugify(title.value);});
 slug.addEventListener('input',()=>{slugManual=true;});
 document.querySelector('#regenerate-slug').addEventListener('click',()=>{slug.value=slugify(title.value);slugManual=false;onDirty();});
 const galleryValues=()=>gallery.value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);
 function externalLinkRow(link={}){
  const row=document.createElement('div');row.className='external-link-row';
  const fields=document.createElement('div');fields.className='external-link-fields';
  const addField=(labelText,tag,type,value,max)=>{
   const label=document.createElement('label');label.textContent=labelText;
   const input=document.createElement(tag);if(type)input.type=type;if(max)input.maxLength=max;
   if(['Tên hiển thị','URL HTTPS','Loại liên kết'].includes(labelText))input.required=true;
   input.dataset.externalField=labelText;
   if(tag==='select'){
    for(const[valueText,text]of[['direct','Tải trực tiếp'],['download_page','Mở trang tải']]){const option=document.createElement('option');option.value=valueText;option.textContent=text;input.append(option);}
    input.value=value||'direct';
   }else input.value=value||'';
   label.append(input);fields.append(label);
  };
  addField('Tên hiển thị','input','text',link.name,160);
  addField('URL HTTPS','input','url',link.url,2048);
  addField('Loại liên kết','select','',link.kind||'direct');
  addField('Nguồn cung cấp (tùy chọn)','input','text',link.provider,120);
  addField('Dung lượng (tùy chọn)','input','text',link.size,80);
  const actions=document.createElement('div');actions.className='external-link-actions';
  for(const[action,label]of[['up','↑ Ưu tiên hơn'],['down','↓ Ưu tiên thấp hơn'],['remove','Xóa link']]){
   const button=document.createElement('button');button.type='button';button.className='secondary-button';button.dataset.externalAction=action;button.textContent=label;actions.append(button);
  }
  row.append(fields,actions);return row;
 }
 function fillExternalLinks(links=[]){externalRows.replaceChildren(...links.map(externalLinkRow));}
 document.getElementById('add-external-link').addEventListener('click',()=>{externalRows.append(externalLinkRow());onDirty();});
 externalRows.addEventListener('input',onDirty);
 externalRows.addEventListener('change',onDirty);
 externalRows.addEventListener('click',event=>{
  const button=event.target.closest('[data-external-action]');if(!button)return;
  const row=button.closest('.external-link-row'),action=button.dataset.externalAction;
  if(action==='remove')row.remove();
  else if(action==='up'&&row.previousElementSibling)externalRows.insertBefore(row,row.previousElementSibling);
  else if(action==='down'&&row.nextElementSibling)externalRows.insertBefore(row.nextElementSibling,row);
  else return;
  onDirty();
 });
 function previews(){
  for(const[id,values]of[['cover-preview',cover.value?[cover.value]:[]],['gallery-preview',galleryValues()]]){
   const container=document.getElementById(id);container.replaceChildren();
   values.forEach((value,index)=>{const wrap=document.createElement('div');wrap.className='upload-thumb';const img=document.createElement('img');img.src=imageURL(value);img.alt=id==='cover-preview'?'Ảnh bìa':`Ảnh ${index+1}`;const remove=document.createElement('button');remove.type='button';remove.className='secondary-button';remove.textContent='Gỡ ảnh';remove.addEventListener('click',()=>{if(id==='cover-preview')cover.value='';else gallery.value=galleryValues().filter((_,i)=>i!==index).join('\n');previews();onDirty();});wrap.append(img,remove);container.append(wrap);});
  }
 }
 async function upload(file){
  if(file.size>5*1024*1024)throw new Error('Mỗi ảnh tối đa 5 MB.');
  const response=await fetch('/api/admin/images',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream','X-CSRF-Token':getCSRF()},body:file});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Không tải ảnh lên được.');return data.path;
 }
 for(const[id,target]of[['cover-upload','cover'],['gallery-upload','gallery'],['inline-upload','inline']]){
  const input=document.getElementById(id);
  async function uploadFiles(files,pasted=false){
   if(input.disabled||!files.length)return;
   if(pasted&&target==='cover'&&cover.value&&!confirm('Thay ảnh bìa đang chọn bằng ảnh vừa dán?'))return;
   input.disabled=true;
   try{
    if(target==='gallery'&&galleryValues().length+files.length>12)throw new Error('Tối đa 12 ảnh minh họa.');
    if(files.some(file=>!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024))throw new Error('Chỉ nhận JPEG, PNG, WebP, tối đa 5 MB/ảnh.');
    const urls=[];for(const file of files)urls.push(await upload(file));
    if(target==='cover')cover.value=urls[0]||cover.value;
    else if(target==='gallery')gallery.value=[...galleryValues(),...urls].join('\n');
    else for(const url of urls)insertMarkdown(inlineTarget,'image',url);
    onDirty();previews();
   }catch(error){onError(error.message);}finally{input.disabled=false;input.value='';}
  }
  input.addEventListener('change',()=>uploadFiles([...input.files]));
  if(target!=='inline')initImagePaste(input,files=>uploadFiles(files,true));
 }
 function format(field,kind){
  if(kind==='preview'){
   let preview=document.getElementById(field.id+'-markdown-preview');
   if(!preview){preview=document.createElement('div');preview.id=field.id+'-markdown-preview';preview.className='markdown-content editor-markdown-preview';preview.setAttribute('role','region');preview.setAttribute('aria-label','Xem trước Markdown');field.after(preview);}
   preview.innerHTML=renderMarkdown(field.value);preview.hidden=false;return;
  }
  if(kind==='image'){inlineTarget=field;document.getElementById('inline-upload').click();return;}
  let url='';if(kind==='link'){
   const match=[...field.value.matchAll(/\[([^\]\n]*)\]\(([^\s)]+)\)/g)].find(m=>field.selectionStart>=m.index&&field.selectionEnd<=m.index+m[0].length);
   url=prompt('Đường dẫn HTTPS:',match?.[2]||'https://');if(!url)return;
   try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error();}catch{return onError('Liên kết phải dùng HTTPS.');}
  }
  insertMarkdown(field,kind,url);
 }
 document.querySelectorAll('.markdown-toolbar').forEach(toolbar=>{
  const field=document.getElementById(toolbar.dataset.editor);
  for(const[kind,label]of[['italic','I'],['preview','Xem trước']])if(!toolbar.querySelector('[data-md="'+kind+'"]')){const button=document.createElement('button');button.type='button';button.dataset.md=kind;button.textContent=label;toolbar.append(button);}
  for(const[kind,label]of[['bold','In đậm (Ctrl+B)'],['italic','In nghiêng (Ctrl+I)'],['link','Liên kết (Ctrl+K)']]){const button=toolbar.querySelector('[data-md="'+kind+'"]');button.title=label;button.setAttribute('aria-label',label);}
  toolbar.addEventListener('pointerdown',event=>{if(event.target.closest('button'))event.preventDefault();});
  toolbar.addEventListener('click',event=>{const button=event.target.closest('[data-md]');if(button)format(field,button.dataset.md);});
  field.addEventListener('keydown',event=>{
   if(!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey||event.isComposing)return;
   const kind={b:'bold',i:'italic',k:'link'}[event.key.toLowerCase()];if(!kind)return;
   event.preventDefault();format(field,kind);
  });
  field.addEventListener('input',()=>{const preview=document.getElementById(field.id+'-markdown-preview');if(preview&&!preview.hidden)preview.innerHTML=renderMarkdown(field.value);});
 });
 cover.addEventListener('input',previews);gallery.addEventListener('input',previews);
 return{fill(post){existing=!!post;slugManual=!!post;fillExternalLinks(post?.external_links||[]);form.querySelectorAll('.editor-markdown-preview').forEach(node=>node.remove());previews();},externalLinks(){return[...externalRows.querySelectorAll('.external-link-row')].map(row=>{
  const value=key=>row.querySelector(`[data-external-field="${key}"]`).value;
  return{name:value('Tên hiển thị'),url:value('URL HTTPS'),kind:value('Loại liên kết'),provider:value('Nguồn cung cấp (tùy chọn)'),size:value('Dung lượng (tùy chọn)')};
 });}};
}

import { imageURL } from '/js/media.js';
export function slugify(value){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,180).replace(/-$/,'');}
export function insertMarkdown(field,kind,url=''){
 const selected=field.value.slice(field.selectionStart,field.selectionEnd),before=field.value.slice(0,field.selectionStart),after=field.value.slice(field.selectionEnd);
 const lineStart=before&&!before.endsWith('\n')?'\n':'';
 const text={heading:`${lineStart}## ${selected||'Tiêu đề'}`,bold:`**${selected||'Nội dung in đậm'}**`,list:`${lineStart}${(selected||'Mục thứ nhất\nMục thứ hai').split('\n').map(line=>'- '+line).join('\n')}`,link:`[${selected||'Tên liên kết'}](${url})`,image:`![${selected||'Ảnh minh họa'}](${url})`}[kind];
 field.setRangeText(text,field.selectionStart,field.selectionEnd,'end');field.dispatchEvent(new Event('input',{bubbles:true}));field.focus();
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
 for(const[id,target]of[['cover-upload','cover'],['gallery-upload','gallery'],['inline-upload','inline']])document.getElementById(id).addEventListener('change',async event=>{
  const input=event.target;input.disabled=true;
  try {
   const files=[...input.files];if(target==='gallery'&&galleryValues().length+files.length>12)throw new Error('Tối đa 12 ảnh minh họa.');
   for(const file of files){const url=await upload(file);if(target==='cover')cover.value=url;else if(target==='gallery')gallery.value=[...galleryValues(),url].join('\n');else insertMarkdown(inlineTarget,'image',url);onDirty();previews();}
  }catch(error){onError(error.message);}finally{input.disabled=false;input.value='';}
 });
 document.querySelectorAll('.markdown-toolbar').forEach(toolbar=>toolbar.addEventListener('click',event=>{
  const button=event.target.closest('[data-md]');if(!button)return;const field=document.getElementById(toolbar.dataset.editor);
  if(button.dataset.md==='image'){inlineTarget=field;document.getElementById('inline-upload').click();return;}
  let url='';if(button.dataset.md==='link'){url=prompt('Đường dẫn HTTPS:','https://');if(!url)return;try{if(new URL(url).protocol!=='https:')throw new Error();}catch{return onError('Liên kết phải dùng HTTPS.');}}
  insertMarkdown(field,button.dataset.md,url);
 }));
 cover.addEventListener('input',previews);gallery.addEventListener('input',previews);
 return{fill(post){existing=!!post;slugManual=!!post;fillExternalLinks(post?.external_links||[]);previews();},externalLinks(){return[...externalRows.querySelectorAll('.external-link-row')].map(row=>{
  const value=key=>row.querySelector(`[data-external-field="${key}"]`).value;
  return{name:value('Tên hiển thị'),url:value('URL HTTPS'),kind:value('Loại liên kết'),provider:value('Nguồn cung cấp (tùy chọn)'),size:value('Dung lượng (tùy chọn)')};
 });}};
}

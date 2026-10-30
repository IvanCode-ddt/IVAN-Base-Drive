import { CATEGORIES,filterPosts,splitFeatured } from './data.js?v=12';
import { cover,detailHTML,escapeHTML,categoryName } from './content.js?v=9';
import { createPostSource } from './post-source.js?v=9';
const source=createPostSource();
const $=s=>document.querySelector(s);
let posts=[],category='all',libraryScroll=0,routeVersion=0;
function renderFilters(){ $('#category-filters').innerHTML=[{id:'all',name:'Tất cả'},...CATEGORIES].map(c=>`<button class="filter" data-category="${c.id}" aria-pressed="${category===c.id}">${c.name}</button>`).join(''); }
function renderPosts(){
 const list=filterPosts(posts,$('#search-input').value,category);
 $('#result-count').textContent=`${list.length} bài viết`;
 const {featured,regular}=splitFeatured(list);
 $('#featured-section').hidden=!featured.length;
 $('#featured-grid').innerHTML=featured.map(p=>cardHTML(p,true)).join('');
 $('#post-grid').innerHTML=regular.map(p=>cardHTML(p)).join('');
 $('#empty-state').hidden=list.length>0;
}
function cardHTML(p,pinned=false){return `<article><a class="post-card" href="#post/${encodeURIComponent(p.slug)}" aria-label="Xem ${escapeHTML(p.title)}">${cover(p)}<div class="card-content"><div class="card-meta"><span class="category-label">${categoryName(p.category)}</span>${pinned?'<span class="pinned-badge">★ Nổi bật</span>':''}</div><h3>${escapeHTML(p.title)}</h3><p>${escapeHTML(p.description)}</p><div class="card-bottom"><span>Xem chi tiết</span><span aria-hidden="true">↗</span></div></div></a></article>`;}
async function route(){
 const version=++routeVersion,hash=location.hash,library=$('#library-view'),detail=$('#detail-view');
 if(hash.startsWith('#post/')){
  if(!library.hidden)libraryScroll=window.scrollY;
  library.hidden=true;detail.hidden=false;
  detail.innerHTML='<p role="status">Đang tải bài viết…</p>';
  try{
   const p=await source.get(decodeURIComponent(hash.slice(6)));if(version!==routeVersion)return;
   detail.innerHTML=`<a class="back-link" href="#collection">← Trở về thư viện</a>${detailHTML(p)}`;
   document.title=`${p.title} — IVAN Base Drive`;window.scrollTo(0,0);detail.querySelector('h1').focus({preventScroll:true});
  }catch(error){if(version===routeVersion)detail.innerHTML=`<a class="back-link" href="#collection">← Trở về thư viện</a><p role="alert">${escapeHTML(error.message)}</p>`;}
 }else{
  const returning=!detail.hidden;library.hidden=false;detail.hidden=true;document.title='IVAN Base Drive — Thư viện nội dung số';
  if(returning){window.scrollTo(0,libraryScroll);$('#collection-title').setAttribute('tabindex','-1');$('#collection-title').focus({preventScroll:true});}
 }
}
async function load(){
 $('#result-count').textContent='Đang tải…';$('#empty-state').hidden=true;
 try{posts=await source.list();renderPosts();$('#library-status').hidden=true;}
 catch{$('#result-count').textContent='';$('#library-status').hidden=false;$('#library-status').textContent=source.local?'Không kết nối được máy chủ. Hãy chạy npm.cmd start và mở http://localhost:3000.':'Chưa tải được dữ liệu tĩnh. Hãy chạy npm.cmd run export và cập nhật thư mục docs/ lên GitHub Pages.';}
}
$('#category-filters').addEventListener('click',e=>{const b=e.target.closest('[data-category]');if(!b)return;category=b.dataset.category;renderFilters();renderPosts();document.querySelector(`[data-category="${category}"]`).focus();});
$('#search-input').addEventListener('input',renderPosts);
$('#reset-filters').addEventListener('click',()=>{category='all';$('#search-input').value='';renderFilters();renderPosts();$('#search-input').focus();});
for(const link of document.querySelectorAll('[data-local-admin]'))link.hidden=!source.local;
$('#feedback-open').addEventListener('click',async()=>{
 const dialog=$('#feedback-dialog');dialog.showModal();$('#feedback-notice').textContent='Đang mở biểu mẫu…';
 let value=$('#feedback-open').dataset.feedbackFormUrl||'';
 if(source.local){try{const response=await fetch('/api/site-settings',{cache:'no-store'});if(response.ok)value=(await response.json()).feedbackFormUrl||'';}catch{}}
 if(!dialog.open)return;
 let url;try{url=new URL(value);if(url.protocol!=='https:'||!['docs.google.com','forms.gle'].includes(url.hostname)||url.username||url.password)url=null;}catch{}
 $('#feedback-link').hidden=!url;$('#feedback-frame').replaceChildren();
 if(!url){$('#feedback-notice').textContent='Biểu mẫu góp ý chưa được cấu hình. Vui lòng quay lại sau.';return;}
 $('#feedback-link').href=url.href;$('#feedback-notice').textContent='Phản hồi được gửi trực tiếp tới Google Forms, kể cả khi máy quản trị đang tắt. Bạn có thể dùng liên kết mở riêng nếu biểu mẫu nhúng không tải được.';
 if(url.hostname==='docs.google.com'){
   url.searchParams.set('embedded','true');const frame=document.createElement('iframe');frame.src=url.href;frame.title='Biểu mẫu góp ý Google Forms';frame.referrerPolicy='no-referrer';$('#feedback-frame').append(frame);
 }
});
$('#feedback-close').addEventListener('click',()=>{$('#feedback-dialog').close();$('#feedback-frame').replaceChildren();});
$('#feedback-dialog').addEventListener('close',()=>$('#feedback-frame').replaceChildren());
window.addEventListener('hashchange',route);renderFilters();load();route();

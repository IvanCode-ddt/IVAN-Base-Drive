import { CATEGORIES,filterPosts,splitFeatured } from './data.js?v=14';
import { cover,detailHTML,escapeHTML,categoryName,spotlightHTML } from './content.js?v=14';
import { createPostSource } from './post-source.js?v=9';
import {initPlayers} from './media.js?v=14';
const source=createPostSource();
const $=s=>document.querySelector(s);
// Public entry point only. Nothing is hidden while JS/observers are unavailable.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const ambientViewport=matchMedia('(min-width:1024px) and (hover:hover) and (pointer:fine)');
const weakDevice=(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||(navigator.deviceMemory&&navigator.deviceMemory<=4)||navigator.connection?.saveData;
const entrances=new Set();
function syncMotion(){
 document.body.classList.toggle('ambient-motion',ambientViewport.matches&&!reducedMotion.matches&&!weakDevice);
 document.body.classList.toggle('motion-paused',document.hidden);
 if(reducedMotion.matches||document.hidden)for(const animation of entrances)animation.cancel();
}
function enter(node,distance=8){
 if(!node?.animate||reducedMotion.matches||document.hidden||weakDevice)return;
 const animation=node.animate([{opacity:.92,transform:`translate3d(0,${distance}px,0)`},{opacity:1,transform:'translate3d(0,0,0)'}],{duration:230,easing:'cubic-bezier(.22,.7,.25,1)'});
 entrances.add(animation);animation.finished.then(()=>entrances.delete(animation),()=>entrances.delete(animation));
}
reducedMotion.addEventListener?.('change',syncMotion);ambientViewport.addEventListener?.('change',syncMotion);
document.addEventListener('visibilitychange',syncMotion);syncMotion();
let posts=[],category='all',libraryScroll=0,routeVersion=0;
let disposePlayers=()=>{};
function renderFilters(){
 const filters=$('#category-filters');
 if(!filters.children.length)filters.innerHTML=[{id:'all',name:'Tất cả'},...CATEGORIES].map(c=>`<button class="filter" data-category="${c.id}">${c.name}</button>`).join('');
 for(const button of filters.children)button.setAttribute('aria-pressed',String(button.dataset.category===category));
}
function renderPosts(){
 const list=filterPosts(posts,$('#search-input').value,category);
 $('#result-count').textContent=`${list.length} bài viết`;
 const {spotlight,featured,regular}=splitFeatured(list,{spotlight:category==='all'&&!$('#search-input').value.trim()});
 const spotlightSection=$('#spotlight');
 if(spotlightSection.dataset.postId!==(spotlight?.id||'')){spotlightSection.innerHTML=spotlight?spotlightHTML(spotlight):'';spotlightSection.dataset.postId=spotlight?.id||'';if(spotlight)enter(spotlightSection.querySelector('.spotlight-copy'),6);}
 spotlightSection.hidden=!spotlight;$('.hero').hidden=!!spotlight;
 $('#featured-section').hidden=!featured.length;
 $('#featured-grid').innerHTML=featured.map(p=>cardHTML(p,true)).join('');
 $('#post-grid').innerHTML=regular.map(p=>cardHTML(p)).join('');
 $('#empty-state').hidden=list.length>0;
}
function cardHTML(p,pinned=false){return `<article><a class="post-card" href="#post/${encodeURIComponent(p.slug)}" aria-label="Xem ${escapeHTML(p.title)}">${cover(p)}<div class="card-content"><div class="card-meta"><span class="category-label">${categoryName(p.category)}</span>${pinned?'<span class="pinned-badge">★ Nổi bật</span>':''}</div><h3>${escapeHTML(p.title)}</h3><p>${escapeHTML(p.description)}</p><div class="card-bottom"><span>Xem chi tiết</span><span aria-hidden="true">↗</span></div></div></a></article>`;}
async function route(){
 disposePlayers();disposePlayers=()=>{};
 const version=++routeVersion,hash=location.hash,library=$('#library-view'),detail=$('#detail-view');
 if(hash.startsWith('#post/')){
  if(!library.hidden)libraryScroll=window.scrollY;
  library.hidden=true;detail.hidden=false;
  detail.innerHTML='<p role="status">Đang tải bài viết…</p>';
  try{
   const p=await source.get(decodeURIComponent(hash.slice(6)));if(version!==routeVersion)return;
   detail.innerHTML=`<a class="back-link" href="#collection">← Trở về thư viện</a>${detailHTML(p)}`;
   disposePlayers=initPlayers(detail);
   enter(detail.querySelector('.detail-header'));
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
window.addEventListener('hashchange',route);renderFilters();load();route();enter($('#spotlight').hidden?$('.hero-copy'):$('#spotlight .spotlight-copy'),6);

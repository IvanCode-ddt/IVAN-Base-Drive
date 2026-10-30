import { CATEGORIES,filterPosts,sortPinnedPosts } from './data.js?v=15';
import { cover,detailHTML,escapeHTML,categoryName,spotlightHTML } from './content.js?v=15';
import { createPostSource } from './post-source.js?v=10';
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
let highlightTimer;
function renderFilters(){
 const filters=$('#category-filters');
 if(!filters.children.length)filters.innerHTML=[{id:'all',name:'Tất cả'},...CATEGORIES].map(c=>`<button class="filter" data-category="${c.id}">${c.name}</button>`).join('');
 for(const button of filters.children)button.setAttribute('aria-pressed',String(button.dataset.category===category));
}
function renderPosts(){
 const list=sortPinnedPosts(filterPosts(posts,$('#search-input').value,category));
 $('#result-count').textContent=`${list.length} bài viết`;
 $('#post-grid').innerHTML=list.map(p=>cardHTML(p)).join('');
 $('#empty-state').hidden=list.length>0;
}
function renderHighlights(config){
 const available=new Map(posts.filter(post=>post.status==='published'&&!post.deleted_at).map(post=>[post.id,post]));
 const slides=config?.enabled?config.slides.filter(slide=>slide.enabled).map(slide=>slide.post||available.get(slide.post_id)).filter(Boolean):[];
 const section=$('#spotlight'),hero=$('.hero');
 clearInterval(highlightTimer);highlightTimer=undefined;
 if(!slides.length){section.replaceChildren();section.hidden=true;hero.hidden=false;return;}
 section.innerHTML=slides.map((post,index)=>spotlightHTML(post,{active:index===0,index})).join('')+
  (slides.length>1?`<div class="spotlight-controls" aria-label="Điều khiển Highlight"><button type="button" data-highlight-prev aria-label="Highlight trước">‹</button><div class="spotlight-indicators">${slides.map((post,index)=>`<button type="button" data-highlight-index="${index}" aria-label="Hiện Highlight ${index+1}: ${escapeHTML(post.title)}" aria-current="${index===0}">${index+1}</button>`).join('')}</div><button type="button" data-highlight-next aria-label="Highlight tiếp">›</button><button type="button" data-highlight-pause aria-pressed="false" aria-label="Tạm dừng tự chuyển">Ⅱ</button></div>`:'');
 section.hidden=false;hero.hidden=true;
 if(slides.length===1)return;
 const items=[...section.querySelectorAll('[data-highlight-slide]')],dots=[...section.querySelectorAll('[data-highlight-index]')];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let active=0,manualPaused=false,hovered=false,focused=false;
 const show=(next,direction=1)=>{
  const previous=active;active=(next+items.length)%items.length;
  items.forEach((item,index)=>{
   item.classList.toggle('is-active',index===active);
   item.classList.toggle('is-before',index===previous&&direction>0);
   item.setAttribute('aria-hidden',String(index!==active));item.inert=index!==active;
   const image=item.querySelector('.spotlight-cover');
   if(index===active&&image?.dataset.src){image.src=image.dataset.src;delete image.dataset.src;if(image.dataset.srcset){image.srcset=image.dataset.srcset;delete image.dataset.srcset;}image.loading='eager';}
  });
  dots.forEach((dot,index)=>dot.setAttribute('aria-current',String(index===active)));
 };
 const pauseButton=section.querySelector('[data-highlight-pause]');
 const syncPauseLabel=()=>{pauseButton.textContent=manualPaused?'▶':'Ⅱ';pauseButton.setAttribute('aria-label',manualPaused?'Phát tự chuyển Highlight':'Tạm dừng tự chuyển Highlight');pauseButton.setAttribute('aria-pressed',String(manualPaused));};
 const schedule=()=>{
  clearInterval(highlightTimer);highlightTimer=undefined;
  if(document.hidden||reduced.matches||hovered||focused||manualPaused)return;
  highlightTimer=setInterval(()=>show(active+1,1),Math.max(3,Math.min(20,config.interval_seconds||6))*1000);
 };
 section.addEventListener('pointerenter',()=>{hovered=true;schedule();});
 section.addEventListener('pointerleave',()=>{hovered=false;schedule();});
 section.addEventListener('focusin',()=>{focused=true;schedule();});
 section.addEventListener('focusout',event=>{if(!section.contains(event.relatedTarget)){focused=false;schedule();}});
 section.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.matches('[data-highlight-pause]'))manualPaused=!manualPaused;
  else if(button.matches('[data-highlight-prev]')){manualPaused=true;show(active-1,-1);}
  else if(button.matches('[data-highlight-next]')){manualPaused=true;show(active+1,1);}
  else if(button.dataset.highlightIndex!==undefined){manualPaused=true;show(Number(button.dataset.highlightIndex),Number(button.dataset.highlightIndex)>active?1:-1);}
  syncPauseLabel();schedule();
 });
 document.addEventListener('visibilitychange',schedule);
 reduced.addEventListener?.('change',schedule);
 syncPauseLabel();schedule();
}
function cardHTML(p){return `<article><a class="post-card" href="#post/${encodeURIComponent(p.slug)}" aria-label="Xem ${escapeHTML(p.title)}">${cover(p)}<div class="card-content"><div class="card-meta"><span class="category-label">${categoryName(p.category)}</span>${p.is_pinned?'<span class="pinned-badge">★ Ghim</span>':''}</div><h3>${escapeHTML(p.title)}</h3><p>${escapeHTML(p.description)}</p><div class="card-bottom"><span>Xem chi tiết</span><span aria-hidden="true">↗</span></div></div></a></article>`;}
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
$('#detail-view').addEventListener('click',event=>{
 const jump=event.target.closest('[data-download-jump]');
 if(!jump)return;
 const panel=$('#download-panel');
 panel?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
 panel?.focus({preventScroll:true});
});
async function load(){
 $('#result-count').textContent='Đang tải…';$('#empty-state').hidden=true;
 try{posts=await source.list();renderPosts();$('#library-status').hidden=true;try{renderHighlights(await source.highlights());}catch(error){console.error('Không tải được cấu hình Highlight:',error);renderHighlights(null);}}
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

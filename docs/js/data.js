export const CATEGORIES = [{id:'film',name:'Phim'},{id:'game',name:'Game'},{id:'music',name:'Nhạc'},{id:'app',name:'Ứng dụng'},{id:'other',name:'Khác'}];
export function normalizeSearch(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase(); }
export function filterPosts(posts,query='',category='all') {
 const term=normalizeSearch(query.trim());
 return posts.filter(p=>p.status==='published'&&!p.deleted_at&&(category==='all'||p.category===category)&&normalizeSearch(`${p.title} ${p.description} ${CATEGORIES.find(c=>c.id===p.category)?.name||''}`).includes(term));
}
export function sortPinnedPosts(posts) {
 return posts.map((post,index)=>({post,index})).sort((a,b)=>{
  const aPinned=a.post.is_pinned===true||a.post.is_pinned===1;
  const bPinned=b.post.is_pinned===true||b.post.is_pinned===1;
  return Number(bPinned)-Number(aPinned)||(aPinned?(a.post.pin_order||0)-(b.post.pin_order||0):0)||a.index-b.index;
 }).map(({post})=>post);
}
export function splitFeatured(posts,{spotlight:showSpotlight=true}={}){
 const spotlight=showSpotlight?posts.find(post=>post.status==='published'&&!post.deleted_at&&(post.is_spotlight===true||post.is_spotlight===1))||null:null;
 const featured=posts.filter(post=>post.id!==spotlight?.id&&post.status==='published'&&(post.is_pinned===true||post.is_pinned===1))
   .sort((a,b)=>(a.pin_order||0)-(b.pin_order||0)||String(a.id).localeCompare(String(b.id))).slice(0,5);
 const ids=new Set(featured.map(post=>post.id));if(spotlight)ids.add(spotlight.id);
 return{spotlight,featured,regular:posts.filter(post=>!ids.has(post.id))};
}

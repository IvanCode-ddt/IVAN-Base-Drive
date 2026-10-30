export const CATEGORIES = [{id:'film',name:'Phim'},{id:'game',name:'Game'},{id:'music',name:'Nhạc'},{id:'app',name:'Ứng dụng'},{id:'other',name:'Khác'}];
export function normalizeSearch(value) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase(); }
export function filterPosts(posts,query='',category='all') {
 const term=normalizeSearch(query.trim());
 return posts.filter(p=>(category==='all'||p.category===category)&&normalizeSearch(`${p.title} ${p.description} ${CATEGORIES.find(c=>c.id===p.category)?.name||''}`).includes(term));
}
export function splitFeatured(posts){
 const featured=posts.filter(post=>post.status==='published'&&(post.is_pinned===true||post.is_pinned===1))
   .sort((a,b)=>(a.pin_order||0)-(b.pin_order||0)||String(a.id).localeCompare(String(b.id))).slice(0,5);
 const ids=new Set(featured.map(post=>post.id));
 return{featured,regular:posts.filter(post=>!ids.has(post.id))};
}

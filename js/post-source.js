export function isLocalBackend(location) {
  const pathname=location.pathname||new URL(location.href).pathname;
  return !pathname.startsWith('/api/admin/publish/previews/')&&['localhost','127.0.0.1','[::1]','::1'].includes(location.hostname) && location.port === '3000';
}
export function createPostSource({location=globalThis.location,fetcher=globalThis.fetch}={}) {
  const local=isLocalBackend(location);
  let snapshot,albumSnapshot;
  async function json(url) {
    const response=await fetcher(url,{cache:'no-store'});
    if(!response.ok) throw new Error(response.status===404?'Bài viết không tồn tại hoặc chưa được xuất bản.':'Không tải được dữ liệu bài viết.');
    return response.json();
  }
  async function staticPosts() {
    if(!snapshot) snapshot=json(new URL('./content/posts.json',location.href).href).then(data=>{
      if(data.schemaVersion!==1 || !Array.isArray(data.posts) || data.posts.some(p=>p.status!=='published'))throw new Error('Dữ liệu tĩnh không hợp lệ. Hãy xuất lại website.');
      return data.posts;
    }).catch(error=>{snapshot=undefined;throw error;});
    return snapshot;
  }
  async function highlights() {
    const data=await json(local?'/api/highlights':new URL('./content/highlights.json',location.href).href);
    if(data.schemaVersion!==1||typeof data.enabled!=='boolean'||!Number.isInteger(data.interval_seconds)||!Array.isArray(data.slides))throw new Error('Cấu hình Highlight không hợp lệ. Hãy xuất lại website.');
    return data;
  }
  async function musicAlbums() {
    if(!albumSnapshot)albumSnapshot=json(local?'/api/music/albums':new URL('./content/music.json',location.href).href).then(data=>{
      if(data.schemaVersion!==1||!Array.isArray(data.albums)||data.albums.some(album=>typeof album.title!=='string'||!Array.isArray(album.bundle_downloads)))throw new Error(local?'Dữ liệu album nhạc không hợp lệ.':'Dữ liệu album nhạc không hợp lệ. Hãy xuất lại website.');
      return data.albums;
    }).catch(error=>{albumSnapshot=undefined;throw error;});
    return albumSnapshot;
  }
  return {
    local,
    list:()=>local?json('/api/posts'):staticPosts(),
    highlights,
    musicAlbums,
    async get(slug) {
      if(local)return json(`/api/posts/${encodeURIComponent(slug)}`);
      const post=(await staticPosts()).find(p=>p.slug===slug);
      if(!post)throw new Error('Bài viết không tồn tại hoặc chưa được xuất bản.');
      return post;
    },
  };
}

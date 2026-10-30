import { imageURL } from './media.js?v=17';
import { escapeHTML } from './content.js?v=17';

const safeURL=value=>{
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
};
const time=value=>{
  if(!Number.isInteger(value)||value<0)return '';
  return`${Math.floor(value/60)}:${String(value%60).padStart(2,'0')}`;
};
export function albumCardHTML(album){
  const image=imageURL(album.cover_url),label=[album.artist,album.release_year,album.genre].filter(Boolean).map(escapeHTML).join(' · ');
  return`<article><a class="album-card" href="#album/${encodeURIComponent(album.slug)}">${image?`<img src="${escapeHTML(image)}" alt="" loading="lazy" decoding="async">`:'<div class="album-cover-placeholder" aria-hidden="true">♫</div>'}<div class="album-card-copy"><span class="eyebrow">ALBUM NHẠC · ${album.tracks.length} BÀI</span><h3>${escapeHTML(album.title)}</h3><p>${label||'Tuyển tập nhạc'}</p><span class="album-card-cta">Mở album <span aria-hidden="true">↗</span></span></div></a></article>`;
}
export function albumDetailHTML(album){
  const image=imageURL(album.cover_url),playable=album.tracks.filter(track=>track.source_kind==='direct'&&safeURL(track.playback_url));
  const tracks=album.tracks.map((track,index)=>{
    const canPlay=track.source_kind==='direct'&&!!safeURL(track.playback_url),preview=track.source_kind==='drive_preview'?safeURL(track.open_url):'';
    const duration=time(track.duration_seconds),download=track.download?.url?safeURL(track.download.url):'';
    const status=canPlay?'Phát trực tiếp':preview?'Google Drive preview':download?'Chỉ tải':'Chưa có nguồn công khai';
    return`<li class="album-track" data-track-id="${escapeHTML(track.id)}"><span class="track-number">${index+1}</span><div class="track-copy"><strong>${escapeHTML(track.title)}</strong><small>${escapeHTML(status)}${duration?` · ${duration}`:''}</small></div><div class="track-actions">${canPlay?`<button type="button" class="secondary-button" data-play-track="${index}" aria-label="Phát ${escapeHTML(track.title)}">Phát</button>`:preview?`<a class="secondary-button" href="${escapeHTML(preview)}" target="_blank" rel="noopener noreferrer">Mở trên Google Drive ↗</a>`:''}${download?`<a class="secondary-button" href="${escapeHTML(download)}" target="_blank" rel="noopener noreferrer" download>Tải bài hát</a>`:''}</div></li>`;
  }).join('');
  const bundle=album.bundle_download?.url?safeURL(album.bundle_download.url):'';
  return`<a class="back-link" href="#music">← Trở về Nhạc</a><article class="album-detail" data-album-player><header class="album-detail-header">${image?`<img class="album-detail-cover" src="${escapeHTML(image)}" alt="Ảnh bìa ${escapeHTML(album.title)}" decoding="async">`:'<div class="album-detail-cover album-cover-placeholder" aria-hidden="true">♫</div>'}<div><p class="eyebrow">ALBUM NHẠC</p><h1 tabindex="-1">${escapeHTML(album.title)}</h1>${album.artist?`<p class="album-artist">${escapeHTML(album.artist)}</p>`:''}${album.description?`<p>${escapeHTML(album.description)}</p>`:''}<p class="album-meta">${album.tracks.length} bài${album.release_year?` · ${album.release_year}`:''}${album.genre?` · ${escapeHTML(album.genre)}`:''}</p><div class="album-actions">${playable.length?`<button type="button" class="primary-button" data-play-album>Phát album</button><button type="button" class="secondary-button" data-shuffle>Phát ngẫu nhiên</button><button type="button" class="secondary-button" data-repeat aria-pressed="false">Lặp: Tắt</button>`:''}${bundle?`<a class="secondary-button" href="${escapeHTML(bundle)}" target="_blank" rel="noopener noreferrer" download>Tải toàn bộ album</a>`:''}</div></div></header><section class="album-track-section" aria-labelledby="album-track-title"><h2 id="album-track-title">Danh sách bài hát</h2><ol class="album-track-list">${tracks||'<li>Chưa có track.</li>'}</ol></section><audio class="album-audio" controls preload="none" hidden aria-label="Trình phát album"></audio><div class="album-player-controls" hidden><button type="button" class="secondary-button" data-previous aria-label="Bài trước">Trước</button><button type="button" class="secondary-button" data-next aria-label="Bài tiếp">Tiếp</button></div><p class="album-player-status" role="status" aria-live="polite">Chọn Phát trên một bài để bắt đầu. Không có âm thanh nào được tải trước.</p>${album.tracks.some(track=>track.source_kind==='download_only'||track.source_kind==='drive_preview')?'<p class="album-source-note">Một số bài chỉ tải được hoặc mở bằng Google Drive; chúng không nằm trong playlist HTML5 và sẽ được bỏ qua khi phát cả album.</p>':''}</article>`;
}

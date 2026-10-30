const safeURL=value=>{
  try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
};

export function initAlbumPlayer(root,album){
  const widget=root.querySelector('[data-album-player]');if(!widget)return()=>{};
  const audio=widget.querySelector('audio'),status=widget.querySelector('.album-player-status');
  const controls=widget.querySelector('.album-player-controls'),playable=album.tracks.map((track,index)=>({track,index}))
    .filter(({track})=>track.source_kind==='direct'&&safeURL(track.playback_url)&&audio.canPlayType(track.mime_type));
  const canPlay=new Set(playable.map(item=>item.index));
  for(const button of widget.querySelectorAll('[data-play-track]')){
    const index=Number(button.dataset.playTrack);
    if(!canPlay.has(index)){button.disabled=true;button.textContent='Không hỗ trợ';}
  }
  let order=playable.map(item=>item.index),position=-1,repeat='off',disposed=false,playGeneration=0,playbackHint='';
  const announce=text=>{status.textContent=text;};
  const playAt=async(index)=>{
    if(disposed||!canPlay.has(index))return;
    position=order.indexOf(index);if(position<0){order=[...playable.map(item=>item.index)];position=order.indexOf(index);}
    const track=album.tracks[index],url=safeURL(track.playback_url);if(!url)return;
    const generation=++playGeneration;audio.pause();audio.hidden=false;controls.hidden=false;audio.loop=false;audio.src=url;audio.load();
    announce(`Đang mở: ${track.title}${playbackHint}`);
    try{await audio.play();if(!disposed&&generation===playGeneration)announce(`Đang phát: ${track.title}${playbackHint}`);}
    catch(error){if(disposed||generation!==playGeneration||error.name==='AbortError')return;announce(`Không phát được “${track.title}”. Kiểm tra mạng/quyền truy cập, thử lại hoặc chuyển bài.`);}
  };
  const shuffleOrder=()=>{
    const values=playable.map(item=>item.index);
    for(let i=values.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
    return values;
  };
  const next=fromEnd=>{
    if(position<0)return;
    if(position+1<order.length){playAt(order[position+1]);return;}
    if(repeat==='all'){playAt(order[0]);return;}
    if(!fromEnd)announce('Đã đến bài cuối trong album.');
    else announce('Album đã phát xong.');
  };
  const onClick=event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.matches('[data-play-track]')){order=playable.map(item=>item.index);playbackHint='';playAt(Number(button.dataset.playTrack));}
    else if(button.matches('[data-play-album]')){
      order=playable.map(item=>item.index);const skipped=album.tracks.length-order.length;
      playbackHint=skipped?` · ${skipped} bài chỉ tải hoặc không tương thích được bỏ qua.`:'';announce(`Đang phát album${playbackHint}`);
      playAt(order[0]);
    }else if(button.matches('[data-shuffle]')){
      order=shuffleOrder();position=-1;
      const skipped=album.tracks.length-order.length;
      playbackHint=skipped?` · ${skipped} bài không phát trực tiếp được bỏ qua.`:'';announce(`Đang phát ngẫu nhiên${playbackHint}`);
      playAt(order[0]);
    }else if(button.matches('[data-repeat]')){
      repeat=repeat==='off'?'all':repeat==='all'?'one':'off';
      button.textContent=`Lặp: ${repeat==='off'?'Tắt':repeat==='all'?'Album':'Bài này'}`;
      button.setAttribute('aria-pressed',String(repeat!=='off'));
    }else if(button.matches('[data-next]'))next(false);
    else if(button.matches('[data-previous]')){
      if(position<0)return;
      if(audio.currentTime>3){audio.currentTime=0;return;}
      if(position>0)playAt(order[position-1]);
      else if(repeat==='all')playAt(order[order.length-1]);
      else audio.currentTime=0;
    }
  };
  const onEnded=()=>{if(repeat==='one'){audio.currentTime=0;audio.play().catch(()=>announce('Không thể phát lại track. Hãy thử lại.'));}else next(true);};
  const onError=()=>{if(!disposed)announce(`Lỗi khi tải “${album.tracks[order[position]]?.title||'bài hát'}”. Kiểm tra quyền truy cập hoặc mạng; bạn có thể thử lại hay chuyển bài.`);};
  widget.addEventListener('click',onClick);audio.addEventListener('ended',onEnded);audio.addEventListener('error',onError);
  return()=>{
    disposed=true;playGeneration++;widget.removeEventListener('click',onClick);audio.removeEventListener('ended',onEnded);audio.removeEventListener('error',onError);
    audio.pause();audio.removeAttribute('src');audio.load();
  };
}

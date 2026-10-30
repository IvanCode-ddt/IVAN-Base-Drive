import { imageURL } from './media.js?v=14';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inline(text,depth=0) {
  if(depth>4)return esc(text);
  const pattern=/!\[([^\]\n]*)\]\(([^\s)]+)\)|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*/g;
  let html='',position=0;
  for(const m of text.matchAll(pattern)){
    html+=esc(text.slice(position,m.index));position=m.index+m[0].length;
    if(m[2]!==undefined){const url=imageURL(m[2]);html+=url?`<img src="${esc(url)}" alt="${esc(m[1])}" loading="lazy" referrerpolicy="no-referrer">`:esc(m[1]);}
    else if(m[4]!==undefined){let url='';try{const u=new URL(m[4]);if(u.protocol==='https:'&&!u.username&&!u.password)url=u.href;}catch{}html+=url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(m[3])}</a>`:esc(m[3]);}
    else html+=`<strong>${inline(m[5],depth+1)}</strong>`;
  }
  return html+esc(text.slice(position));
}
export function renderMarkdown(value='') {
  const lines=String(value).replace(/\r/g,'').split('\n');let html='',paragraph=[],list=[],listType='';
  const flushParagraph=()=>{if(paragraph.length){html+=`<p>${paragraph.map(line=>inline(line)).join('<br>')}</p>`;paragraph=[];}};
  const flushList=()=>{if(list.length){html+=`<${listType}>${list.map(line=>`<li>${inline(line)}</li>`).join('')}</${listType}>`;list=[];listType='';}};
  for(const line of lines){
    const heading=line.match(/^(#{1,4})\s+(.+)$/),item=line.match(/^\s*(?:(-)|\d+\.)\s+(.+)$/);
    if(!line.trim()){flushParagraph();flushList();}
    else if(heading){flushParagraph();flushList();const level=Math.min(heading[1].length+1,5);html+=`<h${level}>${inline(heading[2])}</h${level}>`;}
    else if(item){flushParagraph();const type=item[1]?'ul':'ol';if(type!==listType)flushList();listType=type;list.push(item[2]);}
    else{flushList();paragraph.push(line);}
  }
  flushParagraph();flushList();return html;
}

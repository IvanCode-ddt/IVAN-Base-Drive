import { imageURL } from './media.js?v=14';
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function safeLink(value){
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}
}
function linkify(text){
  const pattern=/https?:\/\/[^\s<>"'`]+/gi;let html='',position=0;
  for(const match of text.matchAll(pattern)){
    let url=match[0],trailing='';
    while(/[.,!?;:]$/.test(url)){trailing=url.slice(-1)+trailing;url=url.slice(0,-1);}
    while(url.endsWith(')')&&(url.match(/\(/g)||[]).length<(url.match(/\)/g)||[]).length){trailing=')'+trailing;url=url.slice(0,-1);}
    html+=esc(text.slice(position,match.index));
    const safe=safeLink(url);html+=safe?`<a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>${esc(trailing)}`:esc(match[0]);
    position=match.index+match[0].length;
  }
  return html+esc(text.slice(position));
}
function inline(text,depth=0) {
  if(depth>4)return esc(text);
  const pattern=/`([^`\n]+)`|!\[([^\]\n]*)\]\(([^\s)]+)\)|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^*\n]+)\*\*/g;
  let html='',position=0;
  for(const m of text.matchAll(pattern)){
    html+=linkify(text.slice(position,m.index));position=m.index+m[0].length;
    if(m[1]!==undefined)html+=`<code>${esc(m[1])}</code>`;
    else if(m[3]!==undefined){const url=imageURL(m[3]);html+=url?`<img src="${esc(url)}" alt="${esc(m[2])}" loading="lazy" referrerpolicy="no-referrer">`:esc(m[2]);}
    else if(m[5]!==undefined){const url=safeLink(m[5]);html+=url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(m[4])}</a>`:esc(m[4]);}
    else html+=`<strong>${inline(m[6],depth+1)}</strong>`;
  }
  return html+linkify(text.slice(position));
}
export function renderMarkdown(value='') {
  const lines=String(value).replace(/\r/g,'').split('\n');let html='',paragraph=[],list=[],listType='',code=[],inCode=false;
  const flushParagraph=()=>{if(paragraph.length){html+=`<p>${paragraph.map(line=>inline(line)).join('<br>')}</p>`;paragraph=[];}};
  const flushList=()=>{if(list.length){html+=`<${listType}>${list.map(line=>`<li>${inline(line)}</li>`).join('')}</${listType}>`;list=[];listType='';}};
  for(const line of lines){
    if(inCode||/^\s*```/.test(line)){
      if(/^\s*```/.test(line)){
        flushParagraph();flushList();
        if(inCode){html+=`<pre><code>${esc(code.join('\n'))}</code></pre>`;code=[];inCode=false;}
        else inCode=true;
      }else code.push(line);
      continue;
    }
    const heading=line.match(/^(#{1,4})\s+(.+)$/),item=line.match(/^\s*(?:(-)|\d+\.)\s+(.+)$/);
    if(!line.trim()){flushParagraph();flushList();}
    else if(heading){flushParagraph();flushList();const level=Math.min(heading[1].length+1,5);html+=`<h${level}>${inline(heading[2])}</h${level}>`;}
    else if(item){flushParagraph();const type=item[1]?'ul':'ol';if(type!==listType)flushList();listType=type;list.push(item[2]);}
    else{flushList();paragraph.push(line);}
  }
  if(inCode)html+=`<pre><code>${esc(code.join('\n'))}</code></pre>`;
  flushParagraph();flushList();return html;
}

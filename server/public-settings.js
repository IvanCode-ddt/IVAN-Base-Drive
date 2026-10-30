export function publicFormURL(value=''){
 try{const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password)return '';
  if(url.hostname==='docs.google.com'&&/^\/forms\/d\/(?:e\/)?[a-zA-Z0-9_-]+\/viewform\/?$/.test(url.pathname))return url.origin+url.pathname;
  if(url.hostname==='forms.gle'&&/^\/[a-zA-Z0-9_-]+$/.test(url.pathname))return url.origin+url.pathname;
 }catch{}
 return '';
}
export const DEFAULT_FEEDBACK_FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSchKxiDiEG3JKwMHp05ezqPbdbks6cssk-Lhp46ogd-9CuP-A/viewform';

import {initDrive} from './drive.js?v=9';
const api=async(url,options={})=>{
 const response=await fetch(url,{...options,headers:{'Content-Type':'application/json','X-CSRF-Token':csrf,...options.headers}});
 if(response.status===401){location.assign('/login');throw new Error('Cần đăng nhập quản trị.');}
 const data=await response.json();if(!response.ok)throw new Error(data.error||'Yêu cầu thất bại.');return data;
};
let csrf='';
try{
 csrf=(await api('/api/admin/session')).csrfToken;
 const ui=await initDrive({api,openDraft:post=>location.assign(`/admin/editor.html?edit=${encodeURIComponent(post.id)}`),refreshPosts:async()=>{},beforeDraft:()=>true});
 document.querySelector('#drive-target').addEventListener('change',event=>ui.showPost(event.target.value?{id:event.target.value}:null));
 document.querySelector('#drive-toggle').click();
}catch(error){document.querySelector('#message').textContent=error.message;}

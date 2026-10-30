export function createNotifications(){
 const region=document.createElement('div');region.className='admin-toast-region';region.setAttribute('aria-label','Thông báo');region.setAttribute('aria-live','polite');region.setAttribute('aria-relevant','additions');
 document.body.append(region);const active=new Map();
 function show(message,type='success'){
  if(active.has(message))return;
  const toast=document.createElement('div');toast.className=`admin-toast admin-toast--${type}`;toast.setAttribute('role',type==='error'?'alert':'status');
  const text=document.createElement('span');text.textContent=message;
  const close=document.createElement('button');close.type='button';close.className='admin-toast__close';close.setAttribute('aria-label','Đóng thông báo');close.textContent='×';
  let timer;
  const remove=()=>{clearTimeout(timer);active.delete(message);toast.remove();};
  close.addEventListener('click',remove);toast.append(text,close);region.append(toast);
  timer=setTimeout(remove,5000);active.set(message,timer);
  while(region.children.length>3)region.firstElementChild.querySelector('button').click();
 }
 return{success:message=>show(message,'success'),error:message=>show(message,'error'),warning:message=>show(message,'warning'),info:message=>show(message,'info')};
}

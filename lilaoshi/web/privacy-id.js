/* Resolve the same browser identity used by the learning dashboard. */
async function mountPrivacyId(root=document){
 const button=root.querySelector('#privacy-user-id'),value=root.querySelector('#privacy-id-value'),status=root.querySelector('#privacy-id-status');if(!button||!value||!status)return;
 let toastTimer;
 function notify(message){status.textContent=message;status.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>status.hidden=true,1800)}
 try{
  const visitor=localStorage.getItem('lilaoshi-visitor')||crypto.randomUUID();localStorage.setItem('lilaoshi-visitor',visitor);
  const response=await fetch('api/identity',{method:'POST',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitor})});if(!response.ok)throw Error();const data=await response.json();if(!/^[A-Z0-9]{3,12}$/.test(data.id))throw Error();
  value.textContent=data.id;button.disabled=false;
  button.addEventListener('click',async()=>{
   const field=document.createElement('textarea');field.value=data.id;field.readOnly=true;field.style.cssText='position:fixed;opacity:0;pointer-events:none';(root.body||root).append(field);field.select();field.setSelectionRange(0,data.id.length);
   let copied=false;try{copied=document.execCommand('copy')}catch{}finally{field.remove();button.focus({preventScroll:true})}
   try{if(!copied)await navigator.clipboard.writeText(data.id);notify('用户 ID 已复制')}catch{notify('复制失败，请再试一次')}
  });
 }catch{value.textContent='暂时无法读取用户 ID，请稍后刷新再试。'}
}
window.RefinePrivacyId={mount:mountPrivacyId};
if(document.querySelector('#privacy-user-id'))mountPrivacyId();

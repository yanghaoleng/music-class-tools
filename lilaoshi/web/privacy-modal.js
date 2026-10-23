/* Keep the agreement in the current page, with the same copyable user identity. */
(()=>{
 const trigger=document.querySelector('#privacy-open'),dialog=document.querySelector('#privacy-dialog'),content=document.querySelector('#privacy-content');if(!trigger||!dialog||!content)return;
 let loading=null,ready=false;
 async function load(){
  if(ready)return;if(loading)return loading;
  content.innerHTML='<p role="status">正在读取用户隐私协议…</p>';
  loading=(async()=>{try{
   const response=await fetch('privacy.html');if(!response.ok)throw Error();const documentCopy=new DOMParser().parseFromString(await response.text(),'text/html'),main=documentCopy.querySelector('main');if(!main)throw Error();
   content.innerHTML=main.innerHTML;ready=true;await window.RefinePrivacyId.mount(content);content.querySelector('h1')?.setAttribute('tabindex','-1');if(dialog.open)content.querySelector('h1')?.focus({preventScroll:true});
  }catch{content.innerHTML='<p role="status">暂时无法读取协议，请关闭后重试。</p>'}finally{loading=null}})();return loading;
 }
 trigger.addEventListener('click',event=>{event.preventDefault();if(!dialog.open)dialog.showModal();document.body.classList.add('privacy-open');load()});
 dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
 dialog.addEventListener('close',()=>{document.body.classList.remove('privacy-open');trigger.focus({preventScroll:true})});
})();

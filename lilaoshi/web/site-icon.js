/* A shuffled expression bag is shared by the header, favicon and home-screen icon. */
(()=>{
 const moods=['neutral','happy','thinking','curious','surprised','encouraging','empathetic','confused','playful','delighted','approving','inspired','relieved','grateful','amused','cool','confident','mischievous'];
 const base=new URL('assets/icons/',document.currentScript.src);let previous='',bag=[];
 try{previous=sessionStorage.getItem('lilaoshi-site-expression')||'';const saved=JSON.parse(sessionStorage.getItem('lilaoshi-site-expression-bag')||'[]');if(Array.isArray(saved))bag=[...new Set(saved.filter(mood=>moods.includes(mood)&&mood!==previous))]}catch{}
 if(!bag.length){bag=moods.filter(mood=>mood!==previous);for(let i=bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]]}}
 const mood=bag.pop();try{sessionStorage.setItem('lilaoshi-site-expression',mood);sessionStorage.setItem('lilaoshi-site-expression-bag',JSON.stringify(bag))}catch{}
 const asset=size=>new URL(mood+'-'+size,base).href;
 function apply(){document.querySelectorAll('.brand-icon').forEach(image=>{image.removeAttribute('srcset');image.src=asset('96.webp')});document.querySelectorAll('link[rel="icon"]').forEach(link=>{link.type='image/png';link.sizes='32x32';link.href=asset('32.png')});document.querySelectorAll('link[rel="apple-touch-icon"]').forEach(link=>link.href=asset('180.png'))}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();

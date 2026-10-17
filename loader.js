(()=>{
 const overlay=document.getElementById('appLoader');if(!overlay)return;
 const started=performance.now();let done=false;
 const finish=()=>{if(done)return;done=true;clearTimeout(fallback);setTimeout(()=>{
  document.body.setAttribute('aria-busy','false');overlay.classList.add('ap-loader-done');setTimeout(()=>overlay.remove(),300);
 },Math.max(0,350-(performance.now()-started)))};
 const fallback=setTimeout(finish,8000);
 window.addEventListener('aviator-ready',finish,{once:true});
 if(window.__aviatorReady)finish();
})();

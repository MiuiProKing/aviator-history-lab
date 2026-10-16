window.BeeCloud=(()=>{
 'use strict';const config=window.BOG_CLOUD,storage='aviator_bee_cloud_access_20261017';let access='';
 const hash=new URLSearchParams(location.hash.slice(1)),provided=hash.get('access');
 try{access=provided||sessionStorage.getItem(storage)||'';if(provided)sessionStorage.setItem(storage,provided);}catch{access=provided||'';}
 if(provided)history.replaceState(null,'',location.pathname+location.search+'#overview');
 async function request(method='GET',body=null){
  if(method!=='GET'&&!/^[A-Za-z0-9_-]{32,128}$/.test(access))throw Error('Для BeeAI нужна персональная ссылка или код доступа');
  const response=await fetch(config.url+'/functions/v1/aviator-beeai',{method,headers:{apikey:config.anonKey,'x-bee-access':access,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(response.status===403?'Код доступа к BeeAI не принят':'BeeAI Supabase: HTTP '+response.status);
  const result=await response.json();
  for(const id of ['beeToggle','beeSave']){const button=document.getElementById(id);if(button){button.disabled=!result.can_edit;button.title=result.can_edit?'':'Для изменения настроек подключите личный код BeeAI';}}
  return result;
 }
 function setAccess(value){access=String(value||'').trim();try{sessionStorage.setItem(storage,access)}catch{}window.dispatchEvent(new Event('bee-cloud-connect'));}
 function setup(){document.getElementById('beeConnect')?.addEventListener('click',()=>{const input=document.getElementById('beeAccess');setAccess(input.value);input.value='';});}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
 return Object.freeze({request,setAccess});
})();

/* A read-only adapter for the existing Aviator cloud collector. No game sessions are opened here. */
window.ClassicCloud=(()=>{
 const cfg=window.BOG_CLOUD,headers={apikey:cfg.anonKey,Authorization:'Bearer '+cfg.anonKey,Accept:'application/json'};
 let status=null,statusAt=0,report=null,reportAt=0,reportBusy=false;
 async function request(path,options={}){
  const response=await fetch(cfg.url+path,{...options,headers:{...headers,...options.headers},cache:'no-store',signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Supabase: HTTP '+response.status);
  return {value:await response.json(),response};
 }
 async function getStatus(force=false){
  if(!force&&status&&Date.now()-statusAt<10000)return status;
  try{const {value}=await request('/rest/v1/rpc/aviator_cloud_status',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  status=value;statusAt=Date.now();window.AviatorClock.sync(status.server_now||status.checked_at);
  const banner=document.getElementById('cloudConnection');if(banner)banner.textContent=status.fresh&&status.source_connected?'Aviator · Supabase LIVE · без ПК · отдельный аккаунт сборщика':'Aviator: источник ожидает соединения'+(status.error?' · '+status.error:'')+'. Сохранённый архив доступен.';
  window.dispatchEvent(new Event('aviator-source-status'));void getReport();return status;
  }catch(error){status={...status,fresh:false,source_connected:false};window.dispatchEvent(new Event('aviator-source-status'));throw error}
 }
 async function getReport(){
  if(reportBusy||report&&Date.now()-reportAt<15000)return report;
  reportBusy=true;try{const {value}=await request('/rest/v1/rpc/aviator_lab_report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});report=value;reportAt=Date.now();window.dispatchEvent(new CustomEvent('aviator-cloud-report',{detail:report}))}catch{if(report){report={...report,fresh:false,error:'REPORT_UNAVAILABLE'};window.dispatchEvent(new CustomEvent('aviator-cloud-report',{detail:report}))}}finally{reportBusy=false}
  return report;
 }
 const convert=r=>({id:r.id,coefficient:Number(r.coefficient),timestamp:r.round_timestamp?Date.parse(r.round_timestamp):null,round_timestamp:r.round_timestamp,estimated:!!r.estimated,source_seq:Number(r.source_seq),_sequence:Number(r.source_seq),origin:r.origin});
 async function page(limit,offset=0){
  const state=await getStatus();
  const q=new URLSearchParams({select:'id,coefficient,round_timestamp,estimated,source_seq,origin',order:'feed_order.desc',limit:String(Math.min(1000,limit)),offset:String(offset)});
  const {value,response}=await request('/rest/v1/aviator_classic_history?'+q,{headers:{Prefer:'count=exact'}});
  if(!Array.isArray(value))throw Error('Некорректная история Aviator');
  const count=Number(response.headers.get('content-range')?.split('/')[1]);
  return {rows:value.map(convert),total:Number.isFinite(count)?count:value.length,sourceConnected:!!state.source_connected,cloudStatus:state};
 }
 return Object.freeze({page,getStatus,status:()=>status,report:()=>report,connected:()=>false,connect(){void getReport()}});
})();

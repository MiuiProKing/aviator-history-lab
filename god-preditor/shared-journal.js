(()=>{
 const time=t=>Number.isFinite(Number(t))?new Date(Number(t)).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
 function draw(report){
  const status=document.getElementById('cloudJournalStatus'),box=document.getElementById('cloudJournalRows');if(!status||!box)return;
  status.textContent=(report.fresh?'Облачная проверка работает':'Ожидаем свежий источник')+' · проверок '+report.run_count+' · последняя '+time(Date.parse(report.checked_at))+' · Киев';
  box.replaceChildren();
  for(const w of (report.windows||[]).slice(0,60)){
   const row=document.createElement('div');row.className='journal-row';const title=document.createElement('b'),detail=document.createElement('span'),reason=document.createElement('span');
   title.textContent=(w.kind==='large-history'?'Крупная цель':'Обычный анализ')+' · '+Number(w.target).toFixed(2)+'×';
   detail.textContent=time(w.start)+' — '+time(w.end)+' · '+({pending:'Проверяется',hit:'Попадание',miss:'Промах',unknown:'Неизвестно'}[w.status]||'Неизвестно')+(w.result?' · факт '+Number(w.result).toFixed(2)+'×':'');
   reason.textContent=w.reason||'Окно ещё проверяется';row.append(title,detail,reason);box.append(row);
  }
 }
 window.addEventListener('aviator-cloud-report',e=>draw(e.detail));const report=window.ClassicCloud.report();if(report)draw(report);
})();

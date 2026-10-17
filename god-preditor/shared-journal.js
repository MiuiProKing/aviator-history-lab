(()=>{
 const time=t=>Number.isFinite(Number(t))?new Date(Number(t)).toLocaleTimeString('ru-RU',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',second:'2-digit'}):'—';
 function draw(report){
  drawTiming(report);
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
 function drawTiming(report){
  let panel=document.getElementById('largeTimingPanel');
  if(!panel){panel=document.createElement('section');panel.id='largeTimingPanel';panel.className='section card';document.getElementById('cloudJournal')?.before(panel)}
  panel.replaceChildren();const title=document.createElement('h2'),note=document.createElement('p'),grid=document.createElement('div');
  title.textContent='Крупные цели · время и реальная ошибка';note.className='signal-note';note.textContent='Проверка идёт по событиям в порядке времени: сначала 20 прошлых интервалов, затем следующие события. Часы — Киев; метки означают получение сборщиком. Доля в диапазоне не является вероятностью выигрыша.';grid.className='analysis-grid';
  panel.append(title,note,grid);
  for(const m of report.large||[]){
   const card=document.createElement('article');card.className='signal-cell';card.style.overflowWrap='anywhere';const h=document.createElement('h3'),range=document.createElement('p'),stats=document.createElement('p'),reason=document.createElement('p');
   h.textContent='≥'+m.target+'×';range.className='signal-value signal-time';stats.className=reason.className='signal-note';
   const v=m.validation,w=report.model_version==='cloud-v2-timing'&&report.fresh&&m.window?.end>window.AviatorClock.now()?m.window:null;
   range.textContent=w?new Date(w.start).toLocaleString('ru-RU',{timeZone:'Europe/Kyiv'})+' — '+new Date(w.end).toLocaleString('ru-RU',{timeZone:'Europe/Kyiv'}):'Нет актуального диапазона';
   stats.textContent='Событий: '+m.count+' · полных интервалов: '+(m.intervalCount??'—')+(v?.tested?' · проверок: '+v.tested+' · внутри диапазона: '+v.covered+'/'+v.tested+' · медианная ошибка: '+(v.medianErrorMs/60000).toFixed(1)+' мин · медианная ширина: '+(v.medianWidthMs/60000).toFixed(1)+' мин':' · недостаточно последующих проверок');reason.textContent=m.reason||'';card.append(h,range,stats,reason);grid.append(card);
  }
 }
 window.addEventListener('aviator-cloud-report',e=>draw(e.detail));const report=window.ClassicCloud.report();if(report)draw(report);
})();

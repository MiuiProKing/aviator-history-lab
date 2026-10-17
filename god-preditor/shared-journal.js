import {renderTargetCards} from '../insight-view.js?v=history-cards-20261017';
import {registeredTiming,sourceReady,updateInsight} from '../timing-view-model.js?v=history-cards-20261017';
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
  const now=window.AviatorClock.now(),models=report.large||[],ready=sourceReady(window.ClassicCloud.status(),now);
  updateInsight(panel,'<h2>Все крупные цели · история и время</h2><p class="signal-note">От 10× до 1000×. Для каждой цели — собственная выборка и проверка на более поздних событиях.</p>'+renderTargetCards(models,{windows:models.map(m=>({target:m.target,window:registeredTiming(report,m,now,ready)})),now,live:ready&&!!report.fresh}));
 }
 setInterval(()=>{const report=window.ClassicCloud.report();if(report)drawTiming(report)},3000);
 window.addEventListener('aviator-source-status',()=>{const report=window.ClassicCloud.report();if(report)drawTiming(report)});
 window.addEventListener('aviator-cloud-report',e=>draw(e.detail));const report=window.ClassicCloud.report();if(report)draw(report);
})();

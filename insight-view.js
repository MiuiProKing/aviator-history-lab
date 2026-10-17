// Shared, data-only presentation for the Lab and Classic Aviator pages.
// The caller owns registration: never substitute model.window for a supplied window.
const clockFormatter=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const dayFormatter=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit'});
const dateFormatter=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Kyiv',day:'2-digit',month:'2-digit',year:'numeric'});
const numberFormatter=new Intl.NumberFormat('en-GB',{useGrouping:false,maximumFractionDigits:20});
const QUICK_TARGETS=[10,17,30,50];
const UNKNOWN_TIME='время неизвестно';

export function escapeHTML(value){
 return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function isTime(value){return typeof value==='number'&&Number.isFinite(value)&&Number.isFinite(new Date(value).getTime());}
function numeric(value){return typeof value==='number'&&Number.isFinite(value);}
function count(value){return numeric(value)&&value>=0?Math.floor(value):0;}
function number(value){return numeric(value)?numberFormatter.format(value):'—';}
function coefficient(value){return `${number(value)}×`;}
function dayClock(value){return isTime(value)?`${dayFormatter.format(value)} · ${formatClock(value)}`:UNKNOWN_TIME;}
function fullClock(value){return isTime(value)?`${dateFormatter.format(value)} · ${formatClock(value)}`:UNKNOWN_TIME;}
function minutes(value){
 if(!numeric(value)||value<0)return '—';
 if(value<60000)return `${Math.round(value/1000)} с`;
 return `${(value/60000).toFixed(1).replace('.',',')} мин`;
}
function validWindow(value){return value&&isTime(value.start)&&isTime(value.end)&&value.end>=value.start?value:null;}
function observationRange(window){return window?`${dayClock(window.start)} — ${dayClock(window.end)}`:'Нет актуального окна';}

export function formatClock(timestamp){return isTime(timestamp)?clockFormatter.format(timestamp):UNKNOWN_TIME;}

function liveStatus(live,sampleSize=0){
 return `<span class="ap-status${live?' is-live':''}"><i aria-hidden="true"></i>${live?'Источник LIVE':'История'}${count(sampleSize)?`<span class="ap-sample">${count(sampleSize)} раундов</span>`:''}</span>`;
}
function header(title,subtitle,live,sampleSize=0){
 return `<div class="ap-head"><div class="ap-heading"><span class="ap-mini-orb" aria-hidden="true">✧</span><div><h2>${escapeHTML(title)}</h2><p>${escapeHTML(subtitle)}</p></div></div>${liveStatus(live,sampleSize)}</div>`;
}
function cell(label,value,tone='',note='',extra=''){
 return `<div class="ap-cell${tone?` ap-cell-${tone}`:''}"><span class="ap-label">${escapeHTML(label)}</span><strong class="ap-value">${escapeHTML(value)}</strong>${note?`<small class="ap-cell-note">${escapeHTML(note)}</small>`:''}${extra}</div>`;
}
function validationSummary(model={}){
 const v=model.validation||{},tested=count(v.tested),covered=count(v.covered);
 const ratio=tested>0&&covered<=tested?covered/tested:null;
 return {tested,covered,coverage:ratio==null?'—':`${Math.round(ratio*100)}%`,ratio,note:tested?`${covered} / ${tested} проверок`:'Проверок пока нет',error:minutes(v.medianErrorMs),width:minutes(v.medianWidthMs)};
}
function historicalStats(model={}){
 return `<div class="ap-facts"><span><b>${count(model.count)}</b> событий со временем</span><span><b>${count(model.intervalCount)}</b> полных интервалов</span><span>Медианный интервал <b>${escapeHTML(minutes(model.gap))}</b></span></div>`;
}
function timeRange(window){
 return `<div class="ap-range"><span>Окно наблюдения</span><b>${escapeHTML(observationRange(window))}</b></div>`;
}
function sourceTime(){return '<span class="ap-source-time">Киев · время получения</span>';}

/** Render actual supplied events. Estimated or absent receipt times remain unknown. */
export function renderPastEvents(events=[]){
 const rows=Array.isArray(events)?events:[];
 if(!rows.length)return '<div class="ap-past-empty">Нет прошлых событий в выборке.</div>';
 return `<div class="ap-past-events">${rows.map(event=>{
  const row=event||{},timestamp=row.estimated?null:row.timestamp;
  const known=isTime(timestamp),tone=numeric(row.coefficient)&&row.coefficient>=100?' ap-event-orange':numeric(row.coefficient)&&row.coefficient>=10?' ap-event-purple':' ap-event-cyan';
  return `<div class="ap-past-event${tone}" data-event-id="${escapeHTML(row.id)}" title="${escapeHTML(`Раунд ${row.id??'—'} · ${fullClock(timestamp)}`)}"><strong>${escapeHTML(coefficient(row.coefficient))}</strong><time${known?` datetime="${new Date(timestamp).toISOString()}"`:''}>${escapeHTML(dayClock(timestamp))}</time></div>`;
 }).join('')}</div>`;
}

function warningView(warning){
 const detail=warning&&typeof warning==='object'?warning:{},model=detail.model||detail;
 const window=validWindow(detail.window),target=numeric(model.target)?` · ≥${number(model.target)}×`:'';
 const reason=typeof warning==='string'?warning:model.reason;
 const v=validationSummary(model);
 return `<aside class="ap-warning"><span class="ap-warning-icon" aria-hidden="true">♨</span><div class="ap-warning-copy"><h3>Крупная цель${escapeHTML(target)}</h3><p>${window?escapeHTML(observationRange(window)):'Нет актуального окна для крупной цели'}</p><small>${escapeHTML(reason||(window?'Диапазон из проверенной истории.':'Для окна нужны полные интервалы и проверка времени.'))}</small></div>${v.tested?`<div class="ap-warning-stat"><span>В истории</span><b>${v.covered} / ${v.tested}</b></div>`:''}</aside>`;
}

/** The explicit window must be the registered pending window, or null. */
export function renderTimingInsight({model={},window=null,selectedTarget=17,now,sampleSize=0,live=false,warning=null}={}){
 model=model||{};
 const activeWindow=validWindow(window),v=validationSummary(model),target=numeric(model.target)?model.target:selectedTarget;
 const center=activeWindow&&isTime(activeWindow.center)?formatClock(activeWindow.center):'—';
 const state=activeWindow?(isTime(now)&&activeWindow.end<now?'Окно завершено':'Центр исторического диапазона'):'Нет актуального окна';
 const progress=v.ratio==null?'':`<div class="ap-track" aria-hidden="true"><span style="width:${Math.round(v.ratio*100)}%"></span></div>`;
 return `<section class="ap-insight ap-timing" aria-label="Время крупных коэффициентов"><div class="ap-timing-masthead">${header('Время крупных коэффициентов','Историческая модель Aviator',live,sampleSize)}</div><div class="ap-orb-stage"><thinking-orb class="ap-thinking-orb" state="${activeWindow?'idle':'searching'}" aria-hidden="true"></thinking-orb><div class="ap-orb-readout"><span>РАСЧЁТНЫЙ ОРИЕНТИР</span><strong>≥${escapeHTML(coefficient(target))}</strong><time>${escapeHTML(center)}</time><small>${activeWindow?'Киев · медианное время':'Идёт поиск окна'}</small></div></div><div class="ap-quick-targets" role="group" aria-label="Выбрать крупную цель">${QUICK_TARGETS.map(goal=>`<button type="button" data-focus-target="${goal}" class="ap-quick-target${Number(selectedTarget)===goal?' is-active':''}" aria-pressed="${Number(selectedTarget)===goal}">${goal}×</button>`).join('')}</div><div class="ap-cells">${cell('Цель наблюдения',`≥${coefficient(target)}`,'orange','Исторический порог')}${cell('Покрытие истории',v.coverage,'cyan',v.note,progress)}${cell('Медианная ошибка',v.error,'purple','Измерена на поздних событиях')}${cell('Медианное время',center,'clock',state)}</div>${timeRange(activeWindow)}<div class="ap-source-row">${sourceTime()}<span>Медианная ширина · ${escapeHTML(v.width)}</span></div>${historicalStats(model)}${model.reason?`<p class="ap-reason">${escapeHTML(model.reason)}</p>`:''}<div class="ap-past"><div class="ap-past-head"><h3>Реальные прошлые события ≥${escapeHTML(coefficient(target))}</h3><span>Фактические результаты</span></div>${renderPastEvents(Array.isArray(model.recentEvents)?model.recentEvents.slice(0,6):[])}</div>${warningView(warning)}<p class="ap-footnote">Покрытие относится к прошлым проверкам. Будущий коэффициент и точное время неизвестны.</p></section>`;
}

function registeredWindow(windows,target){
 if(windows instanceof Map)return validWindow(windows.get(target)?.window||windows.get(target));
 if(!Array.isArray(windows))return validWindow(windows?.[target]?.window||windows?.[target]);
 const record=windows.find(row=>row&&Number(row.target??row.target_min??row.model?.target)===target);
 return validWindow(record?.window||record);
}

/** Compact threshold cards; past examples expand without growing every card. */
export function renderTargetCards(models=[],{windows=[],now,live=false}={}){
 if(!Array.isArray(models)||!models.length)return '<div class="ap-empty">История крупных целей пока не загружена.</div>';
 return `<div class="ap-target-grid">${models.map(input=>{
  const model=input||{},target=model.target,v=validationSummary(model),window=registeredWindow(windows,target);
  const state=window?(isTime(now)&&window.end<now?'Завершено':live?'Наблюдение':'Закреплено'):'История';
  return `<article class="ap-target-card" data-goal="${escapeHTML(target)}"><div class="ap-target-head"><h3>≥${escapeHTML(coefficient(target))}</h3><span class="ap-target-state${window?' has-window':''}">${state}</span></div><div class="ap-target-window">${escapeHTML(observationRange(window))}</div><p class="ap-target-reason">${escapeHTML(model.reason||'Недостаточно данных для расчёта времени.')}</p><dl class="ap-target-metrics"><div><dt>Историческое покрытие</dt><dd>${escapeHTML(v.coverage)} <small>${v.covered} / ${v.tested}</small></dd></div><div><dt>Ошибка · медиана</dt><dd>${escapeHTML(v.error)}</dd></div><div><dt>Центр диапазона</dt><dd>${window&&isTime(window.center)?formatClock(window.center):'—'}</dd></div><div><dt>Полных интервалов</dt><dd>${count(model.intervalCount)}</dd></div></dl><details class="ap-past-details"><summary>Реальные прошлые события <span>${Array.isArray(model.recentEvents)?model.recentEvents.length:0}</span></summary>${renderPastEvents(Array.isArray(model.recentEvents)?model.recentEvents.slice(0,6):[])}${sourceTime()}</details></article>`;
 }).join('')}</div>`;
}

/** Existing ordinary heuristic, presented without turning its score into a probability. */
export function renderNormalPrediction({target,score,at,end,pattern='',basis='',sampleSize=0,live=false,warning=null,risk=null}={}){
 const window=validWindow({start:at,end}),validScore=numeric(score)&&score>=0&&score<=100;
 const progress=validScore?`<div class="ap-track" aria-hidden="true"><span style="width:${score}%"></span></div>`:'';
 return `<section class="ap-insight ap-normal" aria-label="Обычный прогноз Aviator">${header('Анализ Aviator',pattern||'Экспериментальная оценка по истории',live,sampleSize)}<div class="ap-cells">${cell('Ориентировочная цель',coefficient(target),'orange','Значение модели')}${cell('Балл правил',validScore?`${number(score)} / 100`:'— / 100','cyan','Не вероятность выигрыша',progress)}${cell('Начало наблюдения',formatClock(at),'clock','В заданном окне')}${cell('Риск',risk||'Не оценён','purple',risk?'Качественная оценка':'По этому баллу не измерен')}</div>${timeRange(window)}<div class="ap-source-row">${sourceTime()}</div>${basis?`<p class="ap-reason">${escapeHTML(basis)}</p>`:''}${warningView(warning)}<p class="ap-footnote">Балл правил — эвристическая оценка. Цель и окно не гарантируют результат.</p></section>`;
}

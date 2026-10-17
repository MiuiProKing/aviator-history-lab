import {renderTimingInsight,renderNormalPrediction} from '../insight-view.js?v=history-cards-20261017';
import {focusTarget,QUICK_TARGETS,FOCUS_KEY,registeredTiming as recordedTiming,reportReady,updateInsight} from '../timing-view-model.js?v=history-cards-20261017';
import '../thinking-orb.js?v=history-cards-20261017';
import {coversWindow} from '../coverage.js?v=history-cards-20261017';
'use strict';
const Date=window.AviatorClock.Date;
const API=window.BOG_CLOUD.url+'/rest/v1/aviator_classic_history';
let collectorStatus=null;
const ENGINE=window.GodPreditor,$=id=>document.getElementById(id);
const LIMIT=100,MODEL_LIMIT=2000,POLL_MS=3000,FRESH_MS=180000,COVERAGE_MS=15000,GRACE_MS=15000;
const JOURNAL_KEY='aviator_classic_rules_20261017',LEGACY_KEY='aviator_classic_no_legacy';
let selectedTarget=focusTarget(localStorage);
let rounds=[],mode='vip',activeNormal=null,activeVip=null,activeBig=null,signalJournal=[];
let online=false,lastPollAt=0,syncPromise=null,initialized=false,lastAnalysisAt=0,modelRefreshedAt=0;
let liveKnownTotal=0,invalidRows=0,conflictingRows=0,liveSocket=null,liveReconnectTimer=null,liveReconnectDelay=5000;
let archiveRows=[],archiveOffset=0,archiveBusy=false,archiveDone=false,archiveVisible=100;
let feedSequence=0;
let archiveRenderKey='';
const coefficient=r=>ENGINE.numberValue(r?.coefficient??r?.topCoefficient??r?.multiplier);
const millis=ENGINE.timeValue,sortMillis=r=>millis(r?.timestamp)||0;
function escapeText(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function fmtTime(t){const n=millis(t);return n?new Date(n).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Europe/Kyiv'}):'—'}
function localDay(t){if(!t)return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t))}
function zone(){return 'Europe/Kyiv'}
function color(n){return n<2?'#0799ed':n<10?'#a02bf1':'#ff7900'}
function compareFeed(a,b){return (b._sequence||0)-(a._sequence||0)||((b.timestamp||0)-(a.timestamp||0))||(String(a.id)<String(b.id)?1:String(a.id)>String(b.id)?-1:0)}
// Coefficient validity and event-clock validity are separate. Never discard a
// valid result just because the provider's clock differs from this device.
function normalizeFeed(input){
 const map=new Map();let invalid=0,conflicts=0;
 for(const raw of Array.isArray(input)?input:[]){
  const n=coefficient(raw),id=raw?.id==null?'':String(raw.id).trim();
  if(!raw||typeof raw!=='object'||!id||id.length>200||n==null||n<1){invalid++;continue}
  const timestamp=millis(raw.timestamp??raw.round_timestamp??raw.played_at),timeIssue=raw.timeIssue||(timestamp==null?'missing':timestamp>Date.now()+30000?'clock':'');
  const row={id,coefficient:n,timestamp,estimated:!!timeIssue||raw.estimated===true||raw.estimated===1||raw.estimated==='true',timeIssue,_observedAt:raw._observedAt||0,_sequence:Number(raw.source_seq)||raw._sequence||0};
  const old=map.get(id);if(old){if(old.coefficient!==n||old.timestamp!==timestamp)conflicts++;continue}map.set(id,row);
 }
 return {rows:[...map.values()].sort(compareFeed),invalid,conflicts};
}
function fresh(now=Date.now()){if(collectorStatus)return !!collectorStatus.fresh&&now-lastPollAt<=COVERAGE_MS;const head=rounds[0];if(!head)return false;const t=head._observedAt||(!head.timeIssue?head.timestamp:0);return t>0&&now-t<=FRESH_MS&&t<=now+30000}
function preciseModel(){return fresh()&&rounds.length>=20&&rounds.slice(0,20).every(r=>!r.estimated)}
function exactRounds(){return rounds.filter(r=>!r.estimated)}
function finiteSignal(s){return s&&Number.isFinite(s.target)&&s.target>=1&&Number.isFinite(s.score)&&s.score>=0&&s.score<=100&&Number.isFinite(s.at)&&s.at>0&&Number.isFinite(s.window)&&s.window>0&&s.window<=(s.timing?604800000:1800000)&&Number.isFinite(s.generatedAt)}
function patternName(s){const names={"Cycle des cotes d'or détecté":'Цикл коэффициентов от 10×','Série basse — rebond statistique':'15 раундов ниже 2×','Plage horaire favorable':'Часовая группа выше среднего','Plage horaire faible':'Часовая группа ниже среднего','Analyse multi-signaux':'Мультисигнальный анализ'};return names[s]||s}
function fromGod(p,big=false){if(!p)return null;const s={target:p.estimatedCoef,score:big?p.confidence:p.reliability,at:big?p.expectedAt:p.estimatedAt,window:p.windowMs,pattern:big?'Крупная цель':patternName(p.pattern),basis:big?p.reason:p.basis,estimated:false,generatedAt:p.generatedAt||Date.now(),rules:big?[p.reason]:[],engine:ENGINE.version};return finiteSignal(s)?s:null}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0}function median(a){if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2}function geo(a){if(!a.length)return 0;return Math.exp(mean(a.map(x=>Math.log(Math.max(x,1.001)))))}function deviation(a){const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)))}function mad(a){const m=median(a);return median(a.map(x=>Math.abs(x-m)))}function ema(a,alpha){if(!a.length)return 0;let x=a[a.length-1];for(let i=a.length-2;i>=0;i--)x=alpha*a[i]+(1-alpha)*x;return x}function round(x){return Math.floor(x+.5)}function label(score){return score>=82?'Высокая':score>=66?'Средняя':'Слабая'}

function gapStats(rows,threshold){const e=rows.filter(r=>coefficient(r)>=threshold).sort((a,b)=>millis(a.timestamp)-millis(b.timestamp));if(e.length<2)return{count:e.length,last:e.length?millis(e[0].timestamp):null,med:0,mad:0};const gaps=e.slice(1).map((r,i)=>millis(r.timestamp)-millis(e[i].timestamp)).filter(x=>x>0);return{count:e.length,last:millis(e[e.length-1].timestamp),med:median(gaps),mad:mad(gaps)}}

function plan(target,reliability){const main=Math.max(1.01,target);let insurance=main>=20?Math.min(5,Math.max(2,main*.12)):main>=10?Math.min(3,Math.max(1.8,main*.2)):main>=5?Math.min(2.2,Math.max(1.55,main*.35)):main>=2?Math.max(1.3,main*(reliability>=75?.6:.55)):Math.max(1.1,main*.8);insurance=Math.min(insurance,Math.max(1.01,main-.05));return{main,insurance,risk:main>=20||reliability<60?'Высокий':main>=5||reliability<75?'Средний':'Низкий'}}

function ordinaryPrediction(forceOrder=false){const data=rounds.filter(r=>coefficient(r)!==null).slice(0,MODEL_LIMIT),n=data.length;if(n<20)return null;const desc=[...data].sort(compareFeed),c=desc.map(coefficient),medAll=median(c),geoAll=geo(c),last20=c.slice(0,20),last50=c.slice(0,50),avg50=mean(last50),ema20=ema(last20,.25),ema50=ema(last50,.12),sigma50=deviation(last50),mad50=mad(last50),lowRatio=c.slice(0,60).filter(x=>x<2).length/Math.min(60,n),recent20=desc.slice(0,30).filter(r=>coefficient(r)>=20),now=Date.now(),estimated=forceOrder||data.some(r=>r.estimated);let target,score,at,window,pattern,basis; const clock=new Date(now),hourRows=desc.filter(r=>new Date(millis(r.timestamp)).getHours()===clock.getHours()),minuteRows=desc.filter(r=>new Date(millis(r.timestamp)).getMinutes()===(clock.getMinutes()+2)%60),hourGeo=geo(hourRows.map(coefficient)),hourFactor=!estimated&&hourRows.length>=5?hourGeo/Math.max(geoAll,.1):1,minuteFactor=!estimated&&minuteRows.length>=5?geo(minuteRows.map(coefficient))/Math.max(geoAll,.1):1;

 if(!estimated){const g=gapStats(desc,10);if(g.count>=8&&g.med>0&&g.mad>0&&g.mad<g.med*.6){const delta=g.last+g.med-now,width=clamp(g.mad*1.4826||g.med*.55,60000,240000);if(Math.abs(delta)<=width*.6){const peak=Math.max(...c.slice(0,80)),div=recent20.length>=3?2:recent20.length>=1?3:4;target=clamp(peak/div,2,20);score=round(clamp(60-Math.abs(delta)/width*15+(!estimated&&hourGeo>geoAll?3:0)+clamp(g.count/20,0,4),40,68));at=now+(delta>0?Math.max(delta,90000):120000);window=clamp(g.med*.25,90000,180000);pattern='Цикл коэффициентов от 10×';basis=`Медианный интервал ${(g.med/60000).toFixed(1)} мин`;return{target,score,at,window,pattern,basis,estimated}}}}

 if(c.slice(0,15).length===15&&c.slice(0,15).every(x=>x<2)){target=clamp(geoAll*2.5+medAll,2.5,15);score=round(clamp(70+(estimated?0:clamp((now-millis(desc[14].timestamp))/60000,0,15)),65,92));at=now+90000;window=120000;pattern='Низкая серия — статистический отскок';basis=`15 раундов ниже 2× · геометрическое среднее ${geoAll.toFixed(2)}×`;return{target,score,at,window,pattern,basis,estimated}}

 if(recent20.length>=3){const bg=geo(recent20.map(coefficient)),div=recent20.length>=5?3:recent20.length>=4?4:5;target=clamp(bg/div,2,12);score=Math.min(78,60+recent20.length*3);at=now+120000;window=150000;pattern=`${recent20.length} недавних раундов от 20×`;basis=`Геометрическое среднее крупных результатов ${bg.toFixed(2)}×`;return{target,score,at,window,pattern,basis,estimated}}

 const last60=c.slice(0,60),zone=last60.filter(x=>x>=5&&x<10),fragile=lowRatio>.55||sigma50>avg50*1.4;if(zone.length>=3){const zg=geo(zone);target=fragile?clamp(zg*.45,2,4.5):clamp(zg*.7,3,7);score=round(clamp(64+zone.length*4+(fragile?-6:6),58,90));at=now+120000;window=150000;pattern=fragile?'Смешанная фаза 5–9×':'Фаза роста 5–9×';basis=`${zone.length} раундов в диапазоне 5–9×`;return{target,score,at,window,pattern,basis,estimated}}

 const composite=ema20*.5+ema50*.3+avg50*.2;target=clamp(composite*hourFactor*.6+(!estimated&&minuteRows.length?Math.max(...minuteRows.map(coefficient))*.1:0)+1.6,1.8,12);const dangerous=lowRatio>.6||sigma50>avg50*1.6;if(dangerous)target=Math.min(target,3.2);else if(lowRatio>.45)target=Math.min(target,5);score=round(clamp(52+clamp(n/25,0,28)+clamp(Math.abs(hourFactor-1)*42,0,22)+clamp(Math.abs(minuteFactor-1)*32,0,16)+(mad50>0&&mad50<avg50*.6?5:0)+(dangerous?-8:0),50,92));const sec=new Date().getSeconds(),extra=((60-sec)*1000)%45000;at=now+120000+extra;window=150000;pattern=dangerous?'Повышенная нестабильность':'Мультисигнальный анализ';basis=`EMA20 ${ema20.toFixed(2)}× · EMA50 ${ema50.toFixed(2)}× · MAD ${mad50.toFixed(2)} · час ${clock.getHours()}: гео ${hourGeo.toFixed(2)}× (${hourRows.length}) · ${n} раундов${estimated?' · время раундов оценочное':''}`;return{target,score,at,window,pattern,basis,estimated}}

function vipPrediction(){
 const report=window.ClassicCloud.report(),now=Date.now();
 if(!timingReportReady(report,now))return null;
 const target=selectedTarget;
 const m=report.large?.find(x=>x.target===target),w=registeredTiming(report,m,now);
 if(!w||w.end<=now)return null;
 return {target,score:0,at:w.start,window:w.end-w.start,generatedAt:w.center,pattern:'Крупная цель · проверка времени',basis:m.reason,estimated:false,timing:m.validation,timingWindowId:w.id};
}


function ordinaryAnalysis(){
 if(!online||!fresh()||rounds.length<20)return null;
 if(preciseModel())return fromGod(ENGINE.calculatePrediction(exactRounds()));
 const s=ordinaryPrediction(true);return s?{...s,target:Number(s.target.toFixed(2)),generatedAt:Date.now(),estimated:true,engine:'order-only-audit3',basis:'Анализ последовательности; временные циклы и часовые группы отключены. '+s.basis}:null;
}
function bigOpportunity(now=Date.now()){
 const report=window.ClassicCloud.report();
 if(!online||!fresh(now)||!timingReportReady(report,now))return null;
 const m=report.large?.filter(m=>m.target>=100&&registeredTiming(report,m,now)).sort((a,b)=>a.target-b.target)[0];
 if(!m)return null;const w=registeredTiming(report,m,now);
 return {target:m.target,score:0,at:w.start,window:w.end-w.start,generatedAt:w.center,estimated:false,pattern:'Крупная цель · историческое время',basis:m.reason,rules:[],timing:m.validation,timingWindowId:w.id};
}

function lockedPrediction(kind){
 const report=window.ClassicCloud.report();
 if(kind==='normal'&&fresh()&&report?.fresh&&report.prediction&&Date.now()-globalThis.Date.parse(report.checked_at)<90000){activeNormal=fromGod(report.prediction);recordSignal(kind,activeNormal);return activeNormal}
 const now=Date.now();let current=kind==='normal'?activeNormal:activeVip;if(current?.timing&&!report?.windows?.some(w=>w.id===current.timingWindowId&&w.status==='pending')){current=null;if(kind==='vip')activeVip=null}
 if(current&&now<Math.max(current.at+current.window,current.generatedAt+60000))return current;
 const next=kind==='normal'?ordinaryAnalysis():online&&fresh()&&rounds.length>=20?vipPrediction():null;
 if(next){next.generatedAt=now;next.estimated=next.timing?false:!preciseModel()||next.estimated}
 if(kind==='normal')activeNormal=next;else activeVip=next;
 recordSignal(kind,next);return next;
}
function chooseMode(next){mode=next;const vip=next==='vip';$('normalTab').classList.toggle('active',!vip);$('vipTab').classList.toggle('active',vip);$('normalTab').setAttribute('aria-selected',String(!vip));$('vipTab').setAttribute('aria-selected',String(vip));$('normalSignal').hidden=vip;$('vipSignal').hidden=!vip}
function durationLabel(ms){const s=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}
function emptyReason(){if(collectorStatus&&!collectorStatus.fresh)return collectorStatus.source_connected?'Собираются новые раунды: '+collectorStatus.session_rounds+'/'+collectorStatus.warmup_required+'. История доступна.':'Наш сборщик ожидает подключения к игре.';if(!online)return 'Ожидаю успешного обновления базы.';if(!rounds.length)return 'В базе пока нет подходящих раундов.';if(!fresh())return 'Последний раунд устарел. Новый прогноз появится после обновления источника.';return 'Для расчёта нужны 20 раундов: получено '+rounds.length+'.'}

function signalMarkup(s,vip){
 const report=window.ClassicCloud.report(),now=Date.now(),live=online&&fresh();
 if(vip){const model=report?.large?.find(m=>m.target===selectedTarget)||{target:selectedTarget,reason:'Загружаем историю этой цели…'},window=registeredTiming(report,model,now);const big=report?.large?.find(m=>m.target>=Math.max(50,selectedTarget+1)&&registeredTiming(report,m,now));return renderTimingInsight({model,window,selectedTarget,now,sampleSize:rounds.length,live,warning:big?{model:big,window:registeredTiming(report,big,now)}:null})}
 if(!s)return '<div class="signal-empty">'+escapeText(emptyReason())+'</div>';
 return renderNormalPrediction({target:s.target,score:s.score,at:s.at,end:s.at+s.window,pattern:s.pattern,basis:s.basis,sampleSize:rounds.length,live,risk:plan(s.target,s.score).risk});
}
function saveJournal(){try{localStorage.setItem(JOURNAL_KEY,JSON.stringify(signalJournal.slice(0,300)))}catch(_){}}
function restoreJournal(){
 try{
  const saved=localStorage.getItem(JOURNAL_KEY),legacy=!saved,items=JSON.parse(saved||localStorage.getItem(LEGACY_KEY)||'[]');
  if(Array.isArray(items))signalJournal=items.filter(s=>s&&['normal','vip','big'].includes(s.kind)&&finiteSignal(s.signal)).slice(0,300).map(s=>({...s,at:s.signal.at,window:s.signal.window,target:s.signal.target,ids:Array.isArray(s.ids)?s.ids.filter(id=>typeof id==='string').slice(0,2000):[],checked:0,approximate:!!s.signal.estimated,coverageGap:true,coverageReason:'Страница была закрыта или перезагружена',status:!legacy&&['hit','miss','observed','expired'].includes(s.status)?s.status:Date.now()<s.signal.at+s.signal.window?'pending':'expired',policy:'audit3'}));
 }catch(_){signalJournal=[]}
 for(const s of signalJournal){s.checked=s.ids.length;if(s.status==='pending'&&Date.now()<s.at+s.window){if(s.kind==='normal'&&!activeNormal)activeNormal=s.signal;if(s.kind==='vip'&&!activeVip)activeVip=s.signal;if(s.kind==='big'&&!activeBig)activeBig=s.signal}}
 saveJournal();
}
function recordSignal(kind,s){if(!finiteSignal(s))return;const id=kind+':'+s.generatedAt;if(signalJournal.some(x=>x.id===id))return;signalJournal.unshift({id,kind,signal:s,createdAt:Date.now(),at:s.at,window:s.window,target:s.target,status:'pending',ids:[],checked:0,approximate:!!s.estimated,coverageGap:false,policy:'audit3'});signalJournal=signalJournal.slice(0,300);saveJournal()}
function gap(reason){for(const s of signalJournal){if(s.status!=='pending')continue;s.coverageGap=true;s.coverageReason=reason}saveJournal()}
function merge(items,arrivalIds=new Set()){
 const incoming=normalizeFeed(items),known=new Map(rounds.map(r=>[r.id,r])),accepted=[];
 // API batches are newest first. Assign consecutive arrival ranks in reverse.
 for(const row of [...incoming.rows].reverse())if(!known.has(row.id)&&arrivalIds.has(row.id)){row._observedAt=Date.now();row._sequence=row._sequence||++feedSequence}
 const result=normalizeFeed([...rounds,...incoming.rows]);rounds=result.rows.slice(0,MODEL_LIMIT);
 invalidRows+=incoming.invalid;conflictingRows+=incoming.conflicts+result.conflicts;
 if(incoming.invalid||incoming.conflicts||result.conflicts)gap('Невалидные или конфликтующие записи истории');
 const retained=new Map(rounds.map(r=>[r.id,r]));
 for(const r of incoming.rows){const value=retained.get(r.id);if(value&&value.coefficient===r.coefficient&&value.timestamp===r.timestamp)accepted.push(value)}
 return accepted;
}
function processNew(items){
 for(const s of signalJournal){
  if(s.status!=='pending')continue;const end=s.at+s.window;
  for(const r of items){
   const eventAt=r.timeIssue?r._observedAt:r.timestamp;
   if(!eventAt||eventAt<=Number(s.createdAt??s.signal.generatedAt)||eventAt>Date.now()||eventAt<s.at||eventAt>end||s.ids.includes(r.id))continue;
   s.ids.push(r.id);s.checked++;s.approximate ||= r.estimated;
   if(r.coefficient>=s.target){s.actual=r.coefficient;s.actualAt=eventAt;s.status=s.approximate?'observed':'hit';s.finishedAt=Date.now();break}
  }
 }
 saveJournal();
}
function evaluateJournal(now=Date.now()){
 for(const s of signalJournal){
  if(s.status!=='pending')continue;const end=s.at+s.window;
  if(lastPollAt&&now-lastPollAt>COVERAGE_MS&&now>=s.at&&lastPollAt<end){s.coverageGap=true;s.coverageReason='Пропуск обновлений внутри окна'}
  if(now<=end+GRACE_MS||syncPromise&&now<end+30000)continue;
  const covered=coversWindow({start:s.at,end,createdAt:s.createdAt??s.signal.generatedAt},rounds,now)&&s.checked>0&&!s.approximate&&!s.coverageGap&&online&&fresh(now)&&!rounds[0].estimated&&rounds[0].timestamp>=end&&lastPollAt>=end+GRACE_MS&&now-lastPollAt<COVERAGE_MS;
  if(!covered&&online&&now<end+30000)continue;
  s.status=covered?'miss':'expired';s.finishedAt=now;if(!covered&&!s.coverageReason)s.coverageReason=s.approximate?'Время раундов приблизительное':'Нет полной проверки окна';
 }
 saveJournal();
}
function bigDiagnostics(){
 if(!online)return 'Ожидаю соединения с базой. Новое предупреждение сейчас не создаётся.';
 if(collectorStatus&&!collectorStatus.fresh)return emptyReason();if(!fresh())return 'Ожидаю свежий раунд: последние данные старше трёх минут.';
 if(rounds.length<20)return 'Недостаточно данных: '+rounds.length+' / 20 раундов.';
 const exact=exactRounds(),recent=(preciseModel()?exact:rounds).slice(0,80),c20=recent.filter(r=>r.coefficient>=20).length,c50=recent.filter(r=>r.coefficient>=50).length;
 const clock='Для целей ≥100× используется общий облачный расчёт интервалов с проверенной ошибкой времени. При нехватке проверок точное окно не назначается.';
 return 'Кластер за '+recent.length+' последних раундов: ≥20× — '+c20+' (нужно 6), ≥50× — '+c50+' (нужно 3). '+clock;
}
function renderExtras(){
 const now=Date.now(),s=activeBig;
 $('bigAlert').innerHTML=s?`<div class="big-title">🔥 Крупная цель ${s.target.toFixed(0)}× · ${s.estimated?'окно ≈':'время получения'}</div><div class="big-main">${fmtTime(s.at)} — ${fmtTime(s.at+s.window)}</div><div class="signal-note">${escapeText(s.basis)}<br>Оценка условий: ${s.timing?(s.timing.medianErrorMs/60000).toFixed(1)+' мин':s.score+' / 100'}. Цель закреплена до конца окна.</div>`:`<div class="big-title">Крупные коэффициенты · наблюдение</div><div class="signal-note">${escapeText(bigDiagnostics())}</div>`;
 evaluateJournal();
 const names={normal:'Обычный анализ',vip:'VIP',big:'Крупная цель'},labels={pending:'Ожидание окна',hit:'Цель достигнута в окне',miss:'Цель не достигнута за проверенное окно',observed:'Цель наблюдалась · время ≈',expired:'Результат не проверен'};
 $('signalJournal').innerHTML=signalJournal.slice(0,50).map(x=>`<div class="journal-row"><b>${names[x.kind]} · ${x.target.toFixed(2)}×</b><span>${fmtTime(x.at)} — ${fmtTime(x.at+x.window)}</span><span>${x.status==='pending'&&now>=x.at?'Проверка окна':labels[x.status]}${Number.isFinite(x.actual)?' · '+x.actual.toFixed(2)+'×':''}${x.status==='expired'?' · '+escapeText(x.coverageReason||'Недостаточно данных'):''}</span></div>`).join('')||'<p class="signal-note">Здесь появятся результаты новых сигналов.</p>';
 const hit=signalJournal.filter(x=>x.status==='hit').length,miss=signalJournal.filter(x=>x.status==='miss').length,n=hit+miss;
 $('signalStats').textContent='Проверено: '+n+' · попадания: '+hit+' · промахи: '+miss+' · '+(n?'доля попаданий '+Math.round(hit/n*100)+'%':'доля попаданий ещё не рассчитана')+' · время ≈: '+signalJournal.filter(x=>x.status==='observed').length+' · не проверено: '+signalJournal.filter(x=>x.status==='expired').length;
}
function renderSignals(){updateInsight($('normalSignal'),signalMarkup(activeNormal,false));updateInsight($('vipSignal'),signalMarkup(activeVip,true));renderExtras();renderStatus()}
function renderStatus(){if(collectorStatus){const ok=fresh();$('statusDot').className='dot '+(ok?'ok':'err');$('liveDot').className='dot '+(ok?'ok':'err');$('statusText').textContent='Supabase · '+collectorStatus.live_count+' раундов';$('liveLabel').textContent=ok?'Свежие данные':collectorStatus.source_connected?'Сбор '+collectorStatus.session_rounds+'/'+collectorStatus.warmup_required:'Источник отключён';return}const head=rounds[0],at=head?head._observedAt||(!head.timeIssue?head.timestamp:0):0,age=at?Math.max(0,Math.round((Date.now()-at)/1000)):null,ok=online&&fresh();$('statusDot').className='dot '+(ok?'ok':'err');$('liveDot').className='dot '+(ok?'ok':'err');$('statusText').textContent=(online?'База доступна':'Нет связи')+(age==null?head?.timeIssue?' · часы источника требуют проверки':'':' · '+(head._observedAt?'новый результат получен ':'раунд ')+age+' с назад');$('liveLabel').textContent=ok?'Свежие данные':online?'Ожидание нового результата':'Нет связи'}
function render(){
 const sample=rounds.slice(0,LIMIT),nums=sample.map(coefficient),grid=$('grid');grid.replaceChildren();
 if(!nums.length)grid.innerHTML='<div class="empty">Ожидаю данные из нашей базы.</div>';
 else{ $('avg').textContent=mean(nums).toFixed(2)+'×';$('max').textContent=Math.max(...nums).toFixed(2)+'×';$('rate2').textContent=Math.round(nums.filter(x=>x>=2).length*100/nums.length)+'%';$('rate10').textContent=Math.round(nums.filter(x=>x>=10).length*100/nums.length)+'%';
  for(const r of sample){const item=document.createElement('div');item.className='coef';item.dataset&&(item.dataset.roundId=r.id);item.style.setProperty('--coef',color(r.coefficient));const strong=document.createElement('strong'),time=document.createElement('time');strong.textContent=r.coefficient.toFixed(2)+'×';time.textContent=r.timestamp?fmtTime(r.timestamp)+(r.estimated?' ≈':''):'время неизвестно';item.title='ID '+r.id+(r.timeIssue?' · время неизвестно':' · время получения сборщиком');item.append(strong,time);grid.appendChild(item)}
 }
 const exact=exactRounds().length;
 $('sampleQuality').textContent='В модели '+rounds.length+' / '+MODEL_LIMIT+' · время получения: '+exact+' · время ≈: '+(rounds.length-exact)+' · непроверенные часы: '+rounds.filter(r=>r.timeIssue).length+' · '+zone()+(invalidRows?' · некорректных ID/коэффициентов в ответах: '+invalidRows:'')+(conflictingRows?' · конфликтов ID: '+conflictingRows:'');
 $('timeWarning').textContent=preciseModel()?'Обычный анализ использует исходные формулы по времени получения облачным сборщиком. Это не время завершения от провайдера. Балл правил не равен вероятности выигрыша.':'Время части раундов неизвестно: доступны последовательность и кластеры, временные циклы и часовые группы отключены. Показанное окно — расписание наблюдения.';
 $('count').textContent='Показано '+sample.length+' · в модели '+rounds.length;$('subtitle').textContent='Последние результаты · всего в базе '+liveKnownTotal.toLocaleString('ru-RU');renderSignals();renderModelFacts();renderArchive();
}
function updateAnalysis(force=false){
 const now=Date.now();if(!force&&lastAnalysisAt&&now-lastAnalysisAt<8000)return;lastAnalysisAt=now;
 lockedPrediction('normal');lockedPrediction('vip');
 if(!activeBig||now>=Math.max(activeBig.at+activeBig.window,activeBig.generatedAt+60000)){activeBig=bigOpportunity(now);recordSignal('big',activeBig)}
 renderSignals();renderModelFacts();
}
function renderModelFacts(){
 const values=rounds.map(coefficient),last50=values.slice(0,50),g=gapStats(exactRounds(),10);
 if(!values.length){$('modelFacts').textContent='Ожидаю историю';return}
 const facts=[['Выборка',values.length+' / '+MODEL_LIMIT],['Среднее',mean(values).toFixed(2)+'×'],['Медиана',median(values).toFixed(2)+'×'],['Геометрическое',geo(values).toFixed(2)+'×'],['EMA20',ema(values.slice(0,20),.25).toFixed(2)+'×'],['EMA50',ema(last50,.12).toFixed(2)+'×'],['MAD50',mad(last50).toFixed(2)],['σ50',deviation(last50).toFixed(2)],['Интервал ≥10×',preciseModel()?(g.med/60000).toFixed(2)+' мин':'недоступен · время ≈'],['MAD интервалов',preciseModel()?(g.mad/60000).toFixed(2)+' мин':'недоступен · время ≈']];
 $('modelFacts').innerHTML='<div class="facts-grid">'+facts.map(([name,value])=>'<span>'+name+'<b>'+value+'</b></span>').join('')+'</div><p class="signal-note">Последний расчёт '+fmtTime(lastAnalysisAt)+' · полная история '+fmtTime(modelRefreshedAt)+' · исходная модель '+ENGINE.version+'.</p>';
}
function timeoutSignal(ms){const c=new AbortController();setTimeout(()=>c.abort(),ms);return c.signal}
async function page(limit,offset=0){const result=await window.ClassicCloud.page(limit,offset);return {...result,collector:{source_connected:result.sourceConnected,fresh:!!result.cloudStatus.fresh,error:result.cloudStatus.error,session_rounds:result.total,warmup_required:20,live_count:result.total}}}
async function modelPage(){
 const first=await page(MODEL_LIMIT);let rows=first.rows.slice(),offset=rows.length,pages=1,valid=normalizeFeed(rows).rows.length;
 while(offset>0&&valid<MODEL_LIMIT&&(first.total==null||offset<first.total)&&pages<4){const next=await page(Math.min(1000,MODEL_LIMIT-valid),offset);pages++;if(!next.rows.length)break;rows.push(...next.rows);offset+=next.rows.length;valid=normalizeFeed(rows).rows.length}
 if(pages>1){const head=await page(100),id=first.rows[0]?.id;if(id!=null&&!head.rows.some(r=>String(r.id)===String(id)))gap('История изменилась во время загрузки');rows=[...head.rows,...rows]}
 return {rows,total:first.total,nextOffset:offset,collector:first.collector};
}
function syncHistory(full=false){
 if(syncPromise)return syncPromise;
 syncPromise=(async()=>{
  const anchor=rounds[0]?.id,startedAt=Date.now();
  try{
   const knownIds=new Set(rounds.map(r=>r.id)),wasInitialized=initialized;
   // Include rows behind the future-clock block as well as the apparent head.
   const pollLimit=Math.min(1000,100+rounds.filter(r=>r.timeIssue==='clock').length);
   let result=full||!initialized?await modelPage():await page(pollLimit);
   const validHead=normalizeFeed(result.rows).rows;
   if(anchor&&validHead.length&&!validHead.some(r=>r.id===anchor)){if(!full)result=await modelPage();if(!result.rows.some(r=>String(r.id)===anchor))gap('Прежняя граница истории не найдена')}
   for(const s of signalJournal){if(s.status==='pending'&&lastPollAt&&startedAt-lastPollAt>COVERAGE_MS&&startedAt>=s.at&&lastPollAt<s.at+s.window){s.coverageGap=true;s.coverageReason='Пропуск обновлений в окне'}}
   if(result.total!=null)liveKnownTotal=result.total;
   const arrivalIds=new Set();
   if(wasInitialized){
    for(const raw of result.rows){const id=String(raw?.id??'');if(knownIds.has(id))break;if(id)arrivalIds.add(id)}
    const pastHead=Math.max(0,...rounds.filter(r=>r.timestamp&&r.timestamp<=startedAt+30000).map(r=>r.timestamp));
    // Correct-clock rows can be inserted below older future-clock rows.
    for(const raw of result.rows){const id=String(raw?.id??''),t=millis(raw?.timestamp??raw?.round_timestamp);if(id&&!knownIds.has(id)&&t>pastHead&&t<=startedAt+30000&&startedAt-t<=FRESH_MS)arrivalIds.add(id)}
    if(!result.rows.some(r=>knownIds.has(String(r?.id))))arrivalIds.clear();
   }
   collectorStatus=result.collector||null;window.BOG_SOURCE_STATUS=collectorStatus;const items=merge(result.rows,arrivalIds);lastPollAt=Date.now();online=!!collectorStatus?.source_connected;if(collectorStatus?.gap)gap("Разрыв игрового потока; непроверяемое окно");
   if(!initialized)archiveOffset=result.nextOffset??result.rows.length;
   initialized=true;if(full)modelRefreshedAt=lastPollAt;if(fresh())processNew(items);
   archiveRows=normalizeFeed([...rounds,...archiveRows]).rows.slice(0,10000);
   $('updated').textContent='Обновлено: '+fmtTime(lastPollAt);updateAnalysis();render();
  }catch(e){online=false;if(collectorStatus)collectorStatus={...collectorStatus,fresh:false};gap('История не обновилась: '+e.message);$('updated').textContent='Ошибка: '+e.message;renderStatus();renderSignals()}
  finally{syncPromise=null;window.__aviatorReady=true;window.dispatchEvent(new Event('aviator-ready'))}
 })();return syncPromise;
}
const refreshModel=()=>syncHistory(true),checkForNewRound=()=>syncHistory(false);
function applyLiveRound(raw){const items=merge([raw],new Set([String(raw?.id??'')]));if(items.length){online=true;lastPollAt=Date.now();archiveRows=normalizeFeed([...rounds,...archiveRows]).rows.slice(0,10000)}processNew(items);render();updateAnalysis()}
function connectLive(){window.ClassicCloud.connect(applyLiveRound,checkForNewRound)}
function scheduleLiveReconnect(){if(liveReconnectTimer)return;const delay=liveReconnectDelay;liveReconnectDelay=Math.min(30000,Math.round(delay*1.7));liveReconnectTimer=setTimeout(()=>{liveReconnectTimer=null;connectLive()},delay)}
function archiveSelection(){const min=Number($('archiveMin').value)||1,day=$('archiveDate').value;return archiveRows.filter(r=>r.coefficient>=min&&(!day||localDay(r.timestamp)===day))}
function renderArchive(){const key=[archiveRows.length,archiveRows[0]?.id,archiveRows[0]?._sequence,$('archiveMin').value,$('archiveDate').value,archiveBusy,archiveDone,archiveVisible].join('|');if(key===archiveRenderKey)return;archiveRenderKey=key;const chosen=archiveSelection();$('archiveGrid').innerHTML=chosen.slice(0,archiveVisible).map(r=>'<div class="coef" style="--coef:'+color(r.coefficient)+'" title="ID '+escapeText(r.id)+'"><strong>'+r.coefficient.toFixed(2)+'×</strong><time>'+(r.timestamp?new Date(r.timestamp).toLocaleDateString('ru-RU',{timeZone:'Europe/Kyiv'}):'Дата неизвестна')+'<br>'+fmtTime(r.timestamp)+(r.estimated?' ≈':'')+'</time></div>').join('')||'<div class="empty">В загруженной части истории нет раундов по фильтру.</div>';$('archiveCount').textContent='Загружено '+archiveRows.length+' · совпадений '+chosen.length+' · карточек '+Math.min(archiveVisible,chosen.length)+' · '+zone()+'. CSV включает все загруженные совпадения.';$('archiveMore').disabled=archiveBusy||archiveDone||archiveRows.length>=10000;const more=$('archiveShow');if(more)more.hidden=chosen.length<=archiveVisible}
async function loadArchive(){if(archiveBusy||archiveDone||archiveRows.length>=10000)return;archiveBusy=true;renderArchive();try{const result=await page(500,archiveOffset);archiveOffset+=result.rows.length;archiveRows=normalizeFeed([...archiveRows,...result.rows]).rows.slice(0,10000);archiveDone=!result.rows.length||(result.total!=null&&archiveOffset>=result.total);renderArchive()}catch(e){$('archiveCount').textContent='Архив не обновился: '+e.message}finally{archiveBusy=false;$('archiveMore').disabled=archiveDone||archiveRows.length>=10000}}
function csvCell(s){let v=String(s);if(/^[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
$('archiveCsv').addEventListener('click',()=>{const csv='id,coefficient,timestamp,estimated,time_quality,observed_at\r\n'+archiveSelection().map(r=>[r.id,r.coefficient,r.timestamp?new Date(r.timestamp).toISOString():'',r.estimated,r.timeIssue||'source',r._observedAt?new Date(r._observedAt).toISOString():''].map(csvCell).join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='aviator-classic-rounds.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
$('archiveMore').addEventListener('click',loadArchive);$('archiveShow').addEventListener('click',()=>{archiveVisible+=100;renderArchive()});$('archiveMin').addEventListener('change',()=>{archiveVisible=100;renderArchive()});$('archiveDate').addEventListener('change',()=>{archiveVisible=100;renderArchive()});$('normalTab').addEventListener('click',()=>chooseMode('normal'));$('vipTab').addEventListener('click',()=>chooseMode('vip'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden){checkForNewRound();renderSignals();connectLive()}});
window.addEventListener('bee-cloud-connect',()=>refreshModel());document.addEventListener('visibilitychange',()=>{if(!document.hidden){gap('Страница была в фоне: непрерывность окна не подтверждена');refreshModel()}});restoreJournal();chooseMode('vip');render();refreshModel();connectLive();setInterval(()=>{if(!window.ClassicCloud.connected())checkForNewRound();else window.ClassicCloud.getStatus(true).then(status=>{collectorStatus={...(collectorStatus||{}),source_connected:status.source_connected,fresh:status.fresh,error:status.error};online=!!status.source_connected;lastPollAt=Date.now();if(!status.fresh)gap('Источник Supabase отключён');renderStatus();renderSignals()}).catch(()=>{online=false;if(collectorStatus)collectorStatus.fresh=false;gap('Проверка Supabase недоступна');renderStatus();renderSignals()})},POLL_MS);setInterval(refreshModel,300000);setInterval(updateAnalysis,8000);setInterval(renderSignals,1000);


function timingMarkup(s){return signalMarkup(s,true)}
function timingReportReady(report,now){return reportReady(report,now)}
function registeredTiming(report,m,now){return recordedTiming(report,m,now,online&&fresh(now))}
document.addEventListener('click',e=>{const target=Number(e.target.closest('[data-focus-target]')?.dataset.focusTarget);if(!QUICK_TARGETS.includes(target))return;selectedTarget=target;try{localStorage.setItem(FOCUS_KEY,String(target))}catch{}activeVip=null;updateAnalysis(true);renderSignals()});

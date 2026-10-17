export const LARGE_TARGETS=[10,17,20,30,50,100,200,300,500,1000];
const TRAIN=20,TEST=8,LOOKBACK=100;
const median=a=>{const b=[...a].sort((x,y)=>x-y),i=b.length>>1;return b.length?b.length%2?b[i]:(b[i-1]+b[i])/2:0};
const quantile=(sorted,p)=>sorted[Math.max(0,Math.min(sorted.length-1,Math.ceil((sorted.length+1)*p)-1))];
function intervalModel(gaps){
 const sorted=gaps.slice(-LOOKBACK).sort((a,b)=>a-b),center=median(sorted);
 // A minimum width accounts for receipt-clock jitter, not certainty about a provider timestamp.
 return {center,lo:Math.max(0,Math.min(quantile(sorted,.1),center-30000)),hi:Math.max(quantile(sorted,.9),center+30000)};
}
function validate(gaps){
 let covered=0,legacyCovered=0;const errors=[],widths=[],legacyErrors=[];
 for(let i=Math.max(TRAIN,gaps.length-40);i<gaps.length;i++){
  const prior=gaps.slice(0,i),m=intervalModel(prior),actual=gaps[i];
  if(actual>=m.lo&&actual<=m.hi)covered++;
  const middle=median(prior),mad=median(prior.map(x=>Math.abs(x-middle))),width=Math.max(30000,mad*1.4826||middle*.35);
  if(Math.abs(actual-middle)<=width)legacyCovered++;
  errors.push(Math.abs(actual-m.center));legacyErrors.push(Math.abs(actual-middle));widths.push(m.hi-m.lo);
 }
 return {tested:errors.length,covered,coverage:errors.length?covered/errors.length:null,legacyCovered,medianErrorMs:errors.length?median(errors):null,legacyMedianErrorMs:errors.length?median(legacyErrors):null,medianWidthMs:errors.length?median(widths):null,nominalCoverage:.8};
}
export function largeHistory(input,target,now){
 const map=new Map(),conflicts=new Set();let conflict=false;
 for(const row of input){
  if(!Number.isFinite(row.coefficient)||row.coefficient<1)continue;
  if(Number.isFinite(row.timestamp)&&row.timestamp>now)continue;
  if(Number.isFinite(row.receivedAt)&&row.receivedAt>now)continue;
  const prior=map.get(row.id);
  if(prior&&(prior.coefficient!==row.coefficient||prior.timestamp!==row.timestamp)){conflict=true;conflicts.add(row.id)}
  map.set(row.id,row);
 }
 const events=[...map.values()].filter(r=>r.coefficient>=target).sort((a,b)=>Number(a.sourceSeq??a.id)-Number(b.sourceSeq??b.id));
 const gaps=[];
 for(let i=1;i<events.length;i++){
  const a=events[i-1],b=events[i],delta=b.timestamp-a.timestamp;
  if(!a.estimated&&!b.estimated&&Number.isFinite(a.timestamp)&&Number.isFinite(b.timestamp)&&delta>0&&a.timing_segment!=null&&a.timing_segment===b.timing_segment)gaps.push(delta);
 }
 const known=events.filter(r=>!r.estimated&&Number.isFinite(r.timestamp)),last=events.at(-1),gap=median(gaps),mad=median(gaps.map(g=>Math.abs(g-gap))),validation=validate(gaps);
 const recentEvents=events.filter(r=>!conflicts.has(r.id)).slice(-6).reverse().map(r=>({id:r.id,coefficient:r.coefficient,timestamp:!r.estimated&&Number.isFinite(r.timestamp)?r.timestamp:null,estimated:!!r.estimated||!Number.isFinite(r.timestamp)}));
 const result={target,count:known.length,intervalCount:gaps.length,last:last&&!last.estimated&&Number.isFinite(last.timestamp)?last:null,recentEvents,gap,mad,window:null,validation,model:'timing-v2-chronological',reason:'Нужно 20 полных интервалов для обучения и ещё 8 для проверки времени.'};
 if(conflict)return {...result,count:known.filter(r=>!conflicts.has(r.id)).length,last:null,gap:0,mad:0,intervalCount:0,validation:validate([]),reason:'Конфликт записей одного раунда; расчёт остановлен.'};
 if(validation.tested<TEST)return result;
 if(!result.last)return {...result,reason:'Время последнего крупного результата неизвестно; новый срок не назначен.'};
 const m=intervalModel(gaps),center=last.timestamp+m.center,start=last.timestamp+m.lo,end=last.timestamp+m.hi;
 if(end<=now)return {...result,reason:'Исторический диапазон уже прошёл. Без нового крупного события окно не переносится.'};
 return {...result,reason:'Исторический диапазон 10–90% интервалов; ошибка времени проверена последовательно на более поздних событиях. Это не вероятность выигрыша.',window:{start:Math.max(now,start),end,center,id:`large-v2:${target}:${last.id}:${center}`,rawStart:start}};
}

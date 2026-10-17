import {coversWindow} from './coverage.js';
export function validWindow(x){return !!x&&typeof x.id==='string'&&Number.isFinite(x.target)&&x.target>=1&&Number.isFinite(x.createdAt)&&Number.isFinite(x.start)&&Number.isFinite(x.end)&&x.end>x.start&&x.createdAt<=x.end&&['pending','unknown','hit','miss'].includes(x.status)}
export function readJournal(raw){try{const list=JSON.parse(raw||'[]');return Array.isArray(list)?list.filter(validWindow):[]}catch{return []}}
const rank={pending:0,unknown:1,miss:2,hit:3};
export function mergeJournals(...lists){const map=new Map();for(const item of lists.flat().filter(validWindow)){const prior=map.get(item.id);if(!prior){map.set(item.id,item);continue}if(prior.target!==item.target||prior.end!==item.end){map.set(item.id,{...prior,status:'unknown',reason:'Конфликт параметров сохранённого окна.'});continue}const base=prior.createdAt<=item.createdAt?prior:item,winner=rank[item.status]>rank[prior.status]||rank[item.status]===rank[prior.status]&&(item.checkedAt||0)>(prior.checkedAt||0)?item:prior;map.set(item.id,{...winner,createdAt:base.createdAt,start:base.start,end:base.end,target:base.target})}return [...map.values()].sort((a,b)=>b.createdAt-a.createdAt||a.id.localeCompare(b.id)).slice(0,200)}
export function archiveResult(item,rows,now,{complete=false,orderVerified=false}={}){
 if(!validWindow(item)||!['unknown','pending'].includes(item.status)||now<item.createdAt)return item;
 const candidates=rows.filter(r=>!r.estimated&&Number.isFinite(r.timestamp)&&r.timestamp<=now&&r.timestamp>item.createdAt&&r.timestamp>=item.start&&r.timestamp<=item.end);
 const hit=candidates.filter(r=>r.coefficient>=item.target).sort((a,b)=>a.timestamp-b.timestamp)[0];
 if(hit)return {...item,status:'hit',result:hit.coefficient,roundId:hit.id,resultAt:hit.timestamp,verification:'archive',checkedAt:now,reason:'Цель подтверждена по архиву Supabase.'};
 if(now<=item.end)return {...item,checkedAt:now,reason:'Окно ещё открыто; подтверждённого попадания пока нет. Архив будет проверен снова.'};
 if(complete&&orderVerified&&candidates.length&&coversWindow(item,rows,now))return {...item,status:'miss',result:Math.max(...candidates.map(r=>r.coefficient)),verification:'archive',checkedAt:now,reason:'Архив окна проверен; цель не достигнута.'};
 return {...item,status:'unknown',checkedAt:now,reason:!complete?'Архив загружен не полностью; повторим проверку.':!candidates.length?'В архиве нет подтверждённых раундов этого окна.':'В архиве цель не найдена, но полнота порядка игры не подтверждена; промах не засчитан.'};
}

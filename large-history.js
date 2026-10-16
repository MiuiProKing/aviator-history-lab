export const LARGE_TARGETS=[10,20,50,100,200,300,500,1000];
const median=a=>{const b=[...a].sort((x,y)=>x-y),i=Math.floor(b.length/2);return b.length?b.length%2?b[i]:(b[i-1]+b[i])/2:0};
export function largeHistory(input,target,now){
 const events=[...new Map(input.filter(r=>!r.estimated&&r.coefficient>=target&&r.timestamp<=now).map(r=>[r.id,r])).values()].sort((a,b)=>a.timestamp-b.timestamp);
 const gaps=events.slice(1).map((r,i)=>r.timestamp-events[i].timestamp),gap=median(gaps),mad=median(gaps.map(g=>Math.abs(g-gap))),last=events.at(-1);
 const result={target,count:events.length,last,gap,mad,window:null,reason:'Нужно минимум 8 событий с точным временем.'};
 if(events.length<8)return result;
 if(gap<=0||mad>gap*.6)return {...result,reason:'Интервалы сильно различаются; окно не сформировано.'};
 const center=last.timestamp+gap,width=Math.max(30000,mad*1.4826||gap*.35),end=center+width,start=center-width;
 if(end<=now)return {...result,reason:'Расчётное окно уже прошло. Новый срок без нового события не переносится.'};
 return {...result,reason:'Медиана исторических интервалов ± разброс (MAD). Это экспериментальная оценка.',window:{start:Math.max(now,start),end,center,id:`large:${target}:${last.id}:${center}`,rawStart:start}};
}

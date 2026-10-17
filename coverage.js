// A numeric ID boundary on each side is required to prove absence of a hit.
export function coversWindow(item,rows,now){
 const seq=r=>Number(r.sourceSeq??r.source_seq??r._sequence??r.order??r.id);
 const valid=r=>!r.estimated&&Number.isFinite(r.timestamp)&&r.timestamp<=now&&Number.isFinite(r.coefficient)&&r.coefficient>=1&&Number.isSafeInteger(seq(r));
 const sorted=[...rows].sort((a,b)=>seq(a)-seq(b));
 const before=sorted.filter(r=>valid(r)&&r.timestamp<=item.start).at(-1),after=sorted.find(r=>valid(r)&&r.timestamp>item.end);
 if(!before||!after||seq(after)<=seq(before))return false;
 const span=sorted.filter(r=>seq(r)>=seq(before)&&seq(r)<=seq(after));
 return span.length===seq(after)-seq(before)+1&&span.every((r,i)=>valid(r)&&seq(r)===seq(before)+i&&(!i||r.timestamp>=span[i-1].timestamp));
}

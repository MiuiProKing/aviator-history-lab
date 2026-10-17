export const QUICK_TARGETS=[10,17,30,50];
export const FOCUS_KEY='aviator-focus-target-v1';
export function focusTarget(storage){try{const n=Number(storage.getItem(FOCUS_KEY));return QUICK_TARGETS.includes(n)?n:17}catch{return 17}}
export function reportReady(report,now){
 const checked=Date.parse(report?.checked_at);
 return !!report?.enabled&&!!report.fresh&&!report.error&&report.model_version==='cloud-v2-timing'&&Number.isFinite(checked)&&checked<=now+10000&&now-checked<90000;
}
export function sourceReady(source,now){const checked=Date.parse(source?.checked_at);return !!source?.fresh&&!!source.source_connected&&Number.isFinite(checked)&&checked<=now+10000&&now-checked<15000}
// Only a pending window already recorded by the server can be shown as future.
// A model's candidate is useful for an ID/center, never as a replacement record.
export function registeredTiming(report,model,now,ready=true){
 if(!ready||!reportReady(report,now)||!model?.window)return null;
 const candidate=model.window,record=report.windows?.find(w=>w.id==='cloud:'+candidate.id&&w.status==='pending'&&w.target===model.target);
 if(!record||![record.start,record.end,record.createdAt].every(Number.isFinite)||record.start>=record.end||record.end<=now||record.createdAt>now+10000||record.createdAt>record.end)return null;
 return {...candidate,id:record.id,target:model.target,start:record.start,end:record.end};
}
// Reuse a mounted orb on refresh instead of restarting its animation every second.
const markup=new WeakMap();
export function updateInsight(element,html){
 if(!element||markup.get(element)===html)return;
 const fragment=document.createElement('template');fragment.innerHTML=html;
 const old=element.querySelector('thinking-orb'),next=fragment.content.querySelector('thinking-orb');
 if(old&&next){const state=next.getAttribute('state')||'idle';if(old.getAttribute('state')!==state)old.setAttribute('state',state);next.replaceWith(old)}
 element.replaceChildren(fragment.content);markup.set(element,html);
}

(()=>{
 const NativeDate=globalThis.Date;let offset=0;
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const part=(date,key)=>Number(parts.formatToParts(date).find(x=>x.type===key).value);
 class ServerDate extends NativeDate{
  constructor(...args){super(...(args.length?args:[NativeDate.now()+offset]))}
  static now(){return NativeDate.now()+offset}
  getHours(){return part(this,'hour')}getMinutes(){return part(this,'minute')}getSeconds(){return part(this,'second')}
 }
 window.AviatorClock={Date:ServerDate,now:()=>ServerDate.now(),sync(server){const n=NativeDate.parse(server);if(Number.isFinite(n))offset=n-NativeDate.now()}};
})();

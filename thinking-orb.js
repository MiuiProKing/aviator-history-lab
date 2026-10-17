import {mountOrb} from './vendor/thinking-orbs/orb-core.js';

// Thinking Orbs 0.1.2, MIT, Yogesh. Local, dependency-free SVG renderer.
class ThinkingOrb extends HTMLElement {
 static get observedAttributes(){return ['state']}
 draw(){
  this.orb?.destroy();
  const state=this.getAttribute('state')==='searching'?'searching':'idle';
  this.orb=mountOrb(this.svg,{state,variant:state==='idle'?'blink':'default',tilt:-49,size:320});
  this.update?.();
 }
 attributeChangedCallback(){if(this.orb)this.draw()}
 connectedCallback(){
  if(this.orb)return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  this.svg=svg;this.replaceChildren(svg);this.draw();
  this.visible=true;this.motion=matchMedia('(prefers-reduced-motion: reduce)');
  this.update=()=>{if(document.hidden||!this.visible||this.motion.matches)this.orb?.pause();else this.orb?.play()};
  this.observer=new IntersectionObserver(entries=>{this.visible=entries[0].isIntersecting;this.update()});
  this.motionUpdate=()=>this.draw();
  this.observer.observe(this);document.addEventListener('visibilitychange',this.update);this.motion.addEventListener('change',this.motionUpdate);this.update();
 }
 disconnectedCallback(){queueMicrotask(()=>{
  // Moving the existing host during a data refresh keeps the same orb alive.
  if(this.isConnected)return;
  this.observer?.disconnect();document.removeEventListener('visibilitychange',this.update);this.motion?.removeEventListener('change',this.motionUpdate);this.orb?.destroy();this.orb=null;
 })}
}
if(!customElements.get('thinking-orb'))customElements.define('thinking-orb',ThinkingOrb);

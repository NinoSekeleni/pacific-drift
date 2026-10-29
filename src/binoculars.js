export function binocularFov(magnification,base=68){return 2*Math.atan(Math.tan(base*Math.PI/360)/Math.max(1,magnification))*180/Math.PI;}
export function createBinoculars({onRaise=()=>{},onLower=()=>{},onAim=()=>{}}={}){
 const wrap=document.createElement('section');wrap.className='binocular-view';wrap.hidden=true;wrap.setAttribute('aria-label','Live binocular view');
 wrap.innerHTML=`<div id="binocularAim" class="binocular-aim" tabindex="0" aria-label="Drag to scan the sea"></div><svg class="binocular-mask" viewBox="0 0 1000 700" preserveAspectRatio="none" aria-hidden="true"><defs><mask id="binocularAperture"><rect width="1000" height="700" fill="white"/><circle class="binocular-left" cx="380" cy="350" r="270" fill="black"/><circle class="binocular-right" cx="620" cy="350" r="270" fill="black"/></mask></defs><rect width="1000" height="700" fill="#030506" mask="url(#binocularAperture)"/></svg><div class="binocular-reticle" aria-hidden="true">+</div><header><span>LOOKOUT / LIVE SEA</span><button id="lowerBinoculars" type="button">Lower binoculars <span>Esc</span></button></header><footer><label for="binocularZoom">Magnification <output id="binocularZoomValue">4×</output></label><input id="binocularZoom" type="range" min="3" max="8" step=".5" value="4"><p>Drag to look · scroll to zoom</p></footer>`;
 document.body.append(wrap);let active=false,zoom=4,pointer=null;
 const aim=wrap.querySelector('#binocularAim'),range=wrap.querySelector('#binocularZoom'),output=wrap.querySelector('#binocularZoomValue');
 function setZoom(value){zoom=Math.max(3,Math.min(8,Number(value)||4));range.value=zoom;output.textContent=zoom+'×';}
 function resize(){const w=window.innerWidth,h=window.innerHeight,r=Math.min(w*.29,h*.38),svg=wrap.querySelector('svg');svg.setAttribute('viewBox',`0 0 ${w} ${h}`);svg.querySelectorAll('rect').forEach(el=>{el.setAttribute('width',w);el.setAttribute('height',h);});for(const [name,x]of [['left',w*.40],['right',w*.60]]){const el=svg.querySelector('.binocular-'+name);el.setAttribute('cx',x);el.setAttribute('cy',h/2);el.setAttribute('r',r);}}
 window.addEventListener('resize',resize);
 function open(){resize();active=true;wrap.hidden=false;document.body.classList.add('using-binoculars');onRaise();aim.focus();}
 function close(){if(!active)return;active=false;pointer=null;wrap.hidden=true;document.body.classList.remove('using-binoculars');onLower();}
 aim.addEventListener('pointerdown',e=>{pointer={id:e.pointerId,x:e.clientX,y:e.clientY};aim.setPointerCapture(e.pointerId);});
 aim.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;onAim(e.clientX-pointer.x,e.clientY-pointer.y,zoom);pointer.x=e.clientX;pointer.y=e.clientY;});
 for(const type of ['pointerup','pointercancel','lostpointercapture'])aim.addEventListener(type,()=>pointer=null);
 aim.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom-Math.sign(e.deltaY)*.5);},{passive:false});
 range.oninput=()=>setZoom(range.value);wrap.querySelector('#lowerBinoculars').onclick=close;
 wrap.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();close();}else if(e.target===aim&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();onAim(e.key==='ArrowLeft'?-24:e.key==='ArrowRight'?24:0,e.key==='ArrowUp'?-24:e.key==='ArrowDown'?24:0,zoom);}});
 return {open,close,get active(){return active;},get fov(){return binocularFov(zoom);}};
}

// The fish on the catch card: the landed model, lit as if on deck, turning slowly. Drag to turn
// it over and look at the other side. A small renderer of its own, created on the first catch
// and only drawing while the card is open; the journal keeps the illustrated plates.
import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {createFishMesh} from './fish-skin.js';
import {FISH} from './fishing-ecology.js';

export function createCatchViewer(figure,{fallback=null}={}){
 let renderer=null,scene,camera,fish=null,raf=0,yaw=Math.PI/2,tilt=.18,spin=.25,drag=null,last=0,failed=false;
 const canvas=document.createElement('canvas');canvas.className='catch-canvas';canvas.setAttribute('role','img');
 function init(){
  if(renderer||failed)return !!renderer;
  try{renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});}catch(e){failed=true;return false;}
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.outputColorSpace=T.LinearSRGBColorSpace;renderer.toneMapping=T.NeutralToneMapping;renderer.toneMappingExposure=1.05;
  scene=new T.Scene();camera=new T.PerspectiveCamera(26,1.5,.05,20);
  const pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(new RoomEnvironment(),.04).texture;pmrem.dispose();
  const sun=new T.DirectionalLight(0xfff1dc,2.4);sun.position.set(1.5,3,2);scene.add(sun,new T.HemisphereLight(0xbcd4e6,0x3a4048,.6));
  canvas.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,yaw,tilt};canvas.setPointerCapture(e.pointerId);spin=0;});
  canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw=drag.yaw+(e.clientX-drag.x)*.012;tilt=T.MathUtils.clamp(drag.tilt+(e.clientY-drag.y)*.008,-.9,.9);});
  const up=()=>{drag=null;};canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  canvas.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){yaw-=.2;spin=0;}if(e.key==='ArrowRight'){yaw+=.2;spin=0;}});canvas.tabIndex=0;
  return true;
 }
 function frame(now){raf=requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000||0);last=now;
  const w=figure.clientWidth||480,h=Math.round(w/1.5);if(canvas.width!==Math.round(w*renderer.getPixelRatio())){renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
  yaw+=spin*dt;if(fish){fish.rotation.set(tilt,yaw,0,'XYZ');const u=fish.userData.fishUniforms;u.uFSwim.value.x+=dt*2.2;}
  renderer.render(scene,camera);}
 function show(id,{kg=1,cm=50}={}){
  if(!init()){if(fallback)fallback.hidden=false;canvas.hidden=true;return false;}
  if(!canvas.isConnected)figure.prepend(canvas);canvas.hidden=false;if(fallback)fallback.hidden=true;
  if(fish){scene.remove(fish);fish.material.dispose();}
  fish=createFishMesh(id,{landed:true});const tail=.15+Math.random()*.2;
  fish.userData.pose({jaw:.28+Math.random()*.15,curl:(Math.random()<.5?-1:1)*(.5+tail*2),sag:-.25,wet:1,swim:.015});
  fish.scale.setScalar(1);fish.userData.fishUniforms.uFInfo.value.w=1; // shown at model scale, so shaded as a one-metre fish
  // the deeper the body, the further the camera stands back to fit it in
  const depth=(FISH[id].bodyDepth??1);camera.position.set(0,.02,1.55+depth*.12);camera.lookAt(0,0,0);
  scene.add(fish);canvas.setAttribute('aria-label',`3D model of the ${FISH[id].name}. Drag to turn it.`);
  spin=.18;yaw=Math.PI/2-.3+Math.random()*.2;tilt=.12;
  if(!raf){last=performance.now();raf=requestAnimationFrame(frame);}
  return true;
 }
 function hide(){if(raf)cancelAnimationFrame(raf);raf=0;}
 return {show,hide,get canvas(){return canvas;},get fish(){return fish;}};
}

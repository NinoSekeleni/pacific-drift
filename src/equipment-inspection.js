import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {createBoatMaterial} from './boat-materials.js';
export const EQUIPMENT={
 backpack:{title:'Backpack',kind:'CANVAS / PERSONAL KIT',description:'Turn it over to inspect the fabric, pockets and straps. Keep the small instruments here when you want a clear bench.'},
 radio:{title:'Handheld radio',kind:'WORLD RADIO',description:'Tune a live station, search by country, or turn the dial. Playback continues when you put the radio down.'},
 walkman:{title:'Sony Walkman',kind:'SPOTIFY / DIGITAL AUDIO TAPE',description:'Your Spotify player, carried aboard. Its original LCD shows the connection, playback state and elapsed time.'},
 lantern:{title:'Lantern',kind:'WARM LIGHT / NIGHT VISION',description:'Light the boat or extinguish the flame to let your eyes adjust to the stars. The switch changes the lantern aboard.'},
 binoculars:{title:'Used binoculars',kind:'OPTICS / LOOKOUT',description:'Inspect the worn housing and coated lenses, then raise them to look across the actual sea. Drag to scan the horizon.'}
};
export function inspectionObject(source,environment,{lampUniform=null}={}){
 const root=source.clone(true);root.position.set(0,0,0);root.rotation.set(0,0,0);root.scale.set(1,1,1);
 root.traverse(o=>{
  o.layers.set(0);if(!o.isMesh)return;
  const prepare=sourceMaterial=>{
   const basis=sourceMaterial.clone();
   if(!o.userData.liveScreen)for(const key of ['map','emissiveMap'])if(basis[key]){basis[key]=basis[key].clone();basis[key].colorSpace=THREE.SRGBColorSpace;}
   const m=createBoatMaterial(basis);basis.dispose();
   m.envMap=m.isMeshStandardMaterial?environment:null;m.envMapIntensity=.65;
   if(lampUniform&&m.isMeshStandardMaterial){
    const prior=m.onBeforeCompile;
    m.onBeforeCompile=shader=>{
     prior(shader);shader.uniforms.uInspectionLamp=lampUniform;
     shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vInspectionPosition;').replace('#include <project_vertex>','#include <project_vertex>\nvInspectionPosition=(modelMatrix*vec4(transformed,1.)).xyz;');
     shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vInspectionPosition;uniform float uInspectionLamp;').replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
      float globeRegion=1.-smoothstep(.78,1.12,length(vec3(vInspectionPosition.x/.27,(vInspectionPosition.y+.11)/.34,vInspectionPosition.z/.27)));
      float neutralGlass=smoothstep(.30,.62,min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)))*(1.-smoothstep(.08,.22,max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b))-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b))));
      totalEmissiveRadiance+=vec3(.95,.38,.075)*uInspectionLamp*globeRegion*neutralGlass;
     `);
    };m.customProgramCacheKey=()=> 'pacific-inspection-lantern-v1';
   }
   return m;
  };o.material=Array.isArray(o.material)?o.material.map(prepare):prepare(o.material);
 });
 root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),scale=1.65/Math.max(size.x,size.y,size.z);
 root.position.copy(center).multiplyScalar(-scale);root.scale.setScalar(scale);
 return root;
}
export function createEquipmentInspection({renderer,radio,onOpen=()=>{},onClose=()=>{},onLantern=()=>{},lanternOn=()=>false,onBinoculars=()=>{},stow=()=>{},isStowed=()=>false}={}){
 const wrap=document.createElement('section');wrap.className='equipment-inspection';wrap.hidden=true;wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-labelledby','equipmentTitle');
 wrap.innerHTML=`<header class="equipment-header"><div><p class="equipment-eyebrow">ABOARD / OBJECT STUDY</p><h2 id="equipmentTitle">Your equipment</h2></div><button type="button" id="equipmentClose" aria-label="Put the item down">Put down <span>Esc</span></button></header>
 <div class="equipment-layout"><div class="equipment-view"><div id="equipmentStage" class="equipment-stage" tabindex="0" aria-label="3D object: drag or arrow keys to rotate, scroll or plus and minus to zoom"></div><div class="equipment-view-controls"><button id="equipmentFront" type="button">Front</button><button id="equipmentBack" type="button">Back</button><button id="equipmentReset" type="button">Reset view</button><span>Drag to turn · scroll or pinch to zoom</span></div></div>
 <aside class="equipment-details"><p id="equipmentKind" class="equipment-eyebrow"></p><p id="equipmentDescription"></p><p id="equipmentLoading" role="status">Loading the supplied model…</p><div id="equipmentActions"></div><div id="equipmentMedia"></div></aside></div>
 <nav class="equipment-tray" aria-label="Onboard items">${Object.entries(EQUIPMENT).map(([id,item])=>`<button type="button" data-equipment="${id}" aria-pressed="false">${item.title}</button>`).join('')}</nav>`;
 document.body.append(wrap);
 const $=id=>wrap.querySelector('#'+id),stage=$('equipmentStage'),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,100);
 const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pmrem.fromScene(room,.04, .1,100).texture;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xd9ebf4,0x3b3025,1.2));
 const key=new THREE.DirectionalLight(0xffedda,2);key.position.set(3,4,5);scene.add(key);
 const rim=new THREE.DirectionalLight(0xbad9ef,1.1);rim.position.set(-4,2,-3);scene.add(rim);
 const glow=new THREE.PointLight(0xffa75a,0,4,2);glow.position.set(0,.05,.1);scene.add(glow);
 const controls=new OrbitControls(camera,stage);controls.enableDamping=true;controls.dampingFactor=.12;controls.enablePan=false;controls.minDistance=1.2;controls.maxDistance=9;
 controls.minPolarAngle=.02;controls.maxPolarAngle=Math.PI-.02;controls.enabled=false;
 const lampUniform={value:0};
 const assets=new Map();let active=false,current=null,object=null,lastFocus=null,lastStatus='',distance=4;
 const mediaPanel=document.getElementById('radio'),mediaAnchor=document.createComment('radio original location');mediaPanel.before(mediaAnchor);
 function disposeObject(){if(!object)return;object.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const k of ['map','emissiveMap'])if(m[k]&& !o.userData.liveScreen)m[k].dispose();m.dispose();}});scene.remove(object);object=null;}
 function frame(front=true){
  const rect=stage.getBoundingClientRect();camera.aspect=Math.max(.1,rect.width/Math.max(1,rect.height));camera.updateProjectionMatrix();
  distance=Math.max(3.0,1.12/Math.tan(35*Math.PI/360)/Math.min(1,camera.aspect));controls.maxDistance=Math.max(9,distance*2);
  camera.position.set(front?.45:-.45,.24,front?distance:-distance);controls.target.set(0,0,0);controls.update();
 }
 function showModel(){disposeObject();const source=assets.get(current);$('equipmentLoading').hidden=!!source;if(!source)return;object=inspectionObject(source,environment,current==='lantern'?{lampUniform}:{});scene.add(object);frame();}
 function action(label,fn){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',fn);$('equipmentActions').append(button);return button;}
 function actions(){
  $('equipmentActions').replaceChildren();
  if(current==='lantern'){action(lanternOn()?'Extinguish lantern':'Light lantern',()=>{onLantern();actions();});}
  if(current==='binoculars'){action('Look through binoculars',()=>{close();onBinoculars();});}
  if(['walkman','binoculars','radio'].includes(current)){
   action(isStowed(current)?'Take out of backpack':'Stow in backpack',()=>{stow(current,!isStowed(current));actions();});
  }
  if(current==='backpack'){
   const label=document.createElement('h3');label.textContent='Your small kit';$('equipmentActions').append(label);
   for(const id of ['binoculars','walkman','radio']){
    const row=document.createElement('div');row.className='equipment-kit-row';
    const inspect=document.createElement('button');inspect.type='button';inspect.textContent=EQUIPMENT[id].title+(isStowed(id)?' · packed':' · on the bench');inspect.onclick=()=>select(id);
    const toggle=document.createElement('button');toggle.type='button';toggle.textContent=isStowed(id)?'Take out':'Pack';toggle.onclick=()=>{stow(id,!isStowed(id));actions();};row.append(inspect,toggle);$('equipmentActions').append(row);
   }
  }
 }
 function select(id){if(!EQUIPMENT[id])return;current=id;lastStatus='';const item=EQUIPMENT[id];
  $('equipmentTitle').textContent=item.title;$('equipmentKind').textContent=item.kind;$('equipmentDescription').textContent=item.description;
  wrap.querySelectorAll('[data-equipment]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.equipment===id)));
  const media=id==='radio'||id==='walkman';wrap.classList.toggle('equipment-has-media',media);
  if(media){$('equipmentMedia').append(mediaPanel);radio.openSource(id==='walkman'?'TAPE':'WORLD');}
  else{radio.setOpen(false);mediaAnchor.after(mediaPanel);}
  actions();showModel();
 }
 function open(id='backpack'){if(!active){lastFocus=document.activeElement;active=true;wrap.hidden=false;document.body.classList.add('inspecting-equipment');controls.enabled=true;onOpen();}$('equipmentClose').focus();select(id);}
 function close(){if(!active)return;active=false;controls.enabled=false;wrap.hidden=true;document.body.classList.remove('inspecting-equipment');radio.setOpen(false);mediaAnchor.after(mediaPanel);disposeObject();onClose();lastFocus?.focus?.({preventScroll:true});}
 $('equipmentClose').onclick=close;$('equipmentFront').onclick=()=>frame(true);$('equipmentBack').onclick=()=>frame(false);$('equipmentReset').onclick=()=>frame(true);
 wrap.querySelectorAll('[data-equipment]').forEach(button=>button.onclick=()=>select(button.dataset.equipment));
 document.getElementById('radioClose').addEventListener('click',()=>{if(active&&['radio','walkman'].includes(current))close();});
 stage.addEventListener('keydown',e=>{
  const delta={ArrowLeft:[-.13,0],ArrowRight:[.13,0],ArrowUp:[0,-.13],ArrowDown:[0,.13]}[e.key];
  if(delta){e.preventDefault();const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));spherical.theta+=delta[0];spherical.phi=THREE.MathUtils.clamp(spherical.phi+delta[1],.02,Math.PI-.02);camera.position.setFromSpherical(spherical).add(controls.target);controls.update();}
  if(['+','=','-'].includes(e.key)){e.preventDefault();const offset=camera.position.clone().sub(controls.target),next=THREE.MathUtils.clamp(offset.length()*(e.key==='-'?1.1:.9),controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset.setLength(next));controls.update();}
 });
 wrap.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){
  const nodes=[...wrap.querySelectorAll('button,select,input,a,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);const first=nodes[0],last=nodes.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }});
 function render(dt){if(!active)return;controls.update();const r=stage.getBoundingClientRect(),w=window.innerWidth,h=window.innerHeight;
  camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();
  lampUniform.value=current==='lantern'&&lanternOn()?1:0;
  glow.intensity=lampUniform.value*2.5;
  if(object&&current==='lantern')object.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.emissive&&/glass|flame|glow/i.test(m.name))m.emissive.setRGB(glow.intensity*.25,glow.intensity*.08,.005);});
  const clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
  const tone=renderer.toneMapping,exposure=renderer.toneMappingExposure;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.85;
  renderer.setScissorTest(false);renderer.setViewport(0,0,w,h);renderer.setClearColor(0x091117,1);renderer.clear();
  renderer.setViewport(r.left,h-r.bottom,r.width,r.height);renderer.setScissor(r.left,h-r.bottom,r.width,r.height);renderer.setScissorTest(true);renderer.render(scene,camera);
  renderer.setScissorTest(scissorTest);renderer.setScissor(scissor);renderer.setViewport(viewport);renderer.setClearColor(clear,alpha);renderer.toneMapping=tone;renderer.toneMappingExposure=exposure;
 }
 return {open,close,render,get active(){return active;},get current(){return current;},register(id,root){assets.set(id,root);if(active&&current===id)showModel();}};
}

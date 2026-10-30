import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {createBoatMaterial} from './boat-materials.js';
import {applyTapePose} from './tape-transport.js';
export const EQUIPMENT={
 anbernic:{title:'Anbernic RG35XX',kind:'OBJECT ROOM / POCKET GARDEN',description:'Your Object Room handheld, brought aboard at its real size. Choose its classic grey shell or transparent Atomic purple finish. Turn it over to see the internals, or play Pocket Garden on its own screen. Arrow keys move; A explores; Start pauses. Your garden is saved with your voyage.'},
 gps:{title:'GPS tablet',kind:'GLOBAL NAVIGATION / REAL GEOGRAPHY',description:'Your position on an offline world chart. Pick a country, island, town or coordinates, then plot a passage around land. Select Use GPS to operate the screen; Inspect device returns to the 3D view.'},
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
export function createEquipmentInspection({renderer,radio,onOpen=()=>{},onClose=()=>{},onLantern=()=>{},lanternOn=()=>false,onBinoculars=()=>{},stow=()=>{},isStowed=()=>false,gps=null,anbernic=null,onSelect=()=>{},getTapeState=()=>({phase:0})}={}){
 const wrap=document.createElement('section');wrap.className='equipment-inspection';wrap.hidden=true;wrap.setAttribute('role','dialog');wrap.setAttribute('aria-modal','true');wrap.setAttribute('aria-labelledby','equipmentTitle');
 wrap.innerHTML=`<header class="equipment-header"><div><h2 id="equipmentTitle" hidden>Your equipment</h2><select id="equipmentPicker" aria-label="Item to inspect">${Object.entries(EQUIPMENT).map(([id,item])=>`<option value="${id}">${item.title}</option>`).join('')}</select></div><button type="button" id="equipmentClose" aria-label="Put the item down">×</button></header>
 <div class="equipment-layout"><div class="equipment-view"><div id="equipmentStage" class="equipment-stage" tabindex="0" aria-label="3D object: drag or arrow keys to rotate, scroll or plus and minus to zoom"></div></div>
 <aside class="equipment-details"><p id="equipmentLoading" role="status">Loading the supplied model…</p><div id="equipmentActions"></div><div id="equipmentMedia"></div></aside></div>`;
 document.body.append(wrap);
 const $=id=>wrap.querySelector('#'+id),stage=$('equipmentStage'),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.01,100);
 let environment=null;function ensureEnvironment(){if(environment)return;const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();environment=pmrem.fromScene(room,.04,.1,100).texture;room.dispose();pmrem.dispose();}
 scene.add(new THREE.HemisphereLight(0xd9ebf4,0x3b3025,1.2));
 const key=new THREE.DirectionalLight(0xffedda,2);key.position.set(3,4,5);scene.add(key);
 const rim=new THREE.DirectionalLight(0xbad9ef,1.1);rim.position.set(-4,2,-3);scene.add(rim);
 const glow=new THREE.PointLight(0xffa75a,0,4,2);glow.position.set(0,.05,.1);scene.add(glow);
 const controls=new OrbitControls(camera,stage);controls.enableDamping=true;controls.dampingFactor=.12;controls.enablePan=false;controls.minDistance=1.2;controls.maxDistance=9;
 controls.minPolarAngle=.02;controls.maxPolarAngle=Math.PI-.02;controls.enabled=false;
 const lampUniform={value:0};
 const useButton=document.createElement('button');useButton.id='gpsUse';useButton.textContent='Use';useButton.hidden=true;$('equipmentClose').before(useButton);
 const assets=new Map();let active=false,current=null,object=null,lastFocus=null,lastStatus='',distance=4;
 const mediaPanel=document.getElementById('radio'),mediaAnchor=document.createComment('radio original location');mediaPanel.before(mediaAnchor); // The live iframe stays here throughout its lifetime.
 function disposeObject(){if(!object)return;object.traverse(o=>{if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const k of ['map','emissiveMap'])if(m[k]&& !o.userData.liveScreen)m[k].dispose();m.dispose();}});scene.remove(object);object=null;}
 function frame(front=true){
  const rect=stage.getBoundingClientRect();camera.aspect=Math.max(.1,rect.width/Math.max(1,rect.height));camera.updateProjectionMatrix();
  distance=Math.max(3.0,1.12/Math.tan(35*Math.PI/360)/Math.min(1,camera.aspect));controls.maxDistance=Math.max(9,distance*2);
  camera.position.set(front?.45:-.45,.24,front?distance:-distance);controls.target.set(0,0,0);controls.update();
 }
 function gpsView(){
  if(!gps?.using||!object)return;const mesh=object.getObjectByName('Live GPS screen');if(!mesh)return;object.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(mesh),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),r=stage.getBoundingClientRect();camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();const d=Math.max(size.y,size.x/camera.aspect)*.61/Math.tan(35*Math.PI/360)+.03;camera.position.set(center.x,center.y,d);controls.target.copy(center);camera.lookAt(center);
 }
 function setGPS(value){if(value){gps.show(stage);controls.enabled=false;}else{gps?.hide();controls.enabled=active;}wrap.classList.toggle('equipment-using-gps',value);useButton.textContent=value?'Inspect':'Use';if(value)gpsView();else frame();}
 useButton.onclick=()=>setGPS(!gps.using);
 function showModel(){disposeObject();const source=assets.get(current);$('equipmentLoading').hidden=!!source;if(!source)return;ensureEnvironment();object=inspectionObject(source,environment,current==='lantern'?{lampUniform}:{});scene.add(object);if(gps?.using)gpsView();else frame();}
 let options=null;function action(label,fn,secondary=false){const button=document.createElement('button');button.type='button';button.textContent=label;button.addEventListener('click',fn);if(secondary){if(!options){options=document.createElement('details');options.className='equipment-options';const summary=document.createElement('summary');summary.textContent='Options';options.append(summary);$('equipmentActions').append(options);}options.append(button);}else $('equipmentActions').append(button);return button;}
 function actions(){
  $('equipmentActions').replaceChildren();options=null;wrap.classList.toggle('equipment-playing',current==='anbernic'&&anbernic.playing);
  if(current==='anbernic'){
   action(anbernic.playing?'Inspect':'Play',()=>{anbernic.playing=!anbernic.playing;actions();if(anbernic.playing){camera.position.set(0,0,3.05);controls.target.set(0,0,0);controls.update();stage.focus();}});
   action('Load ROM',()=>{const input=document.createElement('input');input.type='file';input.accept='.gb,.gbc,.gba,.nes';input.hidden=true;document.body.append(input);input.oncancel=()=>input.remove();input.onchange=async()=>{const file=input.files[0];input.remove();if(!file)return;try{await anbernic.rom.load(file);anbernic.playing=true;actions();}catch(error){$('equipmentLoading').hidden=false;$('equipmentLoading').textContent=error.message;}};input.click();},true);
   if(anbernic.rom.loaded){const b=action('Fullscreen game',()=>anbernic.rom.fullscreen());b.dataset.romFullscreen='true';const status=document.createElement('p');status.dataset.romStatus='true';$('equipmentActions').append(status);}
   action(anbernic.finish==='atomic'?'Finish: Atomic purple → Classic grey':'Finish: Classic grey → Atomic purple',()=>{anbernic.setFinish(anbernic.finish==='atomic'?'classic':'atomic');actions();},true);
   action(anbernic.power?'Power off':'Power on',()=>{anbernic.input('Power');actions();},true);
   const pad=document.createElement('div');pad.className='handheld-controls';pad.hidden=!anbernic.playing;for(const [k,label]of [['Up','↑'],['Left','←'],['Down','↓'],['Right','→'],['A','A'],['B','B'],['Start','Start']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label','Handheld '+k);b.onclick=()=>anbernic.input(k);pad.append(b);}$('equipmentActions').append(pad);
  }
  if(current==='lantern'){action(lanternOn()?'Extinguish lantern':'Light lantern',()=>{onLantern();actions();});}
  if(current==='binoculars'){action('Look through binoculars',()=>{close();onBinoculars();});}
  if(['walkman','binoculars','radio','anbernic'].includes(current)){
   action(isStowed(current)?'Take out of backpack':'Stow in backpack',()=>{stow(current,!isStowed(current));actions();},true);
  }
  if(current==='backpack'){
   const contents=document.createElement('details');contents.className='equipment-options';const label=document.createElement('summary');label.textContent='Contents';contents.append(label);$('equipmentActions').append(contents);
   for(const id of ['binoculars','walkman','radio','anbernic']){
    const row=document.createElement('div');row.className='equipment-kit-row';
    const inspect=document.createElement('button');inspect.type='button';inspect.textContent=EQUIPMENT[id].title+(isStowed(id)?' · packed':' · on the bench');inspect.onclick=()=>select(id);
    const toggle=document.createElement('button');toggle.type='button';toggle.textContent=isStowed(id)?'Take out':'Pack';toggle.onclick=()=>{stow(id,!isStowed(id));actions();};row.append(inspect,toggle);contents.append(row);
   }
  }
 }
 function select(id){if(!EQUIPMENT[id])return;gps?.hide();wrap.classList.remove('equipment-using-gps');controls.enabled=active;useButton.hidden=id!=='gps';useButton.textContent='Use';if(anbernic)anbernic.playing=false;current=id;lastStatus='';const item=EQUIPMENT[id];
  $('equipmentTitle').textContent=item.title;$('equipmentPicker').value=id;onSelect(id);
  wrap.querySelectorAll('[data-equipment]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.equipment===id)));
  const media=id==='radio'||id==='walkman';wrap.classList.toggle('equipment-has-media',media);
  if(media){document.body.classList.add('equipment-media-active');radio.openSource(id==='walkman'?'TAPE':'WORLD');}
  else{document.body.classList.remove('equipment-media-active');radio.setOpen(false);}
  actions();showModel();
 }
 function open(id='backpack'){if(!active){lastFocus=document.activeElement;active=true;wrap.hidden=false;document.body.classList.add('inspecting-equipment');controls.enabled=true;onOpen();}$('equipmentClose').focus();select(id);}
 function close(){if(!active)return;if(anbernic)anbernic.playing=false;gps?.hide();wrap.classList.remove('equipment-using-gps');active=false;controls.enabled=false;wrap.hidden=true;document.body.classList.remove('inspecting-equipment');document.body.classList.remove('equipment-media-active');radio.setOpen(false);disposeObject();onClose();lastFocus?.focus?.({preventScroll:true});}
 $('equipmentClose').onclick=close;$('equipmentPicker').onchange=e=>select(e.target.value);
 wrap.querySelectorAll('[data-equipment]').forEach(button=>button.onclick=()=>select(button.dataset.equipment));
 document.getElementById('radioClose').addEventListener('click',()=>{if(active&&['radio','walkman'].includes(current))close();});
 stage.addEventListener('keydown',e=>{
  if(gps?.using)return;
  if(current==='anbernic'&&anbernic.playing)return;
  const delta={ArrowLeft:[-.13,0],ArrowRight:[.13,0],ArrowUp:[0,-.13],ArrowDown:[0,.13]}[e.key];
  if(delta){e.preventDefault();const spherical=new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));spherical.theta+=delta[0];spherical.phi=THREE.MathUtils.clamp(spherical.phi+delta[1],.02,Math.PI-.02);camera.position.setFromSpherical(spherical).add(controls.target);controls.update();}
  if(['+','=','-'].includes(e.key)){e.preventDefault();const offset=camera.position.clone().sub(controls.target),next=THREE.MathUtils.clamp(offset.length()*(e.key==='-'?1.1:.9),controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(offset.setLength(next));controls.update();}
 });
 document.addEventListener('keydown',e=>{if(!active||(!wrap.contains(e.target)&&!mediaPanel.contains(e.target)))return;if(current==='anbernic'&&anbernic.playing){const key={ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',a:'A',z:'A',b:'B',x:'B',Enter:'Start'}[e.key];if(key&&e.target===stage){e.preventDefault();e.stopPropagation();anbernic.input(key);return;}if(key&&e.key!=='Enter'&&!e.target.closest('input,select,textarea')){e.preventDefault();anbernic.input(key);return;}}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){
  const nodes=[...wrap.querySelectorAll('button,select,input,a,[tabindex="0"]'),...(['radio','walkman'].includes(current)?mediaPanel.querySelectorAll('button,input,select,a,iframe'):[])].filter(el=>!el.disabled&&el.getClientRects().length);const first=nodes[0],last=nodes.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }});
 function render(dt){if(!active)return;if(current==='anbernic'&&anbernic.rom.loaded){const status=wrap.querySelector('[data-rom-status]');if(status)status.textContent=anbernic.rom.ready?anbernic.rom.name:anbernic.rom.error||'Loading your game…';}if(current==='anbernic'&&anbernic.rom.loaded&&!wrap.querySelector('[data-rom-fullscreen]')){const b=action('Fullscreen game',()=>anbernic.rom.fullscreen());b.dataset.romFullscreen='true';}if(['radio','walkman'].includes(current)){const r=$('equipmentMedia').getBoundingClientRect(),parent=wrap.querySelector('.equipment-details').getBoundingClientRect();mediaPanel.style.setProperty('--media-left',r.left+'px');mediaPanel.style.setProperty('--media-top',r.top+'px');mediaPanel.style.setProperty('--media-width',r.width+'px');mediaPanel.style.setProperty('--media-height',Math.max(120,parent.bottom-r.top-12)+'px');}if(!gps?.using)controls.update();else gpsView();if(current==='walkman')applyTapePose(object,getTapeState());if(current==='anbernic')anbernic.applyFinish(object);const r=stage.getBoundingClientRect(),w=window.innerWidth,h=window.innerHeight;
  camera.aspect=r.width/Math.max(1,r.height);camera.updateProjectionMatrix();gps?.align(object,camera,stage);
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

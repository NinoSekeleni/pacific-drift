import * as THREE from 'three';

const DEG=Math.PI/180;
export const ARRIVAL_DURATION=17;
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return THREE.MathUtils.clamp(t*t*t*(t*(t*6-15)+10),0,1);};
export const arrivalGlobeFov=aspect=>aspect<1?THREE.MathUtils.radToDeg(2*Math.atan(Math.tan(22*DEG)/Math.max(.2,aspect))):44;
export function sampleArrival(seconds){
 const t=THREE.MathUtils.clamp(seconds,0,ARRIVAL_DURATION),zoom=smooth(1.8,9.8,t),descent=smooth(9,ARRIVAL_DURATION,t);
 const stageIndex=t<3.6?0:t<8.2?1:t<12.5?2:3;
 const starts=[0,3.6,8.2,12.5],end=[3.6,8.2,12.5,ARRIVAL_DURATION];
 const storyFade=smooth(starts[stageIndex],starts[stageIndex]+.35,t)*(1-smooth(end[stageIndex]-.35,end[stageIndex],t));
 return {t,zoom,descent,stageIndex,storyFade,globeOpacity:1-smooth(8.4,10.8,t),
  height:Math.max(0,Math.exp(Math.log(1801)*(1-descent))-1),
  audio:smooth(9.5,16.6,t),blend:smooth(11.7,ARRIVAL_DURATION,t),done:seconds>=ARRIVAL_DURATION,
  stage:['Earth','South Pacific','Open ocean','Your boat'][stageIndex]};
}
export function arrivalStory({returning=false,estimated=false}={}){
 if(estimated)return ['Your chart holds an estimate. The ocean holds the rest.','A boat, a backpack and a radio. Your bearings are yours to keep.','Watch the sky. Listen to the water. Somewhere beyond it lies a shore.','Take the oars, raise the sail, and find your way to land.'];
 if(returning)return ['While you were away, the ocean kept moving.','Your boat is still out here. Your course is yours to choose.','Check your bearings. Listen to the radio. Watch the weather.','Take the oars, raise the sail, and continue toward land.'];
 return ['Point Nemo. Farther from land than anywhere else on Earth.','A wooden boat. A backpack. A radio. Everything you have is here.','Beyond the swell, somewhere, there is a shore.','Keep your bearings. Read the sky. Find your way to land.'];
}
export function globeDirection(lat,lng,out=new THREE.Vector3()){
 return out.set(Math.cos(lat*DEG)*Math.cos(lng*DEG),Math.sin(lat*DEG),-Math.cos(lat*DEG)*Math.sin(lng*DEG));
}
export function arrivalLocation(voyage){
 const estimated=!!(voyage.nav&&Number.isFinite(voyage.est?.lat)&&Number.isFinite(voyage.est?.lng));
 const p=estimated?voyage.est:voyage;
 return {lat:p.lat,lng:p.lng,estimated,title:estimated?'Estimated position':Math.abs(p.lat+48.8767)<.03&&Math.abs(p.lng+123.3933)<.03?'Point Nemo':'Your position'};
}
export function formatArrivalCoordinates(lat,lng){
 const part=(v,a,b)=>`${Math.abs(v).toFixed(2)}° ${v<0?a:b}`;
 return `${part(lat,'S','N')} · ${part(lng,'W','E')}`;
}

function earthTexture(land,isTouch){
 const canvas=document.createElement('canvas'),W=isTouch?2048:4096,H=W/2;canvas.width=W;canvas.height=H;
 const ctx=canvas.getContext('2d');
 const ocean=ctx.createLinearGradient(0,0,0,H);ocean.addColorStop(0,'#102f42');ocean.addColorStop(.45,'#20576b');ocean.addColorStop(1,'#102c41');ctx.fillStyle=ocean;ctx.fillRect(0,0,W,H);
 const landFill=ctx.createLinearGradient(0,0,0,H);landFill.addColorStop(0,'#bec9c5');landFill.addColorStop(.3,'#8e9b86');landFill.addColorStop(.55,'#7b9686');landFill.addColorStop(.77,'#a3aa94');landFill.addColorStop(1,'#d4dcda');
 for(const p of land.polys){
  for(const shift of [-360,0,360]){
   if(p.bbox[2]+shift< -180||p.bbox[0]+shift>180)continue;
   ctx.beginPath();
   for(let i=0;i<p.pts.length;i+=2){const x=(p.pts[i]+shift+180)/360*W,y=(90-p.pts[i+1])/180*H;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
   ctx.closePath();ctx.fillStyle=p.kind==='ice'?'#cbd5d4':landFill;ctx.fill();
   ctx.strokeStyle='rgba(206,223,211,.40)';ctx.lineWidth=.8;ctx.stroke();
  }
 }
 // Quiet geographic grid; this overview uses real coastlines, not satellite tiles.
 ctx.strokeStyle='rgba(189,219,224,.12)';ctx.lineWidth=1;
 for(let lon=-180;lon<=180;lon+=30){const x=(lon+180)/360*W;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
 for(let lat=-60;lat<=60;lat+=30){const y=(90-lat)/180*H;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.NoColorSpace;texture.anisotropy=4;return texture;
}

export function createWorldArrival({renderer,land,isTouch=false,base='./'}){
 let active=false,elapsed=0,location=null,complete=null,resources=null,holdFrame=null;
 let story=arrivalStory();
 const earthImages={colour:null,clouds:null};
 const imageTexture=image=>{const texture=new THREE.Texture(image);texture.colorSpace=THREE.NoColorSpace;texture.wrapS=THREE.RepeatWrapping;texture.anisotropy=4;texture.needsUpdate=true;return texture;};
 for(const [kind,file]of [['colour','terra-colour-2k.webp'],['clouds','terra-clouds-2k.webp']]){
  new THREE.TextureLoader().load(base+'textures/earth/'+file,loaded=>{
   earthImages[kind]=loaded.image;loaded.dispose();
   if(!resources)return;
   if(kind==='colour'){resources.texture.dispose();resources.texture=imageTexture(earthImages.colour);resources.planetMaterial.uniforms.tEarth.value=resources.texture;}
   else{resources.cloudTexture.dispose();resources.cloudTexture=imageTexture(earthImages.clouds);resources.cloudMat.uniforms.tCloud.value=resources.cloudTexture;resources.cloudMat.uniforms.uReady.value=1;}
  },undefined,()=>console.warn('Earth '+kind+' image unavailable; geographic fallback retained'));
 }
 const overlay=document.createElement('section');overlay.className='world-arrival';overlay.hidden=true;overlay.setAttribute('aria-label','Arrival from Earth to your boat');
 overlay.innerHTML=`<div class="arrival-top"><span>PACIFIC DRIFT</span><button type="button" class="arrival-skip">Skip to boat <span aria-hidden="true">↘</span></button></div><div class="arrival-chapter"><span class="arrival-step">01 / 04</span><span class="arrival-stage">Earth</span></div><div class="arrival-places" aria-hidden="true"></div><div class="arrival-pin" aria-hidden="true"><i></i><span></span></div><div class="arrival-copy"><p class="arrival-region">SOUTH PACIFIC OCEAN</p><h1></h1><p class="arrival-coordinates"></p><p class="arrival-context arrival-story" role="status" aria-live="polite"></p><div class="arrival-progress"><i></i></div><p class="arrival-height"></p></div>`;
 document.body.appendChild(overlay);
 const $=s=>overlay.querySelector(s),pin=$('.arrival-pin'),places=$('.arrival-places');
 const labels=[['South America',-24,-63],['New Zealand',-42,173],['Antarctica',-72,-92],['Pacific Ocean',-10,-137]];
 for(const [name]of labels){const span=document.createElement('span');span.textContent=name;places.appendChild(span);}
 const button=$('.arrival-skip');button.onclick=()=>finish();
 function onKey(e){if(active&&['Escape','Enter','Space'].includes(e.code)){e.preventDefault();e.stopImmediatePropagation();finish();}}
 // Capture ensures skip keys do not also pause or activate a gameplay action.
 window.addEventListener('keydown',onKey,true);

 function build(){
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(44,window.innerWidth/window.innerHeight,.00008,100);
  const texture=earthImages.colour?imageTexture(earthImages.colour):earthTexture(land,isTouch),sphere=new THREE.SphereGeometry(1,96,64);
  const planetMaterial=new THREE.ShaderMaterial({uniforms:{tEarth:{value:texture},uLight:{value:new THREE.Vector3()}},vertexShader:`varying vec2 vUv;varying vec3 vNormal;void main(){vUv=uv;vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`uniform sampler2D tEarth;uniform vec3 uLight;varying vec2 vUv;varying vec3 vNormal;void main(){float sun=dot(normalize(vNormal),uLight);vec3 c=texture2D(tEarth,vUv).rgb;float light=.38+.62*smoothstep(-.25,.75,sun);gl_FragColor=vec4(c*light,1.);}`});
  scene.add(new THREE.Mesh(sphere,planetMaterial));
  const cloudTexture=earthImages.clouds?imageTexture(earthImages.clouds):new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1,THREE.RGBAFormat);cloudTexture.needsUpdate=true;
  const cloudMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{tCloud:{value:cloudTexture},uReady:{value:earthImages.clouds?1:0},uTime:{value:0},uLight:planetMaterial.uniforms.uLight},vertexShader:'varying vec2 vUv;varying vec3 vNormal;void main(){vUv=uv;vNormal=normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D tCloud;uniform float uReady,uTime;uniform vec3 uLight;varying vec2 vUv;varying vec3 vNormal;void main(){float c=texture2D(tCloud,vec2(fract(vUv.x+uTime*.0003),vUv.y)).r;float lit=.45+.55*max(0.,dot(normalize(vNormal),uLight));gl_FragColor=vec4(vec3(.90,.95,.98)*lit,smoothstep(.16,.85,c)*.66*uReady);}'});
  const cloudShell=new THREE.Mesh(sphere,cloudMat);cloudShell.scale.setScalar(1.006);scene.add(cloudShell);
  const airMat=new THREE.ShaderMaterial({side:THREE.BackSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
   vertexShader:`varying vec3 vN,vP;void main(){vN=normalize(normalMatrix*normal);vec4 p=modelViewMatrix*vec4(position,1.);vP=p.xyz;gl_Position=projectionMatrix*p;}`,
   fragmentShader:`varying vec3 vN,vP;void main(){float rim=pow(1.-abs(dot(normalize(vN),normalize(-vP))),3.5);gl_FragColor=vec4(vec3(.12,.38,.62),rim*.34);}`});
  const atmosphere=new THREE.Mesh(sphere,airMat);atmosphere.scale.setScalar(1.025);scene.add(atmosphere);
  const stars=new Float32Array(650*3);let seed=52913;const rand=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  for(let i=0;i<stars.length;i+=3){const y=rand()*2-1,a=rand()*Math.PI*2,r=Math.sqrt(1-y*y);stars.set([Math.cos(a)*r*30,y*30,Math.sin(a)*r*30],i);}
  const starGeo=new THREE.BufferGeometry();starGeo.setAttribute('position',new THREE.BufferAttribute(stars,3));
  const starMat=new THREE.PointsMaterial({size:isTouch?1:1.3,sizeAttenuation:false,color:0xbccbd1,transparent:true,opacity:.55});scene.add(new THREE.Points(starGeo,starMat));
  const size=renderer.getDrawingBufferSize(new THREE.Vector2()),scale=Math.min(1,(isTouch?900:1600)/size.x);
  const target=new THREE.WebGLRenderTarget(Math.round(size.x*scale),Math.round(size.y*scale),{depthBuffer:true});
  const screen=new THREE.Scene(),screenCamera=new THREE.Camera(),screenMat=new THREE.ShaderMaterial({transparent:true,depthTest:false,depthWrite:false,uniforms:{tFrame:{value:target.texture},uAlpha:{value:1}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:'varying vec2 vUv;uniform sampler2D tFrame;uniform float uAlpha;void main(){gl_FragColor=vec4(texture2D(tFrame,vUv).rgb,uAlpha);}'});
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),screenMat);screen.add(quad);
  return {scene,camera,planetMaterial,texture,sphere,airMat,atmosphere,cloudTexture,cloudMat,starGeo,starMat,target,screen,screenCamera,screenMat,quad};
 }
 function release(){if(!resources)return;const r=resources;r.texture.dispose();r.sphere.dispose();r.planetMaterial.dispose();r.airMat.dispose();r.cloudTexture.dispose();r.cloudMat.dispose();r.starGeo.dispose();r.starMat.dispose();r.target.dispose();r.screenMat.dispose();r.quad.geometry.dispose();resources=null;}
 function finish(){if(!active)return;active=false;if(overlay.contains(document.activeElement))document.activeElement.blur();overlay.hidden=true;document.body.classList.remove('arriving');release();const callback=complete;complete=null;callback?.();}
 function start(voyage,onComplete,{at=null,returning=false}={}){
  if(active)finish();location=arrivalLocation(voyage);elapsed=0;holdFrame=Number.isFinite(at)?THREE.MathUtils.clamp(at,0,ARRIVAL_DURATION-.01):null;complete=onComplete;
  try{resources=build();}catch(error){release();console.warn('World arrival unavailable; entering boat',error);complete=null;onComplete?.();return;}
  active=true;overlay.hidden=false;document.body.classList.add('arriving');story=arrivalStory({returning,estimated:location.estimated});
  $('h1').textContent=location.title;$('.arrival-coordinates').textContent=formatArrivalCoordinates(location.lat,location.lng);
  $('.arrival-region').textContent=location.lat<5&&location.lng>=-180&&location.lng< -67?'SOUTH PACIFIC OCEAN':'OPEN OCEAN';
  $('.arrival-context').textContent=story[0];
  pin.querySelector('span').textContent=location.title;
  button.focus({preventScroll:true});update(0);
 }
 function update(dt){
  if(!active)return;
  // Hidden tabs do not skip the whole arrival on resuming.
  elapsed=holdFrame??elapsed+Math.min(.1,Math.max(0,dt));
  const state=sampleArrival(elapsed);if(state.done){finish();return;}
  overlay.style.opacity=String(1-smooth(16.1,ARRIVAL_DURATION,elapsed));
  const r=resources,pan=smooth(0,6.2,elapsed),startLat=THREE.MathUtils.clamp(location.lat+34,-35,35),startLng=location.lng+27;
  r.cloudMat.uniforms.uTime.value=elapsed;
  const storyElement=$('.arrival-context');if(storyElement.textContent!==story[state.stageIndex])storyElement.textContent=story[state.stageIndex];storyElement.style.opacity=String(state.storyFade);
  overlay.classList.toggle('arrival-near',state.stageIndex>=2);
  const lat=THREE.MathUtils.lerp(startLat,location.lat,pan),lng=THREE.MathUtils.lerp(startLng,location.lng,pan);
  const radius=1+Math.exp(THREE.MathUtils.lerp(Math.log(2.6),Math.log(.0004),state.zoom));
  r.cloudMat.uniforms.uReady.value=earthImages.clouds?1-smooth(.18,.55,state.zoom):0;
  const radial=globeDirection(lat,lng);r.camera.position.copy(radial).multiplyScalar(radius);r.camera.up.set(0,1,0);r.camera.lookAt(0,0,0);r.camera.aspect=window.innerWidth/window.innerHeight;r.camera.fov=arrivalGlobeFov(r.camera.aspect);r.camera.updateProjectionMatrix();r.camera.updateMatrixWorld();
  // Cartographic key light keeps the destination readable at every time of day.
  r.planetMaterial.uniforms.uLight.value.copy(radial).add(new THREE.Vector3(-.4,.6,.3)).normalize();
  r.atmosphere.visible=radius>1.08;r.screenMat.uniforms.uAlpha.value=state.globeOpacity;
  const point=globeDirection(location.lat,location.lng).multiplyScalar(1.002).project(r.camera),visible=state.globeOpacity>.05&&Math.abs(point.x)<.94&&Math.abs(point.y)<.90;
  pin.hidden=!visible;pin.style.left=(point.x*.5+.5)*100+'%';pin.style.top=(-point.y*.5+.5)*100+'%';pin.style.opacity=String(state.globeOpacity);
  labels.forEach(([,la,lo],i)=>{const d=globeDirection(la,lo),p=d.clone().multiplyScalar(1.005).project(r.camera),el=places.children[i];el.hidden=state.zoom>.48||d.dot(radial)<.28||Math.abs(p.x)>1||Math.abs(p.y)>1;el.style.left=(p.x*.5+.5)*100+'%';el.style.top=(-p.y*.5+.5)*100+'%';});
  const stage=state.stage==='South Pacific'&&(location.lat>5||location.lng> -67||location.lng< -180)?'Your ocean':state.stage;
  $('.arrival-stage').textContent=stage;$('.arrival-step').textContent='0'+(state.stageIndex+1)+' / 04';
  $('.arrival-progress i').style.transform=`scaleX(${elapsed/ARRIVAL_DURATION})`;
  const metres=THREE.MathUtils.lerp(state.height,(radius-1)*6371000,state.globeOpacity);
  $('.arrival-height').textContent=elapsed<2.2?'EARTH → OCEAN → BOAT':elapsed>10.8?'Take the oars. Find your horizon.':(metres>=1000?Math.round(metres/1000).toLocaleString()+' km':Math.max(1,Math.round(metres))+' m')+' above the water';
 }
 const endPosition=new THREE.Vector3(),endQuaternion=new THREE.Quaternion(),aim=new THREE.Vector3(),offset=new THREE.Vector3(),lookCamera=new THREE.PerspectiveCamera();
 function applyCamera(camera,boatPosition,heading){
  if(!active)return;const state=sampleArrival(elapsed);endPosition.copy(camera.position);endQuaternion.copy(camera.quaternion);
  const ratio=state.height/1800;
  offset.set(ratio*75,state.height,ratio*130).applyAxisAngle(new THREE.Vector3(0,1,0),-heading*DEG);
  camera.position.copy(endPosition).add(offset);aim.copy(boatPosition).lerp(endPosition,state.blend);aim.y+=.4*(1-state.blend);
  lookCamera.position.copy(camera.position);lookCamera.lookAt(aim);camera.quaternion.slerpQuaternions(lookCamera.quaternion,endQuaternion,state.blend);
 }
 function render(){
  if(!active||!resources)return;const r=resources,alpha=sampleArrival(elapsed).globeOpacity;if(alpha<.001)return;
  const previous=renderer.getRenderTarget(),clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
  try{renderer.setRenderTarget(r.target);renderer.setClearColor(0x02070e,1);renderer.clear();renderer.render(r.scene,r.camera);renderer.setRenderTarget(previous);renderer.render(r.screen,r.screenCamera);}
  finally{renderer.setRenderTarget(previous);renderer.setClearColor(clearColor,clearAlpha);}
 }
 function resize(){if(!resources)return;const size=renderer.getDrawingBufferSize(new THREE.Vector2()),scale=Math.min(1,(isTouch?900:1600)/size.x);resources.target.setSize(Math.round(size.x*scale),Math.round(size.y*scale));}
 return {start,finish,update,applyCamera,render,resize,get active(){return active;},get state(){return sampleArrival(elapsed);},dispose(){finish();overlay.remove();window.removeEventListener('keydown',onKey,true);}};
}

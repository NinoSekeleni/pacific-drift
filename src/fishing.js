// Onboard fishing: Tidewater's rod and line-tension fight, Pacific Drift's regional catalogue,
// a guaranteed bite on a valid cast (never a guaranteed catch) and the catch journal.
import * as T from 'three';
import {FishingRod} from './vendor/tidewater/FishingRod.js';
import {CatchMinigame} from './vendor/tidewater/CatchMinigame.js';
import {FISH,chooseFish,pickWeighted,rollFish,oceanTemperature,rigAdvice,RIGS} from './fishing-ecology.js';
import {createBiteTimer,BITE} from './bite-timer.js';
import {createFishJournal} from './fish-journal.js';
import {createFishMesh} from './fish-skin.js';import {createCatchViewer} from './catch-viewer.js';
import {LAYER_NEAR} from './sky.js';

export function createFishing({scene,camera,canoe,ocean,spray,base='./',toast=()=>{},audio,onEquip=()=>{},onInspect=()=>{},register=()=>{},storageKey='pacific-drift-fishing-v1',getBoat=()=>'rowboat',canFish=()=>({ok:true}),onCatchDialog=()=>{}}={}){
 let context={},time=0,playing=false,pending=null,fight=null,held=false,catchModel=null,lastHint='',lastOrigin=null,strikeLeft=0,castHabitat=null,castRig=2,activeNow=false;const water={};
 const bite=createBiteTimer();
 const query={cpuValid:true,cpu:new Float32Array(4),allocate:()=>0,setPoint(slot,x,z){ocean.sample(x,z,time,water);this.cpu[0]=water.h;this.cpu[3]=water.h-(context.depth??3000);}};
 const clips=new Map(),loops=new Map();
 function sound(name,loop=false){if(audio.muted)return null;const pool=loop?loops:clips;let a=pool.get(name);if(!a){a=new Audio(base+'audio/fishing/'+name+'.ogg');a.loop=loop;a.preload='none';pool.set(name,a);}if(!loop)a.currentTime=0;a.volume=loop?.11:.2;if(!loop||a.paused)a.play().catch(()=>{});return a;}
 const rod=new FishingRod({scene,camera,query,terrain:{heightAt:()=>-1000},audio:{whoosh:()=>sound('rod_swish'),lineOut:()=>sound('line_out'),bail:()=>sound('bail_click'),plop(p){sound('plop');ocean.addRipple(p.x,p.z,time,.035);},rodLoop(crank,drag){for(const [name,amount]of [['reel_wind',crank],['reel_drag',drag]]){if(amount>.05&&!audio.muted){const a=sound(name,true);if(a)a.volume=Math.min(.2,amount*.08);}else loops.get(name)?.pause();}}}});
 [rod.rodMesh,rod.bobberMesh,rod.lineMesh].forEach(o=>o.layers.set(LAYER_NEAR));
 const stowed=rod.rodMesh.clone();stowed.material=rod.rodMat.clone();stowed.material.onBeforeCompile=()=>{};stowed.material.vertexColors=true;stowed.matrixAutoUpdate=true;stowed.visible=true;stowed.position.set(.67,.43,.8);stowed.rotation.set(-Math.PI/2,0,-.025);canoe.group.add(stowed);register('rod',stowed.clone());

 // The fishing controls live in the bottom mode bar while the rod is in hand.
 const bar=document.createElement('section');bar.className='fishing-controls mode-panel';bar.hidden=true;bar.setAttribute('aria-label','Fishing');
 bar.innerHTML=`<p class="fishing-hint" role="status" aria-live="polite"></p><div class="fishing-row"><button type="button" data-fish="action" class="fishing-action">Hold to cast</button><label class="fishing-rig">Rig<select aria-label="Fishing rig">${RIGS.map(r=>`<option value="${r.depth}">${r.label}</option>`).join('')}</select></label></div><meter min="0" max="1" low=".3" high=".85" optimum=".55" value="0" aria-label="Line tension" hidden></meter><p class="fishing-fight"></p><div class="fishing-row secondary"><button type="button" data-fish="retrieve">Reel in</button><button type="button" data-fish="journal">Journal</button><button type="button" data-fish="inspect">Rod</button><button type="button" data-fish="toggle">Put rod away</button></div>`;
 document.body.append(bar);
 const action=bar.querySelector('[data-fish=action]'),select=bar.querySelector('select'),meter=bar.querySelector('meter');
 const journal=createFishJournal({base,storageKey,FISH});

 function clearCatch(){if(catchModel){scene.remove(catchModel);catchModel.material.dispose();catchModel=null;}}let thrash=0;
 function resetLine(){held=false;fight=null;strikeLeft=0;pending=null;castHabitat=null;bite.cancel();rod.dip=0;clearCatch();}
 function equip(value){
  if(value){const allowed=canFish();if(!allowed.ok){toast(allowed.reason||'You cannot fish from here.');return false;}}
  document.body.classList.toggle('fishing-active',value);resetLine();rod.equip(value);stowed.visible=!value;bar.hidden=!value;
  for(const a of loops.values())a.pause();onEquip(value);return true;
 }
 function currentContext(){return{...context,temperature:context.temperature??oceanTemperature(context.lat),lureDepth:Number(select.value)};}
 function advice(){return rigAdvice(currentContext());}
 function actionDown(){
  if(!rod.equipped)return;
  if(rod.state==='idle'){
   const a=advice();
   if(!a.ok){status(a.reason,true);return;}
   rod.startWindup();
  }else if(rod.state==='floating'&&strikeLeft>0&&pending){
   rod.hook();fight=new CatchMinigame({species:pending.id,kg:pending.kg,lineKg:8,reelSpeed:1.6,distance:Math.max(5,rod.lineOut)});strikeLeft=0;
   sound('fish_splash');ocean.addRipple(rod.bobber.x,rod.bobber.z,time,.045);spray?.emit(rod.bobber.x,rod.waterY+.02,rod.bobber.z,0,.8,0,8,.15);
   catchModel=createFishMesh(pending.id);catchModel.layers.set(LAYER_NEAR);catchModel.visible=false;scene.add(catchModel);
  }else if(rod.state==='floating'){status('Nothing has taken the bait yet. Watch the float.');}
  else if(rod.state==='fighting')held=true;
 }
 function actionUp(){held=false;if(rod.state==='windup')rod.release();}
 function retrieve(){if(rod.state==='fighting'){fight=null;clearCatch();rod.endFight();}rod.retrieve();resetLine();}
 action.onpointerdown=e=>{e.preventDefault();action.setPointerCapture(e.pointerId);actionDown();};action.onpointerup=actionUp;action.onpointercancel=actionUp;
 action.onkeydown=e=>{if(['Space','Enter'].includes(e.code)&&!e.repeat){e.preventDefault();e.stopPropagation();actionDown();}};action.onkeyup=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();actionUp();}};
 bar.querySelector('[data-fish=toggle]').onclick=()=>equip(false);
 bar.querySelector('[data-fish=retrieve]').onclick=retrieve;
 bar.querySelector('[data-fish=inspect]').onclick=()=>{equip(false);onInspect('rod');};
 bar.querySelector('[data-fish=journal]').onclick=()=>journal.open();
 select.onchange=()=>{if(rod.lineInWater){rod.retrieve();resetLine();}const a=advice();status(a.ok?`${rigLabel()} rig ready. Hold to cast.`:a.reason,!a.ok);};

 // A cast is valid only if the float settles in fishable open water clear of the hull.
 const local=new T.Vector3();
 rod.onLand=where=>{
  if(where!=='water'){resetLine();return;}
  local.copy(rod.bobber);canoe.group.worldToLocal(local);
  const halfLength=(canoe.waterOutline?.halfLength??2.4)+.25,halfBeam=getBoat()==='launch'?1.45:.95;
  if(Math.abs(local.z)<halfLength&&Math.abs(local.x)<halfBeam){rod.retrieve();resetLine();status('The float came down against the hull. Cast out over open water.',true);return;}
  const a=advice();
  if(!a.ok){rod.retrieve();resetLine();status(a.reason,true);return;}
  castHabitat=a.weights;castRig=a.rig;bite.start(context.baitNear?.45:1);if(context.baitNear)status('Birds are working the water close by. Fish are feeding here.');
 };

 const catchPanel=document.createElement('dialog');catchPanel.className='fishing-catch';catchPanel.setAttribute('aria-labelledby','catchTitle');
 catchPanel.innerHTML='<figure class="catch-figure"><img alt="" width="480" height="320" decoding="async" hidden><figcaption class="catch-turn">Drag to turn the fish over.</figcaption></figure><h2 id="catchTitle"></h2><p class="catch-sci"></p><p class="catch-size"></p><p class="catch-note"></p><div class="catch-actions"><button type="button" data-release>Record &amp; release</button><button type="button" data-keep>Keep catch</button></div>';
 document.body.append(catchPanel);let landing=null;const viewer=createCatchViewer(catchPanel.querySelector('figure'),{fallback:catchPanel.querySelector('img')});
 function finishCatch(kept){
  if(landing){const entry=journal.record({...landing,kept,lat:context.lat,lng:context.lng,rig:castRig,boat:getBoat()});toast(entry.firstOfSpecies?`First ${FISH[landing.id].name} in your journal.`:kept?'Catch kept and recorded in your journal.':'Catch recorded and released.');}
  landing=null;resetLine();rod.setState('idle');viewer.hide();if(catchPanel.open)catchPanel.close();onCatchDialog(false);
 }
 catchPanel.querySelector('[data-release]').onclick=()=>finishCatch(false);catchPanel.querySelector('[data-keep]').onclick=()=>finishCatch(true);
 catchPanel.addEventListener('cancel',e=>{e.preventDefault();finishCatch(false);});
 function showCatch(){
  const f=FISH[landing.id],stats=journal.stats(landing.id);
  catchPanel.querySelector('h2').textContent=f.name;catchPanel.querySelector('.catch-sci').textContent=f.sci;
  catchPanel.querySelector('.catch-size').textContent=`${landing.kg.toFixed(2)} kg · about ${Math.round(landing.cm)} cm (estimated)`;
  catchPanel.querySelector('.catch-note').textContent=!stats.count?'A new species for your journal.':landing.kg>stats.maxKg?`Your heaviest ${f.name} so far.`:`You have recorded ${stats.count} before.`;
  const img=catchPanel.querySelector('img');img.src=journal.imageFor(landing.id,'full');img.alt=`Illustration of a ${f.name}`;const live=viewer.show(landing.id,landing);catchPanel.querySelector('.catch-turn').hidden=!live;
  catchPanel.showModal();onCatchDialog(true);
 }
 function status(text,warn=false){if(text!==lastHint){lastHint=text;const el=bar.querySelector('.fishing-hint');el.textContent=text;el.classList.toggle('warn',warn);}}
 function rigLabel(){return select.selectedOptions[0]?.textContent||'';}

 return{
  equip,retrieve,actionDown,actionUp,journal,
  showJournal:()=>journal.open(),
  get active(){return rod.equipped;},get busy(){return rod.lineInWater||rod.state==='windup';},get stowed(){return stowed;},get state(){return rod.state;},
  get bite(){return{armed:bite.armed,waited:bite.waited,due:bite.due,strikeLeft,limit:BITE.maxWait};},
  get catchOpen(){return catchPanel.open;},
  setRig(depth){select.value=String(depth);select.onchange();},
  showCatchFor(id='opah'){landing={...rollFish(id)};showCatch();},
  previewCatch(id='pomfret'){equip(true);pending=rollFish(id);rod.bobber.copy(camera.position).add(new T.Vector3(0,-1,-6));rod.lineOut=6;rod.setState('floating');strikeLeft=30;castHabitat={[id]:1};},
  update(dt,t,options={}){
   time=t;context=options.context||{};
   if(lastOrigin&&context.origin!==lastOrigin&&rod.equipped&&(rod.lineInWater||rod.state==='windup')){rod.setState('idle');resetLine();status('The boat moved on while you were away, so the line came in.',true);}lastOrigin=context.origin;playing=options.playing;
   if(playing&&context.motor&&Math.abs(context.speed)>.08&&!audio.muted){const a=sound('boat_engine',true);if(a){a.volume=Math.min(.14,.03+Math.abs(context.speed)*.02);a.playbackRate=.65+Math.min(1,Math.abs(context.speed)/4.5)*.55;}}else loops.get('boat_engine')?.pause();
   bar.hidden=!rod.equipped||!options.visible||options.blocked;
   // Bite time counts only while someone is actually fishing.
   activeNow=!!(playing&&!options.blocked&&!options.hidden&&!catchPanel.open);
   if(!playing||options.blocked){held=false;for(const a of loops.values())a.pause();rod.rodMesh.visible=false;rod.bobberMesh.visible=false;rod.lineMesh.visible=false;if(catchModel)catchModel.visible=false;return;}
   if(audio.muted)for(const a of [...clips.values(),...loops.values()])a.pause();
   if(rod.state==='floating'&&!fight){
    if(strikeLeft>0){
     if(activeNow)strikeLeft-=Math.min(dt,BITE.maxStep);rod.dip=.6+.4*Math.sin(t*15);
     if(strikeLeft<=0){strikeLeft=0;pending=null;rod.dip=0;bite.missed();status('The fish let go. Another will come soon.');}
    }else if(castHabitat&&bite.tick(dt,activeNow)){
     // The species comes from the water the float landed in, so a due bite cannot fail.
     const id=chooseFish({...currentContext(),lureDepth:castRig})??pickWeighted(castHabitat);
     pending=rollFish(id);strikeLeft=BITE.strikeWindow;sound('plop');navigator.vibrate?.(60);
    }
   }
   if(fight){
    if(fight.surge>.85&&Math.random()<dt*.8){ocean.addRipple(rod.bobber.x,rod.bobber.z,time,.045);spray?.emit(rod.bobber.x,rod.waterY+.02,rod.bobber.z,0,.7,0,5,.12);}
    const result=fight.update(Math.min(.05,dt),held);
    if(result==='caught'){landing={...pending};rod.land();fight=null;sound('fish_splash');}
    else if(result!=='fighting'){status(result==='snapped'?'The line snapped. Cast again when you are ready.':'The fish escaped. Cast again when you are ready.',true);toast(result==='snapped'?'The line snapped.':'The fish escaped.');if(result==='snapped')sound('line_snap');fight=null;pending=null;rod.endFight();clearCatch();bite.cancel();}
   }
   for(let left=Math.min(.1,dt);left>1e-6;){const step=Math.min(left,1/120);rod.update(step,{visible:true,fight});left-=step;}
   stowed.visible=!rod.equipped;
   if(catchModel){catchModel.visible=rod.state==='landing';catchModel.position.copy(rod.bobber);catchModel.rotation.set(0,t*.4,Math.PI/2);const length=T.MathUtils.clamp((landing??pending)?.cm/100||.4,.1,1.8);catchModel.userData.setLength(length);thrash+=dt*(9+Math.sin(t*1.7)*3);catchModel.userData.pose({swimPhase:thrash,swim:.05+.03*Math.sin(t*2.3),jaw:.12+.1*Math.max(0,Math.sin(t*3.1)),curl:Math.sin(t*2.7)*.6,wet:1});}
   if(landing&&rod.state==='landing'&&rod.t>.7&&!catchPanel.open)showCatch();
   const state=rod.state,striking=state==='floating'&&strikeLeft>0;
   action.textContent=state==='windup'?`Release to cast · ${Math.round(rod.power*100)}%`:state==='floating'?(striking?'Strike!':'Waiting for a bite'):state==='fighting'?'Hold to reel · release to ease':state==='idle'?'Hold to cast':'Reeling…';
   action.classList.toggle('strike',striking);bar.classList.toggle('strike',striking);
   action.disabled=['flying','flick','retrieving','landing'].includes(state);select.disabled=state!=='idle';
   meter.hidden=!fight;if(fight)meter.value=Math.min(1,fight.tension);bar.querySelector('.fishing-fight').textContent=fight?`${fight.distance.toFixed(0)} m of line · tension ${Math.round(fight.tension*100)}%`:'';
   if(state==='floating')status(striking?'The float is diving. Strike now!':'Let the float drift. A fish will find it.');
   else if(state==='idle'){const a=advice();status(a.ok?`${rigLabel()}. Aim over the water, hold to cast, then release.`:a.reason,!a.ok);}
   else if(state==='fighting')status(fight?.surge>.5?'The fish is running. Ease off the reel.':'Keep steady pressure. Release to ease the line.');
   else if(state==='windup')status('Release when you are ready.');
  },
  reposition(motor){stowed.position.set(motor?.8:.67,motor?.44:.43,motor?2.2:.8);stowed.rotation.set(-Math.PI/2,0,-.025);},
  dispose(){equip(false);bar.remove();journal.dispose();catchPanel.remove();scene.remove(rod.rodMesh,rod.bobberMesh,rod.lineMesh);canoe.group.remove(stowed);}
 };
}

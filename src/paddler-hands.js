// First-person sailing gloves and sleeves. Grip centres follow the actual paddle
// transform without animation lag; a compact two-bone solve supplies the elbows.
import * as THREE from 'three';
import {LAYER_NEAR} from './sky.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
const UP=new THREE.Vector3(0,1,0);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const finiteVector=v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);

/** Solve an arm in the canoe's local frame. Invalid/extreme poses are bounded. */
export function solvePaddlerArm(shoulder,wrist,pole,upperLength=.35,foreLength=.34){
  const direction=new THREE.Vector3().subVectors(wrist,shoulder);
  const distance=direction.length();
  if(distance<1e-7)direction.set(0,-1,0);else direction.multiplyScalar(1/distance);
  const reach=clamp(distance,Math.abs(upperLength-foreLength)+1e-5,upperLength+foreLength-1e-5);
  const target=shoulder.clone().addScaledVector(direction,reach);
  const along=(upperLength*upperLength-foreLength*foreLength+reach*reach)/(2*reach);
  const height=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
  const bend=new THREE.Vector3().subVectors(pole,shoulder).addScaledVector(direction,-new THREE.Vector3().subVectors(pole,shoulder).dot(direction));
  if(bend.lengthSq()<1e-7){bend.set(0,-1,0).addScaledVector(direction,direction.y);if(bend.lengthSq()<1e-7)bend.set(1,0,0);}
  bend.normalize();
  const elbow=shoulder.clone().addScaledVector(direction,along).addScaledVector(bend,height);
  return {shoulder:shoulder.clone(),elbow,wrist:target,reachable:Math.abs(distance-reach)<.0001,reachError:Math.abs(distance-reach)};
}
/** Keep first-person sleeve geometry out of the eye's near field. */
export function visiblePaddlerForearm(elbow,wrist,eye,out=new THREE.Vector3(),safeRadius=.20){
  const direction=new THREE.Vector3().subVectors(elbow,wrist),length=direction.length();
  if(length<1e-6||wrist.distanceToSquared(eye)<safeRadius*safeRadius)return false;
  let limit=1; // preserve the full bone whenever it is safely outside the eye
  const relative=new THREE.Vector3().subVectors(wrist,eye),a=direction.lengthSq(),b=2*relative.dot(direction),c=relative.lengthSq()-safeRadius*safeRadius;
  const disc=b*b-4*a*c;
  if(disc>=0){const entry=(-b-Math.sqrt(disc))/(2*a);if(entry>=0)limit=Math.min(limit,Math.max(0,entry-.005));}
  // Upper sleeves and the body belong behind the view. Stop the visible sleeve
  // before it can cross the head plane, even when an elbow folds toward the face.
  const headPlane=eye.z-.10;
  if(wrist.z>=headPlane)return false;
  if(direction.z>0)limit=Math.min(limit,(headPlane-wrist.z)/direction.z);
  if(limit*length<.025)return false;
  out.copy(wrist).addScaledVector(direction,limit);return true;
}
function roundedRectangle(width,height,radius){
  const s=new THREE.Shape(),x=-width/2,y=-height/2,r=radius;
  s.moveTo(x+r,y);s.lineTo(x+width-r,y);s.quadraticCurveTo(x+width,y,x+width,y+r);
  s.lineTo(x+width,y+height-r);s.quadraticCurveTo(x+width,y+height,x+width-r,y+height);
  s.lineTo(x+r,y+height);s.quadraticCurveTo(x,y+height,x,y+height-r);
  s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
function pad(width,height,depth,radius,material){
  const geometry=new THREE.ExtrudeGeometry(roundedRectangle(width,height,radius),{depth,steps:1,bevelEnabled:true,bevelSize:.002,bevelThickness:.002,bevelSegments:1,curveSegments:3});
  return new THREE.Mesh(geometry,material);
}
function phalanx(a,b,radius,material){
  const direction=new THREE.Vector3().subVectors(b,a),length=direction.length();
  const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(radius,Math.max(.001,length-radius*2),3,7),material);
  mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(UP,direction.normalize());return mesh;
}
function mergeStaticGlove(group){
  const buckets=new Map();
  for(const mesh of [...group.children]){
    mesh.updateMatrix();
    const geometry=(mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone()).applyMatrix4(mesh.matrix);
    if(!buckets.has(mesh.material))buckets.set(mesh.material,[]);buckets.get(mesh.material).push(geometry);
    group.remove(mesh);mesh.geometry.dispose();
  }
  for(const [material,parts] of buckets){
    const merged=mergeGeometries(parts,false);for(const geometry of parts)geometry.dispose();
    group.add(new THREE.Mesh(merged,material));
  }
}
function makeHand(sign,materials){
  const group=new THREE.Group();group.name=sign>0?'Right sailing glove':'Left sailing glove';
  const palm=pad(.070,.080,.024,.011,materials.glove);palm.position.set(sign*.002,-.002,.020);group.add(palm);
  const palmGrip=pad(.057,.064,.003,.009,materials.grip);palmGrip.position.set(sign*.002,-.003,.016);group.add(palmGrip);
  const backPad=pad(.056,.029,.002,.008,materials.back);backPad.position.set(sign*.002,.014,.047);group.add(backPad);
  const ys=[.027,.008,-.011,-.029],lengths=[.94,1,.97,.82],radii=[.0085,.009,.0085,.0072];
  for(let finger=0;finger<4;finger++){
    const y=ys[finger],f=lengths[finger],r=radii[finger];
    const points=[new THREE.Vector3(sign*.032,y,.034),new THREE.Vector3(sign*.036,y,-.010*f),new THREE.Vector3(sign*.009,y-.001,-.027*f),new THREE.Vector3(-sign*.018*f,y-.002,-.009)];
    for(let bone=0;bone<3;bone++)group.add(phalanx(points[bone],points[bone+1],r*[1,.94,.79][bone],bone===0?materials.glove:materials.grip));
    // A small back-of-knuckle cap reads as a glove joint, not a featureless fist.
    const cap=pad(.018,.013,.002,.004,materials.back);cap.position.set(sign*.032,y,.027);cap.rotation.y=sign*.55;group.add(cap);
  }
  // The opposed thumb crosses the upper pair of fingers around the handle.
  const thumb=[new THREE.Vector3(-sign*.029,.030,.033),new THREE.Vector3(-sign*.043,.023,.010),new THREE.Vector3(-sign*.025,.019,-.018),new THREE.Vector3(-sign*.003,.016,-.025)];
  for(let i=0;i<3;i++)group.add(phalanx(thumb[i],thumb[i+1],[.011,.010,.008][i],i===0?materials.glove:materials.grip));
  const cuff=new THREE.Mesh(new THREE.CylinderGeometry(.032,.035,.033,12,1),materials.cuff);cuff.position.set(0,-.063,.038);group.add(cuff);
  const cuffRoll=new THREE.Mesh(new THREE.TorusGeometry(.033,.0035,5,16),materials.back);cuffRoll.rotation.x=Math.PI/2;cuffRoll.position.set(0,-.077,.038);group.add(cuffRoll);
  // Restrained stitched seam on the visible back; no logos or high-contrast trim.
  for(let side=-1;side<=1;side+=2)for(let n=0;n<5;n++){
    const a=new THREE.Vector3(side*.029,-.027+n*.010,.0475),b=a.clone();b.y+=.004;
    group.add(phalanx(a,b,.0006,materials.stitch));
  }
  mergeStaticGlove(group);
  return group;
}
function sleeve(topRadius,bottomRadius,material,seamMaterial){
  const group=new THREE.Group();
  group.add(new THREE.Mesh(new THREE.CylinderGeometry(topRadius,bottomRadius,1,12,3),material));
  const seam=new THREE.Mesh(new THREE.CylinderGeometry(.0007,.0007,.91,4,1),seamMaterial);seam.position.z=Math.min(topRadius,bottomRadius)+.001;group.add(seam);
  return group;
}
function placeBone(group,a,b){
  const direction=new THREE.Vector3().subVectors(b,a),length=direction.length();
  group.position.copy(a).add(b).multiplyScalar(.5);group.scale.set(1,length,1);
  group.quaternion.setFromUnitVectors(UP,direction.multiplyScalar(1/Math.max(length,1e-7)));
}

/**
 * pose is canoe-LOCAL and comes from canoe.getPaddlePose():
 * {topGrip,shaftGrip,quaternion,side,blend,phase,active}. No pose vectors are mutated.
 * side +1 means a right/starboard stroke (right hand low, left hand on palm grip).
 * options.visible should be false for external review cameras. options.seat is
 * the physical local seat/eye reference, default (0,.86,1.85), not world-space.
 * options.eye may supply the stabilized camera's actual canoe-local position
 * for sleeve clipping, without moving the physical shoulders.
 */
export function createPaddlerHands(parent,{upperLength=.35,foreLength=.34}={}){
  const root=new THREE.Group();root.name='First-person paddler';root.visible=false;parent.add(root);
  const materials={
    glove:new THREE.MeshStandardMaterial({color:0x99917a,roughness:.86}),
    back:new THREE.MeshStandardMaterial({color:0x777665,roughness:.89}),
    grip:new THREE.MeshStandardMaterial({color:0x343e3c,roughness:.95}),
    cuff:new THREE.MeshStandardMaterial({color:0x384640,roughness:.96}),
    sleeve:new THREE.MeshStandardMaterial({color:0x2c3d43,roughness:.96}),
    stitch:new THREE.MeshStandardMaterial({color:0x6d7976,roughness:1})
  };
  const state={visible:false,blend:0,side:1,left:null,right:null};
  const limbs=[];
  for(const sign of [-1,1]){
    const group=new THREE.Group();group.name=sign>0?'Right arm':'Left arm';root.add(group);
    const upper=sleeve(.037,.045,materials.sleeve,materials.stitch),fore=sleeve(.030,.037,materials.sleeve,materials.stitch),hand=makeHand(sign,materials);
    group.add(upper,fore,hand);upper.visible=false; // only eye-safe sleeve portions become visible during update
    const data={side:sign,role:'',grip:new THREE.Vector3(),wrist:new THREE.Vector3(),shoulder:new THREE.Vector3(),elbow:new THREE.Vector3(),reachable:false,reachError:0,shoulderShift:0,upperLength,foreLength,gripError:0,upperVisible:false,forearmVisible:false,visibleForearmLength:0};
    state[sign<0?'left':'right']=data;limbs.push({sign,group,upper,fore,hand,data});
  }
  root.traverse(o=>{o.layers.set(LAYER_NEAR);if(o.isMesh){o.frustumCulled=false;o.renderOrder=2;}});
  const localWrist=new THREE.Vector3(0,-.079,.038),seat=new THREE.Vector3(),localEye=new THREE.Vector3(),normal=new THREE.Vector3(),pole=new THREE.Vector3(),offsetQuat=new THREE.Quaternion(),paddleQuat=new THREE.Quaternion(),renderedForearmStart=new THREE.Vector3();
  let blend=0,committedSide=1;
  function update(dt,pose,{visible=true,seat:seatReference,eye:eyeReference}={}){
    const valid=finiteVector(pose?.topGrip)&&finiteVector(pose?.shaftGrip)&&pose?.quaternion&&['x','y','z','w'].every(k=>Number.isFinite(pose.quaternion[k]));
    if(!valid){root.visible=false;state.visible=false;return;}
    const desired=visible?clamp(pose.blend??(pose.active?1:0),0,1):0;
    const delta=clamp(Number.isFinite(dt)?dt:0,0,.15);
    // Opacity follows the paddle's own lift/park envelope; grip transforms never lag.
    blend+=(desired-blend)*(1-Math.exp(-delta/Math.max(.045,desired>blend?.055:.10)));
    if((pose.blend??0)<.08||blend<.025)committedSide=Math.sign(pose.side)||committedSide;
    state.side=committedSide;state.blend=blend;state.visible=visible&&blend>.015;root.visible=state.visible;
    seat.copy(finiteVector(seatReference)?seatReference:new THREE.Vector3(0,.86,1.85));
    localEye.copy(finiteVector(eyeReference)?eyeReference:seat);
    paddleQuat.copy(pose.quaternion).normalize();
    for(const material of Object.values(materials)){material.transparent=true;material.opacity=smooth(.015,.85,blend);material.depthWrite=blend>.98;}
    for(const limb of limbs){
      const {sign,hand,data}=limb,top=sign===-committedSide;
      const rowingGrip=pose.rowing?pose.grips?.[sign<0?'left':'right']:null;
      data.role=rowingGrip?'oar':top?'top':'shaft';data.grip.copy(rowingGrip?rowingGrip.position:top?pose.topGrip:pose.shaftGrip);
      offsetQuat.setFromAxisAngle(new THREE.Vector3(0,0,1),top?sign*Math.PI/2:0);
      hand.position.copy(data.grip);if(rowingGrip)hand.quaternion.copy(rowingGrip.quaternion);else hand.quaternion.copy(paddleQuat).multiply(offsetQuat);
      data.wrist.copy(localWrist).applyQuaternion(hand.quaternion).add(data.grip);
      data.shoulder.set(seat.x+sign*.18,seat.y-.18,seat.z+.04);
      normal.subVectors(data.wrist,data.shoulder);const reach=normal.length();normal.multiplyScalar(1/Math.max(reach,1e-7));
      // A few centimetres of clavicle protraction prevents a rigid mannequin pose;
      // fixed arm lengths and a strict bound keep the sleeves from becoming tentacles.
      data.shoulderShift=Math.min(.06,Math.max(0,reach-(upperLength+foreLength-.015)));
      data.shoulder.addScaledVector(normal,data.shoulderShift);
      pole.copy(data.shoulder).add(new THREE.Vector3(sign*.26,-.30,.13));
      const solved=solvePaddlerArm(data.shoulder,data.wrist,pole,upperLength,foreLength);
      data.elbow.copy(solved.elbow);data.reachable=solved.reachable;data.reachError=solved.reachError;
      // An invalid supplied reach is hidden rather than stretching an arm or
      // pulling a hand off its handle. Normal stroke poses are tested to fit.
      limb.group.visible=data.reachable;
      data.upperVisible=visiblePaddlerForearm(data.shoulder,data.elbow,localEye,renderedForearmStart);
      limb.upper.visible=data.upperVisible;
      if(data.upperVisible)placeBone(limb.upper,renderedForearmStart,data.elbow);
      data.forearmVisible=visiblePaddlerForearm(data.elbow,data.wrist,localEye,renderedForearmStart);
      limb.fore.visible=data.forearmVisible;data.visibleForearmLength=data.forearmVisible?renderedForearmStart.distanceTo(data.wrist):0;
      if(data.forearmVisible)placeBone(limb.fore,renderedForearmStart,data.wrist);
      data.gripError=hand.position.distanceTo(data.grip);
    }
  }
  function dispose(){
    const geometries=new Set();root.traverse(o=>{if(o.isMesh)geometries.add(o.geometry);});
    for(const geometry of geometries)geometry.dispose();for(const material of Object.values(materials))material.dispose();parent.remove(root);
  }
  return {update,dispose,get state(){return state;},get group(){return root;}};
}

import * as THREE from 'three';
// Keep the authored cassette wheels and their atlas; split only their disconnected
// triangle groups so each wheel can turn about its own axle.
export function prepareTapeTransport(root){
 const source=root.getObjectByName('dial_low');if(!source?.isMesh)return [];
 const g=source.geometry.index?source.geometry.toNonIndexed():source.geometry.clone(),p=g.attributes.position;g.computeBoundingBox();const split=(g.boundingBox.min.y+g.boundingBox.max.y)/2,groups=[[],[]];
 for(let i=0;i<p.count;i+=3)groups[(p.getY(i)+p.getY(i+1)+p.getY(i+2))/3>split?1:0].push(i,i+1,i+2);
 const reels=[];
 for(let side=0;side<2;side++){
  if(!groups[side].length)continue;const geometry=new THREE.BufferGeometry();
  for(const [name,a]of Object.entries(g.attributes)){const values=[];for(const i of groups[side])for(let k=0;k<a.itemSize;k++)values.push(a.array[i*a.itemSize+k]);geometry.setAttribute(name,new THREE.BufferAttribute(new a.array.constructor(values),a.itemSize,a.normalized));}
  geometry.computeBoundingBox();const center=geometry.boundingBox.getCenter(new THREE.Vector3());geometry.translate(-center.x,-center.y,-center.z);
  const pivot=new THREE.Group();pivot.name='Cassette reel '+side;pivot.userData.tapeReel=side;pivot.position.copy(center);const mesh=new THREE.Mesh(geometry,source.material);pivot.add(mesh);
  // Preserve the original mesh transform in a wrapper: axle coordinates remain local.
  const wrapper=new THREE.Group();wrapper.position.copy(source.position);wrapper.quaternion.copy(source.quaternion);wrapper.scale.copy(source.scale);wrapper.add(pivot);source.parent.add(wrapper);reels.push(pivot);
 }
 if(reels.length===2)source.removeFromParent();g.dispose();return reels;
}
export function advanceTape(state,dt,media={}){
 const playing=media.mode==='TAPE'&&media.on&&media.spotify?.playing&&!media.spotify?.isBuffering;
 if(playing)state.phase=(state.phase+Math.min(.1,Math.max(0,dt))*2.6)%(Math.PI*200);return playing;
}
export function applyTapePose(root,state){root?.traverse(o=>{if(o.userData.tapeReel!=null)o.rotation.z=state.phase*(o.userData.tapeReel===0?.82:1);});}

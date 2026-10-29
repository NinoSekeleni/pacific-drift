// Physical blade contact drives its visual and acoustic response.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function paddleDrive(pose,playing=true){return playing&&pose?.active&&pose.submerged?clamp(Number.isFinite(pose.drive)?pose.drive:0,0,1):0;}
export function createPaddleFeedback({ocean,spray,audio,panAt=event=>clamp((event.side||1)*.45,-.8,.8)}){
  let catchId=null,exitId=null,lastPull=null;const pullByOar=new Map();
  return {water(event,time){
    const {phase,x,y,z}=event;
    if(![x,y,z,time].every(Number.isFinite))return;
    const id=event.strokeId??event.stroke??0,strength=clamp(event.strength??1,.15,1.4),vx=event.vx||0,vz=event.vz||0;
    const direction={x:vx,z:vz};if(event.paired)lastPull=pullByOar.get(event.side)||null;
    if(phase==='catch'){
      if(catchId===id)return;catchId=id;lastPull={x,z,time};
      ocean.addRipple(x,z,time,.055*strength,direction);
      spray.emit(x,y+.012,z,vx*.12,.42+strength*.18,vz*.12,Math.round(3+strength*3),.25);
      audio.splash(.55+.20*strength,event.paired?0:panAt(event));
    }else if(phase==='pull'){
      if(!event.submerged)return;
      if(lastPull&&Math.hypot(x-lastPull.x,z-lastPull.z)<.075&&time-lastPull.time<.14)return;
      ocean.addRipple(x,z,time,.018*strength,direction);lastPull={x,z,time};
    }else if(phase==='exit'){
      if(exitId===id)return;exitId=id;
      ocean.addRipple(x,z,time,.023*strength,direction);
      spray.emit(x,y+.035,z,vx*.16,.40,vz*.16,7,.16);
      audio.paddleExit?.(strength,panAt(event));lastPull=null;
    }
    if(event.paired){if(lastPull)pullByOar.set(event.side,lastPull);else pullByOar.delete(event.side);}
  }};
}

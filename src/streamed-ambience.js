// Two streamed media elements overlap at the seam; long recordings never become
// large decoded AudioBuffers or enter the initial page-load asset queue.
export function streamedAmbience(ctx,entry,destination,url){
 const pan=ctx.createStereoPanner();pan.connect(destination);const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=entry.lowpass||20000;filter.connect(pan);
 const channels=[0,1].map(()=>{const audio=new Audio();audio.preload='none';audio.src=url;const gain=ctx.createGain();gain.gain.value=0;ctx.createMediaElementSource(audio).connect(gain).connect(filter);return {audio,gain};});
 let current=0,fade=null,level=0,quietSince=null,started=false;const seam=3;
 function play(c){c.audio.play().catch(()=>{});}
 return {update(amount,options={}){pan.pan.setTargetAtTime(Math.max(-1,Math.min(1,options.pan||0)),ctx.currentTime,.3);const now=ctx.currentTime;level=Math.max(0,amount)*(entry.gain??1)*(entry.streamLevel??1);if(level<.0001){quietSince??=now;if(now-quietSince>5){for(const c of channels)c.audio.pause();started=false;}}else{quietSince=null;if(!started){play(channels[current]);started=true;}}
 const a=channels[current],b=channels[1-current],duration=a.audio.duration;
 if(started&&Number.isFinite(duration)&&duration>seam*3&&!fade&&a.audio.currentTime>duration-seam){b.audio.currentTime=0;play(b);fade=now;}
 if(fade!==null){const t=Math.min(1,(now-fade)/seam);a.gain.gain.setTargetAtTime(level*Math.cos(t*Math.PI/2),now,.08);b.gain.gain.setTargetAtTime(level*Math.sin(t*Math.PI/2),now,.08);if(t>=1){a.audio.pause();a.audio.currentTime=0;current=1-current;fade=null;}}
 else{a.gain.gain.setTargetAtTime(level,now,1.6);b.gain.gain.setTargetAtTime(0,now,.2);}
 },stop(){for(const c of channels)c.audio.pause();},get time(){return channels[current].audio.currentTime;},get playing(){return started;}};
}

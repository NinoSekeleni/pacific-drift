// Approved Magnific recordings, with a wide sea layer, passing waves and close water.
// Short close-water clips are scheduled as events, never tiled as continuous surf.
import {soundMix,rainClipForWeather,waterEventInterval,waveEventInterval} from './sound-mix.js';
import {streamedAmbience} from './streamed-ambience.js';
import {recordingLevel} from './audio-levels.js';
const roleAlias=role=>({roughSea:'waves',hullLap:'water',calmSea:'ocean',drip:'paddle',stormRain:'rain',nightRain:'rain',orcaBreath:'marine',passingWave:'waves',sailing:'sail',sail:'sail'}[role]||role);
export function createAudio({base='./'}={}) {
  let ctx=null,master=null,radioBus=null,radioStatic=null,noiseBuf=null,muted=false,hiss=null;
  let arrivalMix=1,shipEmitter={amount:0,pan:0};
  let mix=soundMix(0,0,0,0),manifestPromise=null,selectedRain='auto',audition=null,auditioning=false;
  let nextWater=0,nextWave=0,nextOcean=0,rainHasThunder=false;
  const streams=[];let nextPassing=0,lightning=0;const rainTimes=new Map();
  const listeners=[],recordings=new Map(),loopLayers=[],lastPlayed=new Map(),active=new Map();
  const layerLevels=new Map(),buses=new Map(),bufferCache=new Map(),lastVariant=new Map();
  const set=(p,v,tc=.5)=>p.setTargetAtTime(Math.max(0,v),ctx.currentTime,tc);
  function bus(role){
    const key=roleAlias(role);
    if(!buses.has(key)){const gain=ctx.createGain();gain.gain.value=layerLevels.get(key)??1;gain.connect(master);buses.set(key,gain);}
    return buses.get(key);
  }
  function enabled(role){return (layerLevels.get(roleAlias(role))??1)>0;}
  // Radio static belongs to the radio, not to the environmental soundscape.
  function noise(seconds=6){
    const b=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*seconds),ctx.sampleRate),d=b.getChannelData(0);let brown=0;
    for(let i=0;i<d.length;i++){brown=(brown+(Math.random()*2-1)*.025)/1.025;d[i]=brown*4;}return b;
  }
  function seamless(buffer){
    const fade=Math.min(Math.floor(buffer.sampleRate*.75),Math.floor(buffer.length*.12));if(fade<32)return buffer;
    const length=buffer.length-fade,out=ctx.createBuffer(buffer.numberOfChannels,length,buffer.sampleRate);
    for(let c=0;c<buffer.numberOfChannels;c++){const src=buffer.getChannelData(c),dst=out.getChannelData(c);dst.set(src.subarray(0,length));for(let i=0;i<fade;i++){const t=i/(fade-1)*Math.PI*.5;dst[i]=src[length+i]*Math.cos(t)+src[i]*Math.sin(t);}}
    return out;
  }
  async function sourceBuffer(file){
    if(!bufferCache.has(file))bufferCache.set(file,(async()=>{const response=await fetch(base+file);if(!response.ok)throw Error('Recording unavailable');const buffer=await ctx.decodeAudioData(await response.arrayBuffer());return {buffer,level:recordingLevel(Array.from({length:buffer.numberOfChannels},(_,c)=>buffer.getChannelData(c)))};})());
    return bufferCache.get(file);
  }
  async function loadRecordings(){
    try{
      const res=await fetch(base+'data/soundscape.json');if(!res.ok)return;const manifest=await res.json();
      await Promise.allSettled((manifest.recordings||[]).filter(r=>r.approved&&r.file&&r.sourceUrl&&r.license).map(async entry=>{
        if(entry.stream&&entry.role==='audition')return;
        if(entry.stream){streams.push({entry,player:streamedAmbience(ctx,entry,bus(entry.role),base+entry.file)});return;}
        const decoded=await sourceBuffer(entry.file),buffer=entry.loop?seamless(decoded.buffer):decoded.buffer;
        const record={...entry,buffer,level:decoded.level};if(!recordings.has(entry.role))recordings.set(entry.role,[]);recordings.get(entry.role).push(record);
        if(entry.loop&&entry.role!=='audition'){
          const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;source.playbackRate.value=.992+Math.random()*.016;
          const gain=ctx.createGain();gain.gain.value=0;source.connect(gain).connect(bus(entry.role));source.start(0,Math.random()*Math.max(.001,buffer.duration-1));loopLayers.push({entry:record,gain,source,phase:Math.random()*Math.PI*2});
        }
      }));
    }catch{/* Missing audio must not stop the voyage. */}
  }
  function start(){
    if(ctx){if(ctx.state==='suspended')ctx.resume();return;}
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    ctx=new AC();master=ctx.createGain();master.gain.value=muted?0:.75*arrivalMix;master.connect(ctx.destination);noiseBuf=noise();
    radioBus=ctx.createGain();radioBus.connect(master);
    const source=ctx.createBufferSource();source.buffer=noiseBuf;source.loop=true;
    const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=2300;f.Q.value=.5;radioStatic=ctx.createGain();radioStatic.gain.value=0;source.connect(f).connect(radioStatic).connect(radioBus);source.start();
    nextWater=ctx.currentTime+2;nextWave=ctx.currentTime+5;nextOcean=ctx.currentTime+1;
    manifestPromise=loadRecordings();for(const fn of listeners)fn(ctx);
  }
  function recorded(role,strength=1,{pan=0,delay=0,cooldown=.12,lowpass=0}={}){
    if(!ctx||muted||auditioning||!enabled(role))return false;
    const variants=recordings.get(role)?.filter(x=>!x.loop);if(!variants?.length)return false;
    const t=ctx.currentTime+delay;
    if(t-(lastPlayed.get(role)??-Infinity)<cooldown||active.size>=14)return true;
    lastPlayed.set(role,t);
    let index=Math.floor(Math.random()*variants.length);if(variants.length>1&&index===lastVariant.get(role))index=(index+1)%variants.length;lastVariant.set(role,index);
    const record=variants[index],src=ctx.createBufferSource();src.buffer=record.buffer;src.playbackRate.value=.97+Math.random()*.06;
    const segments=record.segments||[{start:0,duration:record.buffer.duration}];
    let segmentIndex=Math.floor(Math.random()*segments.length);const segmentKey=role+':segment';if(segments.length>1&&segmentIndex===lastVariant.get(segmentKey))segmentIndex=(segmentIndex+1)%segments.length;lastVariant.set(segmentKey,segmentIndex);
    const segment=segments[segmentIndex],offset=Math.max(0,segment.start||0),sourceDuration=Math.min(segment.duration||record.buffer.duration,record.buffer.duration-offset);
    const gain=ctx.createGain(),level=Math.min(.65,strength*(record.gain??.3))*record.level,duration=sourceDuration/src.playbackRate.value;
    const attack=Math.min(.12,duration*.1),release=Math.min(.45,duration*.28);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+attack);gain.gain.setValueAtTime(level,t+Math.max(attack,duration-release));gain.gain.linearRampToValueAtTime(0,t+duration);
    const panner=ctx.createStereoPanner();panner.pan.value=Math.max(-1,Math.min(1,pan));
    let node=src;const filter=lowpass?ctx.createBiquadFilter():null;if(filter){filter.type='lowpass';filter.frequency.value=lowpass;filter.Q.value=.45;node.connect(filter);node=filter;}node.connect(gain).connect(panner).connect(bus(role));
    const nodes=[gain,panner,filter].filter(Boolean);active.set(src,{role,nodes});src.onended=()=>{active.delete(src);src.disconnect();for(const n of nodes)n.disconnect();};src.start(t,offset,sourceDuration);
    return true;
  }
  function update(windSpeed,waveHeight,rainAmount,heaveRate,isNight=false,options={}){
    if(!ctx)return;
    mix=soundMix(windSpeed,waveHeight,rainAmount,heaveRate,ctx.currentTime);
    const rainId=selectedRain==='auto'?(rainAmount>.35?'freesound-121533':rainClipForWeather(rainAmount,windSpeed,isNight)):selectedRain;
    for(const stream of streams){const role=stream.entry.role;let amount=role==='sailing'?(options.sail?Math.min(1,windSpeed/6)*Math.max(.15,1-windSpeed/28):0):role==='ship'?shipEmitter.amount:role==='rain'?(rainId===stream.entry.id?Math.pow(Math.min(1,rainAmount),1.15)*.15:0):mix[roleAlias(role)]||0;stream.player.update(auditioning?0:amount,{pan:role==='ship'?shipEmitter.pan:0});}
    // Cue lightning from the recorded rain timeline instead of unrelated flashes.
    for(const stream of streams){if(!stream.entry.lightningCues)continue;const now=stream.player.time,previous=rainTimes.get(stream.entry.id)??now;rainTimes.set(stream.entry.id,now);if(!muted&&!auditioning&&rainAmount>.35&&rainId===stream.entry.id&&enabled('rain')&&stream.player.playing&&now>=previous&&now-previous<1){for(const cue of stream.entry.lightningCues)if(previous<cue&&now>=cue)lightning=.65;}}
    rainHasThunder=rainAmount>.05&&['magnific-225','magnific-278','magnific-280','freesound-121533'].includes(rainId)&&enabled('rain');
    for(const layer of loopLayers){
      const role=layer.entry.role,rainRole=['rain','heavyRain','stormRain','nightRain'].includes(role);
      let amount=mix[roleAlias(role)]||mix[role]||0;
      if(rainRole)amount=layer.entry.id===rainId?Math.pow(Math.min(1,rainAmount),1.15)*.13:0;
      const siblings=rainRole?1:loopLayers.filter(x=>x.entry.role===role).length;
      // Evolve wave energy on a much longer cycle than the short source file.
      // Slow, shallow rate drift and unequal envelope periods soften repetition.
      const t=ctx.currentTime,phase=layer.phase;
      if(role==='ocean'){amount*=.75+.15*Math.sin(t*.113+phase)+.10*Math.sin(t*.037+phase*1.7);set(layer.source.playbackRate,.994+.009*Math.sin(t*.029+phase),4);}
      if(role==='waves'){amount*=.42+.58*Math.pow(.5+.5*Math.sin(t*.407+phase),1.7);set(layer.source.playbackRate,.994+.012*Math.sin(t*.043+phase),3);}
      set(layer.gain.gain,auditioning?0:amount*(layer.entry.gain??1)*layer.entry.level/Math.sqrt(siblings),role==='waves'?.75:1.6);
    }
    const t=ctx.currentTime;

    if(t>=nextPassing){nextPassing=t+17+Math.random()*21;if(waveHeight>1.1)recorded('passingWave',mix.waves*.45,{pan:(Math.random()-.5)*.9,cooldown:10,lowpass:2200});}
    // Schedule at most one event per role after a tab resumes; never catch up a backlog.
    if(t>=nextWater){nextWater=t+waterEventInterval(waveHeight,Math.random());if(mix.water>.001)recorded('water',mix.water,{pan:(Math.random()<.5?-1:1)*(.35+Math.random()*.35),cooldown:3,lowpass:4200});}
    if(t>=nextWave){nextWave=t+waveEventInterval(waveHeight,Math.random());if(mix.waves>.004&&!recordings.get('waves')?.some(r=>r.loop))recorded('waves',mix.waves,{pan:(Math.random()-.5)*1.1,cooldown:3,lowpass:1500});}
    if(t>=nextOcean){nextOcean=t+8+Math.random()*8;if(mix.ocean>.001&&!recordings.get('ocean')?.some(r=>r.loop))recorded('ocean',mix.ocean,{pan:(Math.random()-.5)*.35,cooldown:6,lowpass:1100});}
  }
  function splash(strength=1,pan=0){recorded('paddle',strength,{pan,cooldown:.8});}
  function paddleExit(strength=1,pan=0){recorded('drip',strength*.10,{pan,delay:.04,cooldown:.35,lowpass:3800});}
  function lap(strength=1){recorded('water',Math.min(.5,strength*.35),{pan:(Math.random()<.5?-1:1)*(.35+Math.random()*.3),cooldown:4,lowpass:4200});nextWater=ctx?Math.max(nextWater,ctx.currentTime+5):nextWater;}
  function creak(strength=1){recorded('creak',strength*.18,{pan:(Math.random()-.5)*.6,cooldown:8});}
  function thunder(delay,strength=1){
    if(!ctx||muted||auditioning||!enabled('thunder')||rainHasThunder)return;
    recorded('thunder',strength,{delay,pan:(Math.random()-.5)*.8,cooldown:12,lowpass:2400});
  }
  function setLantern(level){
    if(!ctx)return;
    if(!hiss){const source=ctx.createBufferSource();source.buffer=noiseBuf;source.loop=true;const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=2700;hiss=ctx.createGain();hiss.gain.value=0;source.connect(f).connect(hiss).connect(master);source.start();}set(hiss.gain,.0006*level,1);
  }
  function setStatic(level){if(ctx)set(radioStatic.gain,Math.min(.08,level),.08);}
  function crackle(level){if(!ctx||muted||Math.random()>.12)return;setStatic(Math.min(.035,level));}
  function tone(freq,dur,level,when=0){
    if(!ctx||muted||level<=.001)return;const source=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+when;
    source.frequency.value=freq;gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(level,t+.002);gain.gain.setValueAtTime(level,t+dur-.002);gain.gain.linearRampToValueAtTime(0,t+dur);
    source.connect(gain).connect(radioBus);source.onended=()=>{source.disconnect();gain.disconnect();};source.start(t);source.stop(t+dur+.01);
  }
  function stopAudition(){if(audition){audition.pause();audition.currentTime=0;audition=null;}auditioning=false;}
  function auditionClip(file){stopAudition();start();auditioning=true;for(const {nodes} of active.values())set(nodes[0].gain,0,.05);audition=new Audio(base+file);audition.volume=.65;audition.muted=muted;audition.onended=stopAudition;audition.onerror=stopAudition;return audition.play().catch(error=>{stopAudition();throw error;});}
  function setMuted(value){muted=value;if(audition)audition.muted=value;if(master)set(master.gain,value?0:.75*arrivalMix,.06);}
  function setArrivalMix(value){const next=Math.max(0,Math.min(1,Number.isFinite(value)?value:1));if(Math.abs(next-arrivalMix)<.002&&next!==0&&next!==1)return;arrivalMix=next;if(master)set(master.gain,muted?0:.75*arrivalMix,.18);}
  function setLayerLevel(role,level){const key=roleAlias(role),v=Math.max(0,Math.min(1,level));layerLevels.set(key,v);if(ctx&&buses.has(key))set(buses.get(key).gain,v,.08);}
  return {sailFlap(strength=.3){recorded('sail',strength,{pan:.12,cooldown:6,lowpass:6000});},consumeLightning(){const value=lightning;lightning=0;return value;},get recordedThunder(){return rainHasThunder;},ship(range=Infinity,pan=0){shipEmitter={amount:range<1600?.20*Math.pow(140/Math.max(140,range),1.4):0,pan};},marine(kind,strength,pan=0){recorded(kind==='orca'?'orcaBreath':'water',strength,{pan,cooldown:kind==='orca'?2:.25,lowpass:kind==='orca'?4200:2400});},start,update,splash,paddleExit,lap,creak,thunder,setLantern,setStatic,tone,crackle,setMuted,setArrivalMix,auditionClip,stopAudition,setLayerLevel,
    setRainClip(id){selectedRain=id;},
    onStart(fn){listeners.push(fn);if(ctx)fn(ctx);},get muted(){return muted;},get ready(){return !!ctx;},get recordingsReady(){return manifestPromise;},
    get recordingCount(){return new Set([...recordings.values()].flat().map(r=>r.file).concat(streams.map(s=>s.entry.file))).size;},
    get layers(){return ['ocean','waves','water','wind','rain','heavyRain','paddle','thunder','sail','marine','ship'];},
    get hasOceanRecording(){return streams.some(s=>s.entry.role==='ocean')||recordings.get('ocean')?.some(r=>r.loop)||false;}
  };
}

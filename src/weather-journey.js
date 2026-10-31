// Regional, continuous simulated weather. Live forecast mode stays separate.
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const random=(seed,i)=>{let x=(seed^Math.imul(i+1,0x45d9f3b))>>>0;x=Math.imul(x^(x>>>16),0x45d9f3b);return ((x^(x>>>16))>>>0)/4294967296;};
export const JOURNEY_PROFILES={
 groundswell:{name:'Distant storm swell',speed:2.5,swellH:3.1,precip:0,cover:.22,dark:.03,visibility:50000,heat:0,temperature:16,swellPeriod:15},
 crossSea:{name:'Crossing seas',speed:10,swellH:2.8,precip:.10,cover:.58,dark:.22,visibility:24000,heat:0,temperature:15,swellPeriod:12},
 calm:{name:'Calm spell',speed:1.2,swellH:.35,precip:0,cover:.12,dark:0,visibility:60000,heat:0,temperature:20},
 breeze:{name:'Sea breeze',speed:6,swellH:1,precip:0,cover:.28,dark:.02,visibility:45000,heat:0,temperature:20},
 building:{name:'Building wind',speed:14,swellH:2.1,precip:.12,cover:.74,dark:.34,visibility:18000,heat:0,temperature:17},
 rain:{name:'Passing rain',speed:11,swellH:2.3,precip:.77,cover:.93,dark:.48,visibility:4500,heat:0,temperature:16},
 storm:{name:'Storm front',speed:25,swellH:5.2,precip:1,cover:.98,dark:.86,visibility:1300,heat:0,temperature:13},
 squall:{name:'Severe squall',speed:32,swellH:6.7,precip:1,cover:.99,dark:.94,visibility:500,heat:0,temperature:12},
 clearing:{name:'Clearing skies',speed:8,swellH:2.7,precip:.08,cover:.38,dark:.1,visibility:32000,heat:0,temperature:19},
 fog:{name:'Sea fog',speed:2.8,swellH:.55,precip:.015,cover:.62,dark:.16,visibility:180,heat:0,temperature:15},
 heat:{name:'Heat haze',speed:2.2,swellH:.35,precip:0,cover:.05,dark:0,visibility:14000,heat:1,temperature:36}
};
export function journeyStages(seed,lat){const temperate=smooth((Math.abs(lat)-25)/25),tropical=1-temperate,stages=[];let kind='breeze';for(let i=0;i<32;i++){
 const duration=(kind==='building'?4:kind==='squall'?3:6)+random(seed,i*3)*7;stages.push({kind,duration:duration*60});const r=random(seed,i*3+1);
 if(kind==='groundswell')kind=r<.6?'breeze':'calm';
 else if(kind==='crossSea')kind='building';
 else if(kind==='calm')kind=r<.25*tropical?'heat':r<.35?'fog':'breeze';
 else if(kind==='breeze')kind=r<.22?'calm':r<.32&&temperate>.5?'fog':r<.42*tropical?'heat':'building';
 else if(kind==='building')kind=r<.2?'breeze':r<.76?'rain':'storm';
 else if(kind==='rain')kind=r<.34+.25*temperate?'storm':'clearing';
 else if(kind==='storm')kind=r<.25*temperate?'squall':'clearing';
 else if(kind==='squall')kind='clearing';else if(kind==='fog')kind='calm';else if(kind==='heat')kind='building';else kind=r<.55?'groundswell':r<.75?'crossSea':'breeze';
 }return stages;}
const cache=new Map();
export function journeyWeather(base,lat,lng,time,start,seed=1,climateLat=lat){const band=climateLat,key=seed+':'+climateLat;let stages=cache.get(key);if(!stages){stages=journeyStages(seed,band);cache.set(key,stages);if(cache.size>100)cache.delete(cache.keys().next().value);}
 const total=stages.reduce((n,s)=>n+s.duration,0),elapsed=Math.max(0,(time-start)/1000),cycle=Math.floor(elapsed/total),t=elapsed%total;let i=0,at=0;while(i<stages.length-1&&at+stages[i].duration<t)at+=stages[i++].duration;
 const current=JOURNEY_PROFILES[stages[i].kind],previous=JOURNEY_PROFILES[stages[i===0&&cycle===0?0:(i+stages.length-1)%stages.length].kind],blend=smooth((t-at)/Math.min(210,stages[i].duration*.55)),out={...base};for(const k of ['speed','swellH','precip','cover','dark','visibility','heat','temperature'])out[k]=previous[k]+(current[k]-previous[k])*blend;
 const swellBlend=smooth((t-at)/Math.min(360,stages[i].duration*.8));out.swellH=previous.swellH+(current.swellH-previous.swellH)*swellBlend;
 const index=cycle*32+i,oldTurn=index>0?(random(seed,index-1+700)-.5)*48:0,newTurn=(random(seed,index+700)-.5)*48,turn=oldTurn+(newTurn-oldTurn)*blend,from=((base.from??230)+turn+360)%360,gust=1+(Math.sin(time/4300)*.045+Math.sin(time/12700)*.035)*smooth(out.speed/25);out.speed*=gust;out.from=from;out.u=-Math.sin(from*Math.PI/180)*out.speed;out.v=-Math.cos(from*Math.PI/180)*out.speed;out.cloudBase=900-out.dark*600;out.cloudTop=2300+out.precip*5000;out.cirrus=out.cover*.25+(previous===JOURNEY_PROFILES.building?.28:0)*(1-blend)+(current===JOURNEY_PROFILES.building?.28:0)*blend;out.gradE=0;out.gradN=0;out.swellH*=.65+.35*smooth((Math.abs(lat)-10)/40);const oldSwell=previous.swellPeriod??11,newSwell=current.swellPeriod??11;out.swellPeriod=oldSwell+(newSwell-oldSwell)*swellBlend;const oldAngle=previous===JOURNEY_PROFILES.crossSea?70:0,newAngle=current===JOURNEY_PROFILES.crossSea?70:0;out.swellFrom=((base.swellFrom??230)+oldAngle+(newAngle-oldAngle)*swellBlend+360)%360;out.journeyName=current.name;out.journeyKind=stages[i].kind;out.journeyProgress=(t-at)/stages[i].duration;delete out.waveH;delete out.windWaveH;return out;}

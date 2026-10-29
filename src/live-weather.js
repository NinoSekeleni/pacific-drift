// Open-Meteo model estimates, CC BY 4.0. Never present fallback simulation as live data.
// Two independent feeds: losing marine data must not discard valid atmospheric data.
const MINUTE=60000,HOUR=60*MINUTE,REFRESH=15*MINUTE,MAX_CACHE_AGE=6*HOUR;
const DEG=Math.PI/180;
const ATM=['cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','precipitation','wind_speed_10m','wind_direction_10m','wind_gusts_10m','visibility','temperature_2m','dew_point_2m','weather_code'];
const MARINE=['wave_height','wave_direction','wave_period','wind_wave_height','wind_wave_direction','wind_wave_period','swell_wave_height','swell_wave_direction','swell_wave_period'];
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function separation(a,b) {
  const lat=(a.lat-b.lat)*DEG,lng=((a.lng-b.lng+540)%360-180)*DEG;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(lat/2)**2+Math.cos(a.lat*DEG)*Math.cos(b.lat*DEG)*Math.sin(lng/2)**2)));
}
export function feedURL(kind,lat,lng) {
  const p=new URLSearchParams({latitude:lat.toFixed(4),longitude:lng.toFixed(4),hourly:(kind==='weather'?ATM:MARINE).join(','),forecast_days:'2',timeformat:'unixtime',timezone:'GMT',cell_selection:'sea'});
  if(kind==='weather'){p.set('current',ATM.join(','));p.set('wind_speed_unit','ms');}
  return `https://${kind==='weather'?'api':'marine-api'}.open-meteo.com/v1/${kind==='weather'?'forecast':'marine'}?${p}`;
}
export function normalizeFeed(data,kind,point,fetchedAt) {
  const keys=kind==='weather'?ATM:MARINE,h=data?.hourly;
  if(!Array.isArray(h?.time)||h.time.length<2)throw new Error('No forecast timeline');
  const rows=h.time.map((time,i)=>Object.fromEntries([['time',time*1000],...keys.map(k=>[k,h[k]?.[i]])])).filter(r=>finite(r.time));
  const c=data.current;
  if(c&&finite(c.time)){
    const row=Object.fromEntries([['time',c.time*1000],...keys.map(k=>[k,c[k]])]);
    // Current precipitation is the sum over its reported interval (normally 900 s).
    // Convert to the same mm/hour rate as the hourly timeline before interpolation.
    if(kind==='weather'&&finite(row.precipitation)&&finite(c.interval)&&c.interval>0)row.precipitation*=3600/c.interval;
    rows.push(row);
  }
  rows.sort((a,b)=>a.time-b.time);
  const unique=rows.filter((r,i)=>!rows[i+1]||r.time!==rows[i+1].time);
  const required=kind==='weather'?['cloud_cover','wind_speed_10m','wind_direction_10m','precipitation']:['wave_height','wave_period','wave_direction'];
  if(!unique.some(r=>required.every(k=>finite(r[k]))))throw new Error('Forecast values unavailable');
  return {kind,point:{lat:point.lat,lng:point.lng},fetchedAt,rows:unique};
}
export function sampleFeed(feed,point,ms,wallNow) {
  if(!feed||!finite(feed.point?.lat)||!finite(feed.point?.lng)||!finite(feed.fetchedAt)||wallNow-feed.fetchedAt>MAX_CACHE_AGE||wallNow<feed.fetchedAt-5*MINUTE||separation(feed.point,point)>40000)return null;
  const rows=feed.rows;
  if(!Array.isArray(rows)||rows.length<2||ms<rows[0].time||ms>rows.at(-1).time)return null;
  let i=0;while(i<rows.length-2&&rows[i+1].time<=ms)i++;
  const a=rows[i],b=rows[i+1],f=clamp((ms-a.time)/Math.max(1,b.time-a.time),0,1),out={};
  for(const k of Object.keys(a)) {
    if(k==='time'||!finite(a[k])||!finite(b[k]))continue;
    const d=k.includes('direction')?((b[k]-a[k]+540)%360-180):b[k]-a[k];
    out[k]=a[k]+d*f;if(k.includes('direction'))out[k]=(out[k]+360)%360;
  }
  return out;
}
export function atmosphericConditions(r) {
  if(!r||!['cloud_cover','wind_speed_10m','wind_direction_10m','precipitation'].every(k=>finite(r[k])))return null;
  const speed=clamp(r.wind_speed_10m,0,65),from=(r.wind_direction_10m+360)%360,cover=clamp(r.cloud_cover/100,0,1);
  // Open-Meteo precipitation is mm/hour; existing effects use a bounded intensity.
  const precip=clamp(1-Math.exp(-Math.max(0,r.precipitation)/3),0,1.2);
  const dark=clamp(Math.max(0,cover-.65)*.9+precip*.65,0,1);
  const base=finite(r.temperature_2m)&&finite(r.dew_point_2m)?clamp((r.temperature_2m-r.dew_point_2m)*125,250,2500):900;
  return {u:-Math.sin(from*DEG)*speed,v:-Math.cos(from*DEG)*speed,speed,from,cover,precip,dark,
    cirrus:clamp((r.cloud_cover_high??r.cloud_cover)*.01,0,1),cloudBase:base,
    cloudTop:base+1800+precip*3500,gradE:0,gradN:0,
    visibility:finite(r.visibility)?clamp(r.visibility,200,80000):38000/(1+8*precip),base:speed};
}
export function marineConditions(r) {
  if(!r||!['wave_height','wave_direction','wave_period'].every(k=>finite(r[k])))return null;
  const split=['wind_wave_height','swell_wave_height','wind_wave_period','swell_wave_period','wind_wave_direction','swell_wave_direction'].every(k=>finite(r[k]));
  // A total sea is used once when the provider has no split, never added to synthetic wind waves.
  return {waveH:clamp(r.wave_height,0,20),wavePeriod:clamp(r.wave_period,1,30),
    windWaveH:split?clamp(r.wind_wave_height,0,15):0,
    windWavePeriod:split?clamp(r.wind_wave_period,1,25):5,
    windWaveFrom:split?r.wind_wave_direction:r.wave_direction,
    swellH:clamp(split?r.swell_wave_height:r.wave_height,0,20),
    swellPeriod:clamp(split?r.swell_wave_period:r.wave_period,1,30),
    swellFrom:split?r.swell_wave_direction:r.wave_direction};
}
function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
export function createLiveWeather({fetcher=globalThis.fetch?.bind(globalThis),storage=browserStorage(),clock=Date.now}={}) {
  const feeds={weather:null,marine:null},failed={weather:false,marine:false},attempt={weather:null,marine:null};
  const key='pacific-drift-live-weather-v1';let pending=null;
  try{const saved=JSON.parse(storage?.getItem(key)||'null');for(const kind of ['weather','marine'])if(saved?.[kind]?.kind===kind&&Array.isArray(saved[kind].rows)&&saved[kind].rows.length>=2&&saved[kind].rows.every((r,i,rows)=>r&&finite(r.time)&&(!i||r.time>rows[i-1].time))){feeds[kind]=saved[kind];failed[kind]=true;}}catch{}
  function sample(lat,lng,ms){
    const point={lat,lng},wall=clock(),a=sampleFeed(feeds.weather,point,ms,wall),m=sampleFeed(feeds.marine,point,ms,wall);
    return {atmosphere:atmosphericConditions(a),marine:marineConditions(m)};
  }
  function status(lat,lng,ms){
    const s=sample(lat,lng,ms),wall=clock();
    const state=kind=>!s[kind==='weather'?'atmosphere':'marine']?'simulated':failed[kind]||wall-feeds[kind].fetchedAt>REFRESH*2?'cached':'live';
    return {weather:state('weather'),marine:state('marine'),weatherTime:feeds.weather?.fetchedAt,marineTime:feeds.marine?.fetchedAt,pending:!!pending};
  }
  function refresh(lat,lng,{force=false}={}) {
    if(pending)return pending;
    const point={lat,lng},wall=clock();
    const due=['weather','marine'].filter(kind=>force||!attempt[kind]||wall-attempt[kind].time>=(failed[kind]?5*MINUTE:REFRESH)||separation(attempt[kind].point,point)>20000);
    if(!due.length)return Promise.resolve();
    pending=Promise.allSettled(due.map(async kind=>{
      attempt[kind]={time:wall,point};const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{const response=await fetcher(feedURL(kind,lat,lng),{signal:controller.signal});if(!response.ok)throw new Error('Forecast request failed');
        feeds[kind]=normalizeFeed(await response.json(),kind,point,clock());failed[kind]=false;
      }catch{failed[kind]=true;}finally{clearTimeout(timer);}
    })).then(()=>{try{storage?.setItem(key,JSON.stringify(feeds));}catch{}}).finally(()=>{pending=null;});
    return pending;
  }
  return {sample,status,refresh};
}

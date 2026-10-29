// Perceptual targets: a quiet moving sea has spaced, audible water detail;
// a perfectly still sea has no generated noise floor.
const clamp = x => Math.max(0,Math.min(1,x));
const smooth = (a,b,x) => {const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function soundMix(windSpeed,waveHeight,rainAmount,heaveRate,time=0){
  const rough=smooth(.35,4.5,waveHeight);
  const ripple=smooth(.015,.65,waveHeight);
  const breeze=smooth(2.5,22,windSpeed);
  const rain=clamp(rainAmount);
  const motion=smooth(.04,1.5,Math.abs(heaveRate));
  const gust=.82+.12*Math.sin(time*.17)+.06*Math.sin(time*.061+1.3);
  const seaSwell=.78+.14*Math.sin(time*.22)+.08*Math.sin(time*.087+1.1);
  const ocean=ripple*(.075+rough*.055)*seaSwell;
  // The furious-wave recording must never leak into calm or light swell.
  const waveGate=Math.max(smooth(1.3,3,waveHeight),smooth(1.3,1.9,waveHeight)*smooth(14,24,windSpeed));
  const waves=waveGate*(.11+.16*motion)*seaSwell;
  const water=ripple*(.16+.13*motion);
  return {
    ocean,waves,water,
    calmSea:(1-rough)*ocean,
    roughSea:waves,
    wind:breeze*breeze*.19*gust,
    rain:Math.pow(rain,1.15)*.10,
    heavyRain:Math.pow(rain,2.7)*.12,
    waterRain:Math.pow(rain,1.25)*.065,
    // Kept for compatibility with older feedback exports, never rendered as noise.
    fallbackSea:0,fallbackWind:0,fallbackRain:0,
    impact:.08+.22*motion
  };
}
export function waterEventInterval(waveHeight,random=.5){
  return (10-6*smooth(.04,2,waveHeight))+(1-clamp(random))*8;
}
export function waveEventInterval(waveHeight,random=.5){
  return (7-3*smooth(.5,5,waveHeight))+(1-clamp(random))*4;
}
// One rain bed at a time; embedded thunder is not doubled by separate thunder events.
export function rainClipForWeather(amount,windSpeed,isNight=false){
  if(amount<.45)return 'magnific-262';
  if(amount<.75)return 'magnific-210';
  if(windSpeed>=20)return 'magnific-280';
  return isNight?'magnific-278':'magnific-225';
}

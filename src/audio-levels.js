// Bring quiet source files into a usable range without amplifying peaks into clipping.
export function recordingLevel(channels,{targetRms=.075,maxBoost=12,peakCeiling=.85}={}){
  let sum=0,count=0,peak=0;
  for(const channel of channels)for(let i=0;i<channel.length;i++){
    const sample=Number.isFinite(channel[i])?channel[i]:0;
    sum+=sample*sample;count++;peak=Math.max(peak,Math.abs(sample));
  }
  const rms=Math.sqrt(sum/Math.max(1,count));
  if(rms<.00001||peak<.00001)return 0;
  return Math.max(0,Math.min(maxBoost,targetRms/rms,peakCeiling/peak));
}

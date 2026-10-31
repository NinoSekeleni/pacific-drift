const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
// One gust pulse drives the free cloth edge and its associated fabric sound.
export function sailFlap(time,wind,raised=true){
 const phase=((time/9.7+.09*Math.sin(time*.073))%1+1)%1;
 const envelope=smooth(.12,.18,phase)*(1-smooth(.22,.36,phase));
 return raised?envelope*smooth(2,10,wind):0;
}

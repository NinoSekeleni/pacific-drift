// Broad gameplay habitat envelopes, not occurrence observations or stock estimates.
// Geometry keys refer to Tidewater anatomy templates; each regional species can override proportions.
const fish=(name,sci,model,lat,temp,kg,depth,fight=.6,extra={})=>({name,sci,model,lat,temp,kg,depth,fight,stamina:7+fight*13,lw:[.012,3],...extra});
export const FISH={
 albacore:fish('Albacore','Thunnus alalunga','tuna',[-48,-12],[10,22],[1.5,18],[0,300],.75,{finScale:1.5}),
 bluefin:fish('Southern bluefin tuna','Thunnus maccoyii','tuna',[-55,-25],[6,20],[8,70],[0,500],1,{rarity:.08}),
 pomfret:fish('Southern pomfret','Brama australis','jack',[-55,-25],[7,19],[.5,4],[0,250],.45,{bodyDepth:1.4}),
 opah:fish('Southern opah','Lampris immaculatus','jack',[-60,-30],[4,17],[3,25],[30,500],.7,{bodyDepth:2.2,rarity:.12,color:0x8b9eac}),
 blueMackerel:fish('Blue mackerel','Scomber australasicus','tuna',[-45,-12],[12,25],[.15,1.2],[0,120],.3,{coastal:true}),
 yellowtail:fish('Yellowtail kingfish','Seriola lalandi','jack',[-45,-15],[14,25],[1,18],[0,120],.8,{coastal:true}),
 kahawai:fish('Kahawai','Arripis trutta','jack',[-48,-28],[8,22],[.4,4],[0,80],.5,{coastal:true}),
 skipjack:fish('Skipjack tuna','Katsuwonus pelamis','tuna',[-35,20],[18,30],[.5,8],[0,200],.65),
 yellowfin:fish('Yellowfin tuna','Thunnus albacares','tuna',[-35,25],[18,31],[2,45],[0,250],.95,{finScale:1.2}),
 bigeye:fish('Bigeye tuna','Thunnus obesus','tuna',[-40,25],[10,29],[2,40],[40,500],.9,{rarity:.25}),
 mahi:fish('Mahi-mahi','Coryphaena hippurus','mahi',[-35,25],[20,31],[1,18],[0,80],.8),
 wahoo:fish('Wahoo','Acanthocybium solandri','barracuda',[-35,25],[20,30],[2,25],[0,150],.85),
 giantTrevally:fish('Giant trevally','Caranx ignobilis','jack',[-30,25],[22,31],[1,25],[0,80],.9,{coastal:true}),
 snapper:fish('Australasian snapper','Chrysophrys auratus','redSnapper',[-45,-18],[12,25],[.4,8],[5,200],.55,{coastal:true}),
 parrot:fish('Pacific steephead parrotfish','Chlorurus microrhinos','parrot',[-30,25],[23,31],[.3,3],[1,30],.35,{reef:true}),
 fusilier:fish('Blue-and-gold fusilier','Caesio caerulaurea','yellowtail',[-30,25],[23,31],[.1,.6],[1,40],.2,{reef:true})
};
export function oceanTemperature(lat,month=0){const seasonal=Math.cos((month-1)*Math.PI/6)*(lat<0?1:-1)*2;return Math.max(1,29-Math.abs(lat)*.38+seasonal);}
export function habitatWeights({lat=-49,lng=-123,temperature=oceanTemperature(lat),depth=3000,coastKm=1000,reef=false,lureDepth=2,hour=12}={}){const out={};if(depth<.5||!(lng<=-67||lng>=120))return out;for(const [id,f]of Object.entries(FISH)){if(lat<f.lat[0]||lat>f.lat[1]||temperature<f.temp[0]||temperature>f.temp[1]||depth<f.depth[0]||lureDepth>depth||lureDepth<f.depth[0]||lureDepth>f.depth[1]||(f.coastal&&coastKm>60)||(f.reef&&!reef))continue;out[id]=(f.rarity??1)*(f.coastal?1:coastKm<3?.25:1)*(hour<5||hour>20?.7:1);}return out;}
export function chooseFish(context,rng=Math.random){const weights=Object.entries(habitatWeights(context));let sum=weights.reduce((a,[,v])=>a+v,0),n=rng()*sum;if(!sum)return null;for(const [id,w]of weights){n-=w;if(n<=0)return id;}return weights.at(-1)?.[0]??null;}
export function rollFish(id,rng=Math.random){const f=FISH[id],kg=f.kg[0]+(f.kg[1]-f.kg[0])*rng()**2.5;return{id,kg,cm:Math.pow(kg*1000/f.lw[0],1/f.lw[1])};}
export const RIGS=[{depth:2,label:'Surface float · 2 m'},{depth:40,label:'Deep drift · 40 m'}];
/** Which rigs can raise a bite here, and a plain explanation when the chosen one cannot. */
export function rigAdvice(context={},rigs=RIGS){
 const byRig=rigs.map(r=>({...r,weights:habitatWeights({...context,lureDepth:r.depth})}));
 const chosen=byRig.find(r=>r.depth===context.lureDepth)??byRig[0],ok=Object.keys(chosen.weights).length>0;
 const alternatives=byRig.filter(r=>r!==chosen&&Object.keys(r.weights).length);
 let reason='';
 if(!ok){
  const lng=context.lng??-123,depth=context.depth??3000;
  if(depth<.5)reason='The boat is aground or in water too shallow to fish.';
  else if(!(lng<=-67||lng>=120))reason='The fishing catalogue covers the Pacific only. There are no catalogued species for this water.';
  else if(context.lureDepth>depth)reason=`The water here is only about ${Math.round(depth)} m deep, too shallow for the ${chosen.label.toLowerCase()} rig.`;
  else if(alternatives.length)reason=`Nothing in the catalogue feeds at ${chosen.depth} m here. Switch to the ${alternatives[0].label.toLowerCase()} rig.`;
  else reason='None of the catalogued species is found in water this cold or this far from their range. Try again after the boat moves.';
 }
 return{ok,rig:chosen.depth,weights:chosen.weights,suggest:ok?null:alternatives[0]?.depth??null,reason,species:Object.keys(chosen.weights)};
}
export function pickWeighted(weights={},rng=Math.random){const entries=Object.entries(weights).filter(([id,w])=>FISH[id]&&w>0);if(!entries.length)return null;let n=rng()*entries.reduce((a,[,w])=>a+w,0);for(const [id,w]of entries){n-=w;if(n<=0)return id;}return entries.at(-1)[0];}

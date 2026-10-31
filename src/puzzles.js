// The puzzle book's two puzzles, both new each day (UTC) and the same for everyone on that day:
// a five-letter word to find in six guesses, and a criss-cross puzzle of sea and sailing words.
// Pure logic, no DOM, so the tests can play them.

const SKIP=new Set(['dicey','tunas','wader','abode','meter','honor','valor']);
// Answers for the five-letter word: everyday words and words from the sea and sky.
export const WORDS=`ocean swell tides shore beach coral atoll brine salty whale shark squid prawn trout perch skate manta eagle heron crane gulls
waves storm cloud rainy windy gusty sunny misty foggy north south chart route coast inlet cliff dunes sails ropes knots cleat hatch stern
cabin yacht ketch canoe barge kayak pilot float drift light lamps flare beams stars orbit comet lunar solar polar night today relax
apple bread chair table house green brown white black amber ivory olive peach lemon mango melon grape berry heart smile laugh happy quiet
peace dream sleep music radio piano flute story words river creek brook lakes stone rocks sandy pearl shell crabs flags cargo crate trade
wheel gauge spray foamy froth depth sonar radar range ridge gales earth world globe haven docks jetty wharf buoys lunch dinner
spoon plate knife glass water drink cocoa toast honey sugar spice salad pasta bacon cream tease? fresh
morning? sweet mount ridge field grass plant trees maple cedar birch palms reeds bloom petal daisy lilac tulip roses fruit seeds
sound noise voice songs tunes chord notes drums verse rhyme poems novel pages books cover title quote ideas think guess solve clues
board games cards dicey? chess check queen kings rooks tiles blank score point total count sixty seven eight forty fifty
brave proud noble loyal crisp clean clear plain fancy grand great large small short tight loose round sharp blunt sleek
early later delay hours watch clock timer alarm dusky? sunny tidal? rough gentle? still? steady? smooth? quick swift rapid
dance learn teach write print paint sketch? craft build shape carve weave knead stack store share carry bring fetch throw catch
fishy? reels lines baits hooks lures marlin? tunas? bites? wader? grill smoke flame ember coals ashes spark torch candle?
abode? camps? tents hiker trail paths roads miles metre? meter? scale weigh heavy light? lighter?
pride faith trust honor? valor? charm grace bliss cheer jolly merry`.split(/\s+/).map(w=>w.replace(/\?$/,'')).filter((w,i,a)=>/^[a-z]{5}$/.test(w)&&a.indexOf(w)===i&&!SKIP.has(w));

// Criss-cross entries: answer and clue. Answers are letters only.
export const ENTRIES=[
 ['anchor','It holds a boat in place on the sea floor'],['harbour','Sheltered water where boats moor'],['compass','It points the way north'],
 ['sextant','Instrument for measuring the angle of the sun above the horizon'],['horizon','Where the sea meets the sky'],['current','A river within the ocean'],
 ['tide','It rises and falls twice a day'],['swell','Long, smooth waves from a distant storm'],['breeze','A gentle wind'],['squall','A sudden, short storm at sea'],
 ['mast','The tall spar that carries a sail'],['keel','The backbone along the bottom of a hull'],['rudder','The blade that steers a boat'],['tiller','The handle that turns a small boat\'s rudder'],
 ['bow','The front of a boat'],['stern','The back of a boat'],['port','Left, when facing forward on a boat'],['starboard','Right, when facing forward on a boat'],
 ['galley','A ship\'s kitchen'],['cabin','A room on a boat'],['hull','The main body of a boat'],['deck','The floor you walk on aboard'],
 ['oar','A pole with a blade for rowing'],['paddle','Shorter than an oar, used without a rowlock'],['knot','A nautical mile per hour'],['buoy','A floating marker'],
 ['lighthouse','A tower whose beam warns ships of danger'],['atoll','A ring-shaped coral island'],['lagoon','Calm water inside a reef'],['reef','A ridge of coral or rock just under the surface'],
 ['coral','Living builder of tropical reefs'],['island','Land surrounded by water'],['pacific','The largest ocean'],['equator','The line of zero latitude'],
 ['latitude','Distance north or south, in degrees'],['longitude','Distance east or west, in degrees'],['meridian','A line from pole to pole'],['tropic','Capricorn or Cancer'],
 ['whale','The largest animal that has ever lived is one'],['dolphin','A playful marine mammal that rides bow waves'],['albatross','A great seabird that glides for days without flapping'],['petrel','A small seabird that seems to walk on water'],
 ['tuna','A fast, warm-bodied fish that never stops swimming'],['marlin','A billfish with a spear for a snout'],['swordfish','It hunts with a long, flat blade'],['squid','A ten-armed swimmer that squirts ink'],
 ['plankton','Tiny drifting life at the base of the food chain'],['krill','Small shrimp-like food of the great whales'],['kelp','A giant seaweed that grows in underwater forests'],['shell','A mollusc\'s hard home'],
 ['sail','Cloth that catches the wind'],['jib','A triangular sail ahead of the mast'],['boom','The spar along the foot of a sail'],['rigging','All the ropes and wires that hold up a mast'],
 ['halyard','The line that hoists a sail'],['sheet','The line that trims a sail'],['cleat','A fitting a rope is made fast to'],['bowline','A knot that forms a fixed loop'],
 ['mooring','A permanent anchor and buoy to tie up to'],['dinghy','A small boat carried by a bigger one'],['canoe','A light, narrow boat paddled by hand'],['kayak','A covered canoe paddled with a double blade'],
 ['voyage','A long journey by sea'],['ashore','On or toward land'],['aground','Stuck on the bottom'],['adrift','Floating without power or anchor'],
 ['navigate','Find the way across the sea'],['chart','A map for sailors'],['logbook','Where a ship\'s journey is recorded'],['beacon','A light or signal to guide ships'],
 ['sonar','Finding things underwater with sound'],['radar','Finding things above the water with radio waves'],['mayday','A spoken distress call'],['flare','A bright signal fired into the sky'],
 ['lifejacket','It keeps you afloat'],['oilskin','A waterproof sailor\'s coat'],['sunrise','The day\'s first light'],['sunset','When the sun goes down'],
 ['twilight','The glow after sunset'],['moonlight','Silver light on night water'],['starlight','Light from distant suns'],['southern','Cross in the night sky below the equator'],
 ['trades','The steady tropical winds that sailors relied on'],['doldrums','Calm belt near the equator'],['typhoon','A Pacific hurricane'],['monsoon','A seasonal wind that brings rain'],
 ['rainbow','Colours after the rain'],['spray','Wind-blown water off the waves'],['foam','White froth on a breaking wave'],['wake','The trail a boat leaves behind it'],
 ['depth','How deep the water is'],['fathom','Six feet of water'],['trench','The deepest part of the ocean floor'],['seamount','An underwater mountain'],
 ['salt','What makes the sea taste of the sea'],['brine','Very salty water'],['coast','Where land meets the sea'],['shore','The edge of the land by the water'],
 ['beach','Sand at the water\'s edge'],['cove','A small sheltered bay'],['bay','A broad curve of coastline'],['inlet','A narrow arm of the sea'],
 ['cargo','Goods carried by a ship'],['freighter','A ship that carries goods'],['captain','The person in command of a ship'],['crew','The people who sail a ship'],
 ['bosun','The officer in charge of the deck and rigging'],['helm','The wheel or tiller, and the job of steering'],['galleon','An old Spanish sailing ship'],['schooner','A sailing ship with two or more masts']
].map(([w,c])=>[w.toUpperCase(),c]);

// ---- seeded randomness
export function dayNumber(now=Date.now()){return Math.floor(now/864e5);}
export function seeded(seed){let a=seed>>>0||1;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// ---- five-letter word
export function wordOfDay(day=dayNumber(),words=WORDS){
 // a fixed shuffle so consecutive days are unrelated, and each word comes round once per cycle
 const order=words.map((_,i)=>i),r=seeded(0x5ea);for(let i=order.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 return words[order[((day%words.length)+words.length)%words.length]].toUpperCase();
}
/** Marks each letter of a guess: 'hit' (right place), 'near' (in the word elsewhere) or 'miss'. Repeated letters count only as often as they appear. */
export function scoreGuess(guess,answer){
 guess=guess.toUpperCase();answer=answer.toUpperCase();const out=Array(5).fill('miss'),left={};
 for(let i=0;i<5;i++){if(guess[i]===answer[i])out[i]='hit';else left[answer[i]]=(left[answer[i]]||0)+1;}
 for(let i=0;i<5;i++)if(out[i]!=='hit'&&left[guess[i]]>0){out[i]='near';left[guess[i]]--;}
 return out;
}

// ---- criss-cross
/** Places words on a grid where they cross. Returns {width,height,words:[{answer,clue,row,col,dir,number}],cells}. */
export function buildCrissCross(day=dayNumber(),{entries=ENTRIES,target=10,maxSize=13}={}){
 const r=seeded(day*7919+13),pool=entries.filter(([w])=>w.length>=3&&w.length<=maxSize).slice();
 for(let i=pool.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
 const grid=new Map(),key=(y,x)=>y+','+x,placed=[];
 const at=(y,x)=>grid.get(key(y,x));
 const fits=(w,y,x,dir)=>{
  const dy=dir==='down'?1:0,dx=dir==='across'?1:0;let crosses=0;
  if(at(y-dy,x-dx)||at(y+dy*w.length,x+dx*w.length))return -1;
  for(let i=0;i<w.length;i++){const cy=y+dy*i,cx=x+dx*i,c=at(cy,cx);
   if(c){if(c.ch!==w[i]||c[dir])return -1;crosses++;}
   else if(at(cy+dx,cx+dy)||at(cy-dx,cx-dy))return -1;} // no side-by-side letters
  return crosses;};
 const bounds=()=>{let y0=1e9,y1=-1e9,x0=1e9,x1=-1e9;for(const k of grid.keys()){const [y,x]=k.split(',').map(Number);y0=Math.min(y0,y);y1=Math.max(y1,y);x0=Math.min(x0,x);x1=Math.max(x1,x);}return{y0,y1,x0,x1};};
 const put=(w,clue,y,x,dir)=>{const dy=dir==='down'?1:0,dx=dir==='across'?1:0;for(let i=0;i<w.length;i++){const k=key(y+dy*i,x+dx*i),c=grid.get(k)||{ch:w[i]};c[dir]=true;grid.set(k,c);}placed.push({answer:w,clue,row:y,col:x,dir});};
 const first=pool.find(([w])=>w.length>=7&&w.length<=9)||pool[0];put(first[0],first[1],0,0,'across');
 for(const [w,clue]of pool){
  if(placed.length>=target)break;if(placed.some(p=>p.answer===w))continue;
  let best=null;
  for(const p of placed)for(let i=0;i<p.answer.length;i++)for(let j=0;j<w.length;j++){
   if(p.answer[i]!==w[j])continue;
   const dir=p.dir==='across'?'down':'across',y=p.dir==='across'?p.row-j:p.row+i,x=p.dir==='across'?p.col+i:p.col-j;
   const c=fits(w,y,x,dir);if(c<1)continue;
   const b=bounds(),ny0=Math.min(b.y0,y),nx0=Math.min(b.x0,x),ny1=Math.max(b.y1,y+(dir==='down'?w.length-1:0)),nx1=Math.max(b.x1,x+(dir==='across'?w.length-1:0));
   if(ny1-ny0+1>maxSize||nx1-nx0+1>maxSize)continue;
   const score=c*10-(ny1-ny0+nx1-nx0)+r();if(!best||score>best.score)best={y,x,dir,score};}
  if(best)put(w,clue,best.y,best.x,best.dir);
 }
 const b=bounds();for(const p of placed){p.row-=b.y0;p.col-=b.x0;}
 const width=b.x1-b.x0+1,height=b.y1-b.y0+1,cells=Array.from({length:height},()=>Array(width).fill(null));
 for(const p of placed)for(let i=0;i<p.answer.length;i++){const y=p.row+(p.dir==='down'?i:0),x=p.col+(p.dir==='across'?i:0);cells[y][x]=p.answer[i];}
 // number the starts in reading order
 const starts=[...new Set(placed.map(p=>p.row*100+p.col))].sort((a,b)=>a-b);
 for(const p of placed)p.number=starts.indexOf(p.row*100+p.col)+1;
 placed.sort((a,b)=>a.number-b.number||(a.dir==='across'?-1:1));
 return{width,height,words:placed,cells};
}

// Dimensions are metres, against the supplied 5.2 m rowing boat. Timing is active
// play time; preview buttons bypass scheduling and geographic habitat filters.
export const ENCOUNTERS={
 humpback:{label:'Humpback whale',length:15,speed:1.4,count:1,clearance:48,duration:105,period:27,skin:.8,blow:true},
 blue:{label:'Blue whale',length:27,speed:1.7,count:1,clearance:75,duration:135,period:40,skin:1.5,blow:true},
 orca:{label:'Female orca',length:6.5,speed:2.1,count:3,clearance:38,duration:100,period:15,skin:.5,blow:true},
 dolphin:{label:'Bottlenose dolphins',length:3.2,speed:3.3,count:4,clearance:20,duration:85,period:6.5,skin:.23},
 shark:{label:'Blacktip shark',length:2.2,speed:1.0,count:1,clearance:24,duration:90,period:22,skin:.15},
 cargo:{label:'Cargo ship',length:220,speed:7.2,count:1,clearance:1500,duration:340,skin:0}
};
export function habitatAllows(kind,{lat=0,nearestLand=Infinity}={}){if(kind==='shark')return Math.abs(lat)<32&&nearestLand<100000;if(kind==='dolphin')return Math.abs(lat)<46;if(kind==='blue')return Math.abs(lat)>18;return true;}
export const nextShipWait=random=>3600+random()*7200;
export function encounterDepth(kind,age,offset=0){const p=ENCOUNTERS[kind],phase=((age+offset)%p.period)/p.period;
 if(kind==='dolphin'){const arc=phase<.32?Math.sin(phase/.32*Math.PI):0;return -1.1+arc*1.65;}
 // Slow approach to the surface, a breathing interval, then a deliberate dive.
 const rise=x=>x*x*(3-2*x),surface=phase<.18?rise(phase/.18):phase<.52?1:phase<.78?1-rise((phase-.52)/.26):0;
 return -p.length*.32+(p.length*.32-p.skin)*surface;
}

export const encounterAlong=(age,startAge,spec,preview)=> (age-startAge)*spec.speed-(preview?0:spec.duration*.25*spec.speed);

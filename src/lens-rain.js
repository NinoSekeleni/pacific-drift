// A splash briefly wets the view with broken films, then leaves fine running drops.
// No opaque rings, spherical glass outlines or full-frame wave distortion.
import * as THREE from 'three';

export function createLensRain(renderer){
  const MAX=32,FILMS=4;
  const drops=Array.from({length:MAX},()=>({x:0,y:-2,r:0,age:0,ttl:0,v:0,vx:0,sliding:false,kind:'rain'}));
  const films=Array.from({length:FILMS},()=>({x:0,y:-2,r:0,age:0,ttl:0}));
  const packed=drops.map(()=>new THREE.Vector4(0,-2,0,0));
  const trails=drops.map(()=>new THREE.Vector4());
  const filmPacked=films.map(()=>new THREE.Vector4(0,-2,0,0));
  const target=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false});
  target.texture.minFilter=target.texture.magFilter=THREE.LinearFilter;
  target.texture.generateMipmaps=false;
  const uniforms={tScene:{value:target.texture},uDrops:{value:packed},uTrails:{value:trails},uPixel:{value:new THREE.Vector2(1/1280,1/720)},uFilms:{value:filmPacked},uAspect:{value:1},uLight:{value:0},uSheet:{value:0},uTime:{value:0}};
  const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`precision highp float;
      uniform sampler2D tScene;uniform vec4 uDrops[32],uFilms[4],uTrails[32];uniform vec2 uPixel;
      uniform float uAspect,uLight,uSheet,uTime;varying vec2 vUv;
      void main(){
        vec2 bend=vec2(0.);float wet=0.,glint=0.;
        for(int i=0;i<4;i++){
          vec4 film=uFilms[i];if(film.z<.001||film.w<.001)continue;
          float seed=float(i)*2.71;
          vec2 p=(vUv-film.xy)*vec2(uAspect,1.);
          vec2 q=p/vec2(film.z*(.72+.13*sin(seed)),film.z*1.8);
          if(abs(q.x)>2.||abs(q.y)>2.6)continue;
          // A broken, asymmetric film with soft edges; never a closed black rim.
          q.x+=.19*sin(q.y*3.+seed)+.08*sin(q.y*7.-seed);
          float field=exp(-dot(q,q)*1.5);
          float breaks=.58+.42*sin(q.x*4.+q.y*2.+seed)*sin(q.y*5.-seed);
          float mask=field*smoothstep(.14,.62,breaks)*film.w;
          wet=max(wet,mask);
          bend+=vec2(sin(q.y*4.+seed)*.004/uAspect,-.006)*mask;
          glint+=mask*pow(max(0.,sin(q.x*9.+sin(q.y*3.)+seed)),12.)*.06;
        }
        for(int i=0;i<32;i++){
          vec4 drop=uDrops[i];if(drop.z<.0001)continue;
          vec2 p=(vUv-drop.xy)*vec2(uAspect,1.);
          if(abs(p.x)>drop.z*1.5||abs(p.y)>drop.z*5.)continue;
          float seed=fract(sin(float(i)*19.7)*437.3);
          vec2 q=p/vec2(drop.z*(.76+seed*.25),drop.z*(1.1+seed*.7));
          q.x+=.10*sin(q.y*3.+seed*6.);
          float cap=exp(-dot(q,q)*3.2)*drop.w;
          // The running bead leaves a thin wet trail above it.
          vec4 motion=uTrails[i];float trailLength=max(drop.z*2.,motion.z);float lateral=p.x+p.y*motion.x/max(.012,motion.y)*uAspect;
          float trail=exp(-pow(lateral/max(.0002,drop.z*.28),2.))*smoothstep(0.,drop.z*.7,p.y)*(1.-smoothstep(drop.z,trailLength,p.y))*drop.w*motion.w*.42;
          bend+=vec2(q.x,-q.y)*cap*drop.z*.72*vec2(1./uAspect,1.);
          bend+=vec2(-lateral*.3/uAspect,.0005)*trail;
          wet=max(wet,cap*.62+trail);
          glint+=cap*pow(max(0.,q.y*.8-q.x*.3),3.)*.14;
          glint+=cap*exp(-pow((q.y-.32)/.12,2.))*exp(-pow((q.x+.20)/.22,2.))*.10;
        }
        vec2 uv=clamp(vUv+bend,vec2(.002),vec2(.998));
        vec3 source=texture2D(tScene,uv).rgb;
        // Defocus within wet patches, without bending the entire scene.
        vec2 stepUv=uPixel*(1.3+uSheet*3.2);
        vec3 soft=(texture2D(tScene,clamp(uv+vec2(stepUv.x,0.),.001,.999)).rgb+
                   texture2D(tScene,clamp(uv-vec2(stepUv.x,0.),.001,.999)).rgb+
                   texture2D(tScene,clamp(uv+vec2(0.,stepUv.y),.001,.999)).rgb+
                   texture2D(tScene,clamp(uv-vec2(0.,stepUv.y),.001,.999)).rgb)*.12+source*.28;
        soft+=(texture2D(tScene,clamp(uv+stepUv,.001,.999)).rgb+texture2D(tScene,clamp(uv-stepUv,.001,.999)).rgb+texture2D(tScene,clamp(uv+vec2(stepUv.x,-stepUv.y),.001,.999)).rgb+texture2D(tScene,clamp(uv+vec2(-stepUv.x,stepUv.y),.001,.999)).rgb)*.06;
        vec3 col=mix(source,soft,clamp(wet,0.,.85));
        col+=vec3(.72,.82,.9)*min(.035,glint)*(.22+.78*uLight);
        gl_FragColor=vec4(col,1.);
      }`});
  const scene=new THREE.Scene();scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),material));
  const camera=new THREE.Camera(),size=new THREE.Vector2();
  let cursor=0,filmCursor=0,budget=0,sheet=0,intensity=1.7,rainStrength=1,active=false;
  function resize(){renderer.getDrawingBufferSize(size);target.setSize(size.x,size.y);uniforms.uAspect.value=size.x/size.y;uniforms.uPixel.value.set(1/size.x,1/size.y);}
  resize();
  function add(x=Math.random(),y=Math.random(),r=.002+Math.random()*.004,kind='rain'){
    Object.assign(drops[cursor++%MAX],{x,y,r:Math.min(.012,r),age:0,ttl:4+Math.random()*5,v:.003+Math.random()*.004,vx:0,sliding:r>.0048,kind});
  }
  function splash(strength=1){
    const power=Math.min(4,strength*intensity);sheet=Math.min(1,sheet+power*.6);
    for(let i=0;i<Math.min(4,Math.ceil(power*1.4));i++){
      Object.assign(films[filmCursor++%FILMS],{x:[.32,.56,.79,.63][i]+(Math.random()-.5)*.12,y:[.68,.53,.42,.24][i]+(Math.random()-.5)*.10,r:.13+Math.random()*.06+power*.012,age:0,ttl:1.5+Math.random()*1.5});
    }
    for(let i=0;i<Math.min(MAX,Math.ceil(power*12));i++)add(.05+Math.random()*.9,.1+Math.random()*.8,.0025+Math.random()*.0065,'spray');
  }
  function update(dt,rain,wind,light,time,enabled=true,options={}){
    dt=Math.max(0,Math.min(.1,dt||0));const visible=enabled;
    uniforms.uTime.value=time;uniforms.uLight.value=light;
    if(enabled&&options.drops!==false){budget+=Math.max(0,rain)*rainStrength*dt*(5+Math.min(12,wind*.45));while(budget>=1){const large=Math.random()<.10;add(.04+Math.random()*.92,.1+Math.random()*.85,large?.0055+Math.random()*.0025:.0018+Math.random()*.0035);budget--;}}else budget=0;
    sheet*=Math.exp(-dt*2.2);uniforms.uSheet.value=sheet;active=false;
    for(let i=0;i<FILMS;i++){
      const f=films[i];f.age+=dt;
      if(f.age>=f.ttl){f.r=0;filmPacked[i].set(0,-2,0,0);continue;}
      f.y-=dt*.10;
      const fade=Math.min(1,f.age*18)*Math.pow(Math.max(0,1-f.age/f.ttl),1.25);
      filmPacked[i].set(f.x,f.y,f.r,fade);active=true;
    }
    const aspect=uniforms.uAspect.value;
    for(let i=0;i<MAX;i++){
      const d=drops[i];d.age+=dt;if(options.drops===false&&d.kind==='rain'){d.r=0;d.ttl=0;}
      if(d.age>=d.ttl||d.y<-.05){d.r=0;packed[i].set(0,-2,0,0);continue;}
      if(d.r>.0048||d.age>2.5+i%3)d.sliding=true;
      if(d.sliding)d.v=Math.min(.23,d.v+dt*(.012+d.r*5));
      d.vx+=(Math.sin(time*.8+i)*Math.min(15,wind)*.00025-d.vx)*Math.min(1,dt*3);
      d.y-=d.v*dt;d.x+=d.vx*dt;
      for(let j=i+1;j<MAX;j++){
        const other=drops[j];if(!other.r)continue;
        if(Math.hypot((d.x-other.x)*aspect,d.y-other.y)<(d.r+other.r)*.45){const a=d.r*d.r,b=other.r*other.r;d.x=(d.x*a+other.x*b)/(a+b);d.y=(d.y*a+other.y*b)/(a+b);d.r=Math.min(.012,Math.sqrt(a+b));d.v=Math.min(.23,d.v+.02);d.sliding=true;d.ttl=Math.max(d.ttl,d.age+2);other.r=0;other.ttl=0;}
      }
      const fade=Math.min(1,d.age*15)*Math.min(1,(d.ttl-d.age)*1.5);
      packed[i].set(d.x,d.y,d.r,fade);trails[i].set(d.vx,d.v,Math.min(.065,d.v*.35),d.sliding?1:0);active=true;
    }
    active=active&&visible;
  }
  return {resize,update,splash,clear(){for(const d of drops){d.r=0;d.ttl=0;}for(const f of films){f.r=0;f.ttl=0;}sheet=0;budget=0;active=false;},setRainStrength(v){rainStrength=Math.max(0,Math.min(2,v));},setIntensity(v){intensity=Math.max(.4,Math.min(3,v));},begin(){renderer.setRenderTarget(active?target:null);},render(){if(!active)return;renderer.setRenderTarget(null);renderer.render(scene,camera);},get active(){return active;},get dropCount(){return drops.filter(d=>d.r>0).length;}};
}

// Water on the view, and the final image pass.
//
// The scene is drawn into a half-float buffer so highlights brighter than white (sun glitter,
// the sun's disc, lightning) survive to a small glow pass and a soft shoulder, instead of
// clipping flat. Water on the view follows Tidewater's lens droplets (MIT, see shipped notices):
// each drop is a tiny lens that shows a blurred, upside-down view of the scene behind it, with a
// bright highlight and a darker rim. Small drops cling and dry; large ones slide and leave a thin
// wet trail. A splash lays down broken films first. No opaque rings or full-frame warping.
import * as THREE from 'three';

const MAX = 40, FILMS = 4;

export function createLensRain(renderer, {low = false} = {}) {
  const drops = Array.from({length: MAX}, () => ({x: 0, y: -2, r: 0, age: 0, ttl: 0, v: 0, vx: 0, sliding: false, kind: 'rain'}));
  const films = Array.from({length: FILMS}, () => ({x: 0, y: -2, r: 0, age: 0, ttl: 0}));
  const packed = drops.map(() => new THREE.Vector4(0, -2, 0, 0));
  const trails = drops.map(() => new THREE.Vector4());
  const filmPacked = films.map(() => new THREE.Vector4(0, -2, 0, 0));
  const gl = renderer.getContext?.();
  const hdr = !!(renderer.capabilities?.isWebGL2 && gl && (gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')));
  const type = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
  const makeTarget = depth => {
    const t = new THREE.WebGLRenderTarget(1, 1, {depthBuffer: depth, stencilBuffer: false, type});
    t.texture.minFilter = t.texture.magFilter = THREE.LinearFilter; t.texture.generateMipmaps = false;
    return t;
  };
  const target = makeTarget(true);
  // Glow: bright pass at a quarter size, then two further halvings, each softened on the way down.
  const glow = [makeTarget(false), makeTarget(false), makeTarget(false)];
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const glowScene = new THREE.Scene(); glowScene.add(quad);
  const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
  const brightPass = new THREE.ShaderMaterial({depthTest: false, depthWrite: false, uniforms: {tSource: {value: null}, uTexel: {value: new THREE.Vector2()}, uThreshold: {value: hdr ? 1.0 : .92}},
    vertexShader, fragmentShader: `precision highp float;uniform sampler2D tSource;uniform vec2 uTexel;uniform float uThreshold;varying vec2 vUv;
      vec3 tap(vec2 o){vec3 c=texture2D(tSource,vUv+o*uTexel).rgb;float l=max(c.r,max(c.g,c.b));return c*max(0.,l-uThreshold)/max(l,1e-4);}
      void main(){vec3 c=(tap(vec2(-1.,-1.))+tap(vec2(1.,-1.))+tap(vec2(-1.,1.))+tap(vec2(1.,1.)))*.25;gl_FragColor=vec4(min(c,vec3(24.)),1.);}`});
  const downPass = new THREE.ShaderMaterial({depthTest: false, depthWrite: false, uniforms: {tSource: {value: null}, uTexel: {value: new THREE.Vector2()}},
    vertexShader, fragmentShader: `precision highp float;uniform sampler2D tSource;uniform vec2 uTexel;varying vec2 vUv;
      void main(){vec3 c=texture2D(tSource,vUv).rgb*.25;
      c+=(texture2D(tSource,vUv+vec2(-1.5,-1.5)*uTexel).rgb+texture2D(tSource,vUv+vec2(1.5,-1.5)*uTexel).rgb+texture2D(tSource,vUv+vec2(-1.5,1.5)*uTexel).rgb+texture2D(tSource,vUv+vec2(1.5,1.5)*uTexel).rgb)*.1875;
      gl_FragColor=vec4(c,1.);}`});

  const uniforms = {tScene: {value: target.texture}, tGlow0: {value: glow[0].texture}, tGlow1: {value: glow[1].texture}, tGlow2: {value: glow[2].texture}, uGlow: {value: hdr ? .55 : .3},
    uDrops: {value: packed}, uTrails: {value: trails}, uPixel: {value: new THREE.Vector2(1 / 1280, 1 / 720)}, uFilms: {value: filmPacked}, uAspect: {value: 1}, uLight: {value: 0}, uSheet: {value: 0}, uTime: {value: 0}, uHeat: {value: 0}, uSun: {value: new THREE.Vector2(-10, -10)}, uWater: {value: 1}};
  const material = new THREE.ShaderMaterial({depthTest: false, depthWrite: false, uniforms, vertexShader,
    fragmentShader: `precision highp float;
      uniform sampler2D tScene,tGlow0,tGlow1,tGlow2;uniform float uGlow;uniform vec4 uDrops[${MAX}],uFilms[${FILMS}],uTrails[${MAX}];uniform vec2 uPixel,uSun;
      uniform float uAspect,uLight,uSheet,uTime,uHeat,uWater;varying vec2 vUv;
      vec3 blurred(vec2 uv,float r){vec2 s=uPixel*r;uv=clamp(uv,vec2(.002),vec2(.998));
        return texture2D(tScene,uv).rgb*.2+(texture2D(tScene,clamp(uv+vec2(s.x,0.),.001,.999)).rgb+texture2D(tScene,clamp(uv-vec2(s.x,0.),.001,.999)).rgb+texture2D(tScene,clamp(uv+vec2(0.,s.y),.001,.999)).rgb+texture2D(tScene,clamp(uv-vec2(0.,s.y),.001,.999)).rgb)*.14
          +(texture2D(tScene,clamp(uv+s,.001,.999)).rgb+texture2D(tScene,clamp(uv-s,.001,.999)).rgb+texture2D(tScene,clamp(uv+vec2(s.x,-s.y),.001,.999)).rgb+texture2D(tScene,clamp(uv+vec2(-s.x,s.y),.001,.999)).rgb)*.06;}
      void main(){
        vec2 bend=vec2(0.);float wet=0.,glint=0.;
        float lensCap=0.,lensRim=0.,lensHighlight=0.;vec2 lensUV=vUv;
        if(uWater>.5){
        for(int i=0;i<${FILMS};i++){
          vec4 film=uFilms[i];if(film.z<.001||film.w<.001)continue;
          float seed=float(i)*2.71;
          vec2 p=(vUv-film.xy)*vec2(uAspect,1.);
          vec2 q=p/vec2(film.z*(.72+.13*sin(seed)),film.z*1.8);
          if(abs(q.x)>2.||abs(q.y)>2.6)continue;
          q.x+=.19*sin(q.y*3.+seed)+.08*sin(q.y*7.-seed);
          float field=exp(-dot(q,q)*1.5);
          float breaks=.58+.42*sin(q.x*4.+q.y*2.+seed)*sin(q.y*5.-seed);
          float mask=field*smoothstep(.14,.62,breaks)*film.w;
          wet=max(wet,mask);
          bend+=vec2(sin(q.y*4.+seed)*.004/uAspect,-.006)*mask;
          glint+=mask*pow(max(0.,sin(q.x*9.+sin(q.y*3.)+seed)),12.)*.06;
        }
        for(int i=0;i<${MAX};i++){
          vec4 drop=uDrops[i];if(drop.z<.0001)continue;
          vec2 p=(vUv-drop.xy)*vec2(uAspect,1.);
          if(abs(p.x)>drop.z*1.5||abs(p.y)>drop.z*5.)continue;
          float seed=fract(sin(float(i)*19.7)*437.3);
          vec2 q=p/vec2(drop.z*(.80+seed*.22),drop.z*(1.0+seed*.5));
          q.x+=.08*sin(q.y*3.+seed*6.);
          float rq=length(q);
          float cap=(1.-smoothstep(.78,1.,rq))*drop.w;
          vec4 motion=uTrails[i];float trailLength=max(drop.z*2.,motion.z);float lateral=p.x+p.y*motion.x/max(.012,motion.y)*uAspect;
          float trail=exp(-pow(lateral/max(.0002,drop.z*.26),2.))*smoothstep(0.,drop.z*.7,p.y)*(1.-smoothstep(drop.z,trailLength,p.y))*drop.w*motion.w*.42;
          bend+=vec2(-lateral*.3/uAspect,.0005)*trail;
          wet=max(wet,trail);
          if(cap>lensCap){
            // A drop is a small lens: it shows an inverted, wide view of what lies behind it.
            lensCap=cap;lensUV=drop.xy-(vUv-drop.xy)*7.;
            lensRim=smoothstep(.5,.95,rq);
            lensHighlight=exp(-dot(q-vec2(-.32,.38),q-vec2(-.32,.38))*26.)+exp(-dot(q-vec2(.25,-.45),q-vec2(.25,-.45))*60.)*.35;
          }
        }
        }
        float horizon=exp(-pow((vUv.y-.49)/.16,2.));
        bend+=vec2(sin(vUv.y*220.+uTime*2.4)*.00025, sin(vUv.x*130.+uTime*1.7)*.00035)*horizon*uHeat;
        vec2 uv=clamp(vUv+bend,vec2(.002),vec2(.998));
        vec3 source=texture2D(tScene,uv).rgb;
        vec3 col=mix(source,blurred(uv,1.3+uSheet*3.2),clamp(wet,0.,.85));
        if(lensCap>.01){
          vec3 lens=blurred(lensUV,2.6)*(1.-lensRim*.42)*vec3(.97,.99,1.02);
          lens+=vec3(1.,.99,.96)*lensHighlight*(.35+.9*uLight);
          col=mix(col,lens,lensCap*.94);
        }
        col=mix(col,col*vec3(1.07,1.025,.96)+vec3(.018,.014,.006)*horizon,clamp(uHeat,0.,1.));
        float glare=exp(-length((vUv-uSun)*vec2(uAspect,1.))*4.)*uHeat;col=mix(col,vec3(1.,.965,.85),min(.26,glare*.26));
        col+=vec3(.72,.82,.9)*min(.035,glint)*(.22+.78*uLight);
        // Glow from highlights brighter than white, then a soft shoulder so they bloom, not clip.
        col+=(texture2D(tGlow0,vUv).rgb*.5+texture2D(tGlow1,vUv).rgb*.32+texture2D(tGlow2,vUv).rgb*.22)*uGlow;
        vec3 over=max(col-.82,0.);col=min(col,.82)+.18*(1.-exp(-over/.18));
        gl_FragColor=vec4(col,1.);
      }`});
  const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const camera = new THREE.Camera(), size = new THREE.Vector2();
  let cursor = 0, filmCursor = 0, budget = 0, sheet = 0, intensity = 1.7, rainStrength = 1, dropsActive = false, post = hdr, heatActive = false;
  function resize() {
    renderer.getDrawingBufferSize(size); target.setSize(size.x, size.y);
    const div = low ? [6, 12, 24] : [4, 8, 16];
    glow.forEach((t, i) => t.setSize(Math.max(1, Math.round(size.x / div[i])), Math.max(1, Math.round(size.y / div[i]))));
    uniforms.uAspect.value = size.x / size.y; uniforms.uPixel.value.set(1 / size.x, 1 / size.y);
  }
  resize();
  function add(x = Math.random(), y = Math.random(), r = .002 + Math.random() * .004, kind = 'rain') {
    if (!(x > -.05 && x < 1.05 && y > -.05 && y < 1.05)) return;
    Object.assign(drops[cursor++ % MAX], {x, y, r: Math.min(.012, r), age: 0, ttl: 4 + Math.random() * 5, v: .003 + Math.random() * .004, vx: 0, sliding: r > .0048, kind});
  }
  function splash(strength = 1) {
    const power = Math.min(4, strength * intensity); sheet = Math.min(1, sheet + power * .6);
    for (let i = 0; i < Math.min(4, Math.ceil(power * 1.4)); i++) {
      Object.assign(films[filmCursor++ % FILMS], {x: [.32, .56, .79, .63][i] + (Math.random() - .5) * .12, y: [.68, .53, .42, .24][i] + (Math.random() - .5) * .10, r: .13 + Math.random() * .06 + power * .012, age: 0, ttl: 1.5 + Math.random() * 1.5});
    }
    for (let i = 0; i < Math.min(MAX, Math.ceil(power * 12)); i++) add(.05 + Math.random() * .9, .1 + Math.random() * .8, .0025 + Math.random() * .0065, 'spray');
  }
  function update(dt, rain, wind, light, time, enabled = true, options = {}) {
    dt = Math.max(0, Math.min(.1, dt || 0));
    uniforms.uTime.value = time; uniforms.uLight.value = light; uniforms.uHeat.value = enabled ? Math.max(0, options.heat || 0) : 0; uniforms.uSun.value.set(options.sun?.x ?? -10, options.sun?.y ?? -10);
    uniforms.uWater.value = enabled ? 1 : 0;
    if (enabled && options.drops !== false) { budget += Math.max(0, rain) * rainStrength * dt * (10 + Math.min(24, wind * .8)); while (budget >= 1) { const large = Math.random() < .25; add(.04 + Math.random() * .92, .1 + Math.random() * .85, large ? .0055 + Math.random() * .0025 : .0018 + Math.random() * .0035); budget--; } } else budget = 0;
    if (enabled && options.drops !== false && rain > .7 && wind > 16 && Math.random() < dt * rain * .8) splash(.22 + rain * .22);
    sheet *= Math.exp(-dt * 2.2); uniforms.uSheet.value = sheet; dropsActive = false;
    for (let i = 0; i < FILMS; i++) {
      const f = films[i]; f.age += dt;
      if (f.age >= f.ttl) { f.r = 0; filmPacked[i].set(0, -2, 0, 0); continue; }
      f.y -= dt * .10;
      const fade = Math.min(1, f.age * 18) * Math.pow(Math.max(0, 1 - f.age / f.ttl), 1.25);
      filmPacked[i].set(f.x, f.y, f.r, fade); dropsActive = true;
    }
    const aspect = uniforms.uAspect.value;
    for (let i = 0; i < MAX; i++) {
      const d = drops[i]; d.age += dt; if (options.drops === false && d.kind === 'rain') { d.r = 0; d.ttl = 0; }
      if (d.age >= d.ttl || d.y < -.05) { d.r = 0; packed[i].set(0, -2, 0, 0); continue; }
      if (d.r > .0048 || d.age > 2.5 + i % 3) d.sliding = true;
      // Small clinging drops dry slowly; sliding ones gather speed.
      if (!d.sliding) d.r *= Math.exp(-dt * .05);
      if (d.sliding) d.v = Math.min(.23, d.v + dt * (.012 + d.r * 5));
      d.vx += (Math.sin(time * .8 + i) * Math.min(15, wind) * .00025 - d.vx) * Math.min(1, dt * 3);
      d.y -= (d.sliding ? d.v : 0) * dt; d.x += d.vx * dt;
      for (let j = i + 1; j < MAX; j++) {
        const other = drops[j]; if (!other.r) continue;
        if (Math.hypot((d.x - other.x) * aspect, d.y - other.y) < (d.r + other.r) * .45) { const a = d.r * d.r, b = other.r * other.r; d.x = (d.x * a + other.x * b) / (a + b); d.y = (d.y * a + other.y * b) / (a + b); d.r = Math.min(.012, Math.sqrt(a + b)); d.v = Math.min(.23, d.v + .02); d.sliding = true; d.ttl = Math.max(d.ttl, d.age + 2); other.r = 0; other.ttl = 0; }
      }
      const fade = Math.min(1, d.age * 15) * Math.min(1, (d.ttl - d.age) * 1.5);
      packed[i].set(d.x, d.y, d.r, fade); trails[i].set(d.vx, d.v, Math.min(.065, d.v * .35), d.sliding ? 1 : 0); dropsActive = true;
    }
    heatActive = uniforms.uHeat.value > .001;
    dropsActive = dropsActive && enabled;
  }
  function runGlow() {
    const previous = renderer.getRenderTarget?.() ?? null;
    quad.material = brightPass; brightPass.uniforms.tSource.value = target.texture; brightPass.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    renderer.setRenderTarget(glow[0]); renderer.render(glowScene, camera);
    quad.material = downPass;
    for (let i = 1; i < glow.length; i++) {
      downPass.uniforms.tSource.value = glow[i - 1].texture; downPass.uniforms.uTexel.value.set(1 / glow[i - 1].width, 1 / glow[i - 1].height);
      renderer.setRenderTarget(glow[i]); renderer.render(glowScene, camera);
    }
    renderer.setRenderTarget(previous);
  }
  const usingTarget = () => post || dropsActive || heatActive;
  return {
    resize, update, splash,
    /** Drop that reached the view (screen x, y in 0..1, radius as a fraction of the height). */
    addDrop(x, y, r = .003) { add(x, y, r, 'spray'); },
    clear() { for (const d of drops) { d.r = 0; d.ttl = 0; } for (const f of films) { f.r = 0; f.ttl = 0; } sheet = 0; budget = 0; dropsActive = false; },
    setRainStrength(v) { rainStrength = Math.max(0, Math.min(2, v)); }, setIntensity(v) { intensity = Math.max(.4, Math.min(3, v)); },
    setPost(on) { post = !!on && hdr; }, setGlow(v) { uniforms.uGlow.value = Math.max(0, v); },
    begin() { renderer.setRenderTarget(usingTarget() ? target : null); },
    render() { if (!usingTarget()) return; if (post) runGlow(); else uniforms.uGlow.value = 0; renderer.setRenderTarget(null); renderer.render(scene, camera); },
    get active() { return dropsActive; }, get hdr() { return hdr; },
    get dropCount() { return drops.filter(d => d.r > 0).length; }
  };
}

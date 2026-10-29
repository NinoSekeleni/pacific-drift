// Foam field adapted from Ultra-Water, Copyright (c) 2026 Humpalumps, MIT.
// Full licence and inherited notices: public/textures/licenses/Ultra-Water-*.
// Only the standalone foam bake is ported; no FFT/physics/pipeline replacement.
import * as THREE from 'three';
const FOAM = /* glsl */`
precision highp float;
varying vec2 vUv;

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
// tileable voronoi: cell ids wrap at period
vec2 voronoi(vec2 p, float period) {
  vec2 i = floor(p), f = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y);
    vec2 o = hash22(mod(i + g, period));
    float d = length(g + o - f);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return vec2(f1, f2);
}
// cauliflower whitewater: every voronoi cell bulges (dome over the distance to its
// edge, creased where cells meet), at three scales
float billow(vec2 uv) {
  vec2 a = voronoi(uv * 7.0 + 0.3, 7.0), b = voronoi(uv * 17.0 + 0.7, 17.0), c = voronoi(uv * 41.0 + 0.1, 41.0);
  return 0.5 * sqrt(clamp((a.y - a.x) * 2.2, 0.0, 1.0)) + 0.32 * sqrt(clamp((b.y - b.x) * 2.2, 0.0, 1.0))
       + 0.18 * sqrt(clamp((c.y - c.x) * 2.2, 0.0, 1.0));
}
void main() {
  vec2 a = voronoi(vUv * 9.0, 9.0);
  vec2 b = voronoi(vUv * 23.0 + 0.5, 23.0);
  vec2 c = voronoi(vUv * 61.0, 61.0);
  float lace = 1.0 - smoothstep(0.0, 0.22, a.y - a.x);
  float fine = 1.0 - smoothstep(0.0, 0.16, b.y - b.x);
  float bubbles = (1.0 - smoothstep(0.15, 0.55, c.x));
  float v = lace * 0.55 + fine * 0.3 + bubbles * 0.25 + (1.0 - a.x) * 0.25;
  const float e = 1.0 / 1024.0;
  vec2 g = vec2(billow(vUv + vec2(e, 0.0)) - billow(vUv - vec2(e, 0.0)), billow(vUv + vec2(0.0, e)) - billow(vUv - vec2(0.0, e))) / (2.0 * e);
  gl_FragColor = vec4(clamp(v * 0.85, 0.0, 1.0), billow(vUv), clamp(0.5 + g / 64.0, 0.0, 1.0));
}`;
export function bakeMarineFoam(renderer){
 const target=new THREE.WebGLRenderTarget(512,512,{wrapS:THREE.RepeatWrapping,wrapT:THREE.RepeatWrapping,minFilter:THREE.LinearMipmapLinearFilter,magFilter:THREE.LinearFilter,generateMipmaps:true,depthBuffer:false});
 target.texture.name='Ultra-Water foam lace and billow';
 const mat=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:FOAM});
 const scene=new THREE.Scene(),quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),mat);scene.add(quad);
 const previous=renderer.getRenderTarget();
 try{renderer.setRenderTarget(target);renderer.clear();renderer.render(scene,new THREE.Camera());}
 finally{renderer.setRenderTarget(previous);quad.geometry.dispose();mat.dispose();}
 return target;
}

// WebGL adaptation of Tidewater's procedural tackle. Original code: public/licenses/tidewater-MIT.txt.
import * as T from 'three';
export const PAT={plain:0,wood:1,cloth:2,skin:3,cork:4,rusty:5,woodX:6,woodZ:7,carbon:8,thread:9,eva:10,braid:11,machined:12,knurl:13,rubber:14};
export function createPropMaterial(name='prop'){
 const rod=name==='fishingRod',m=new T.MeshPhysicalMaterial({vertexColors:true,roughness:.48,metalness:.2,clearcoat:rod?.5:0});
 m.uniforms={rodBend:{value:new T.Vector4()},rodShape:{value:new T.Vector4(3,0,0,0)},reelAnim:{value:new T.Vector4()},reelAnim2:{value:new T.Vector4(0,1,0,0)}};
 m.onBeforeCompile=s=>{Object.assign(s.uniforms,m.uniforms);s.vertexShader=s.vertexShader.replace('#include <common>',`#include <common>\nattribute vec4 aux;varying vec4 vTackle;uniform vec4 rodBend,rodShape,reelAnim,reelAnim2;`);s.vertexShader=s.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>\nvTackle=aux;${rod?`
 float part=aux.w;vec3 pivot=vec3(0.,.403,-.092);
 if(part>.5){
 if(part<2.5){if(part>1.5){float a=-reelAnim.y*1.95;vec3 q=transformed-pivot;transformed=pivot+vec3(q.x,q.y*cos(a)-q.z*sin(a),q.y*sin(a)+q.z*cos(a));}vec3 q=transformed-vec3(0.,0.,-.092);float a=reelAnim.x;transformed=vec3(q.x*cos(a)+q.z*sin(a),q.y,-q.x*sin(a)+q.z*cos(a))+vec3(0.,0.,-.092);}
 else if(part<3.5){vec3 c=vec3(0.,.327,-.092),q=transformed-c;float a=reelAnim.z;transformed=c+vec3(q.x,q.y*cos(a)-q.z*sin(a),q.y*sin(a)+q.z*cos(a));}
 else{float a=reelAnim.w;vec3 q=transformed-vec3(0.,0.,-.092);transformed=vec3(q.x*cos(a)+q.z*sin(a),q.y+reelAnim2.x,-q.x*sin(a)+q.z*cos(a))+vec3(0.,0.,-.092);}}
 float y=transformed.y,u=clamp((y-.535)/(2.13-.535),0.,1.);float bend=rodBend.w*2.13*pow(u,rodShape.x);transformed+=vec3(rodBend.x*bend,-.5*bend*bend/max(.06,y-.475),rodBend.z*bend);
 `:''}`);
 s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nvarying vec4 vTackle;').replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(vTackle.x,.12,1.);').replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=clamp(vTackle.y,0.,1.);');};m.customProgramCacheKey=()=>`tackle-${rod}`;return m;
}
export function createLineMaterial(){return new T.ShaderMaterial({uniforms:{lineA:{value:new T.Vector3()},lineB:{value:new T.Vector3()},lineCtl:{value:new T.Vector3()},lineShow:{value:1}},transparent:true,depthWrite:false,side:T.DoubleSide,vertexShader:`attribute vec2 aLine;uniform vec3 lineA,lineB,lineCtl;void main(){float t=aLine.x;vec3 p=mix(mix(lineA,lineCtl,t),mix(lineCtl,lineB,t),t);vec4 c=projectionMatrix*viewMatrix*vec4(p,1.);vec3 tangent=normalize(mix(lineCtl-lineA,lineB-lineCtl,t));vec3 side=normalize(cross(tangent,cameraPosition-p));p+=side*aLine.y*.001;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,fragmentShader:`uniform float lineShow;void main(){gl_FragColor=vec4(.7,.78,.72,.6*lineShow);}`});}

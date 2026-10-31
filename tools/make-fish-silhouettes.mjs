// Derives flat ink silhouettes (shown for species not yet caught) from the 480 px illustrations.
import {createRequire} from 'module';const require=createRequire(import.meta.url);const sharp=require('sharp');
import fs from 'fs';
const dir=new URL('../public/fish',import.meta.url).pathname;
const maxFilter=(a,W,H,r)=>{const t=new Float32Array(W*H),o=new Float32Array(W*H);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let m=0;for(let k=Math.max(0,x-r);k<=Math.min(W-1,x+r);k+=2)m=Math.max(m,a[y*W+k]);t[y*W+x]=m;}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let m=0;for(let k=Math.max(0,y-r);k<=Math.min(H-1,y+r);k+=2)m=Math.max(m,t[k*W+x]);o[y*W+x]=m;}return o;};
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('-480.webp'))){
 const id=f.replace('-480.webp','');
 const {data,info}=await sharp(`${dir}/${f}`).removeAlpha().blur(.6).raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,ch=[0,1,2].map(c=>Float32Array.from({length:W*H},(_,i)=>data[i*3+c]));
 const paper=ch.map(a=>maxFilter(a,W,H,22));
 const mask=new Float32Array(W*H);
 for(let i=0;i<W*H;i++){const d=Math.hypot(paper[0][i]-ch[0][i],paper[1][i]-ch[1][i],paper[2][i]-ch[2][i]);mask[i]=Math.max(0,Math.min(1,(d-20)/22));}
 // Paper is whatever the border can reach without crossing the fish; everything else is fish, holes filled.
 const seen=new Uint8Array(W*H),stack=[];for(let x=0;x<W;x++){stack.push(x,(H-1)*W+x);}for(let y=0;y<H;y++){stack.push(y*W,y*W+W-1);}
 while(stack.length){const i=stack.pop();if(seen[i]||mask[i]>=.5)continue;seen[i]=1;const x=i%W,y=(i/W)|0;if(x>0)stack.push(i-1);if(x<W-1)stack.push(i+1);if(y>0)stack.push(i-W);if(y<H-1)stack.push(i+W);}
 for(let i=0;i<W*H;i++)mask[i]=seen[i]?0:1;
 const out=Buffer.alloc(W*H*3),bg=[238,231,214],ink=[78,82,84];
 for(let i=0;i<W*H;i++)for(let c=0;c<3;c++)out[i*3+c]=Math.round(bg[c]*(1-mask[i])+ink[c]*mask[i]);
 await sharp(out,{raw:{width:W,height:H,channels:3}}).blur(.7).webp({quality:72}).toFile(`${dir}/${id}-silhouette.webp`);
}
console.log('done');

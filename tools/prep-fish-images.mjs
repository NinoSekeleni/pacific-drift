// Builds the journal's WebP illustrations from the selected Magnific sources (see public/fish/PROMPTS.md).
// usage: node tools/prep-fish-images.mjs <folder of <id>__<creation>.jpg>
import {createRequire} from 'module';const require=createRequire(import.meta.url);const sharp=require('sharp');
import fs from 'fs';
const src=process.argv[2]||'work/fish-images/source',out=new URL('../public/fish',import.meta.url).pathname;
for(const f of fs.readdirSync(src).filter(f=>f.endsWith('.jpg'))){
 const id=f.split('__')[0],img=sharp(`${src}/${f}`),meta=await img.metadata();
 const {data}=await sharp(`${src}/${f}`).extract({left:4,top:4,width:12,height:12}).raw().toBuffer({resolveWithObject:true});
 let r=0,g=0,b=0;for(let i=0;i<data.length;i+=3){r+=data[i];g+=data[i+1];b+=data[i+2];}const n=data.length/3,bg={r:Math.round(r/n),g:Math.round(g/n),b:Math.round(b/n)};
 for(const [w,q] of [[1024,80],[480,74]]){const h=Math.round(w*2/3);
  await sharp(`${src}/${f}`).resize(w,h,{fit:'contain',background:bg}).webp({quality:q,effort:5}).toFile(`${out}/${id}-${w}.webp`);}
 console.log(id,meta.width+'x'+meta.height,JSON.stringify(bg));
}

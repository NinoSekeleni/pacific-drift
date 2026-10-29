// Lossless transfer packing. Older browsers and failed packed requests use the
// original assets; the geometry and image bytes are identical after inflation.
export function onceLoader(load){let pending=null;return (...args)=>pending||(pending=Promise.resolve().then(()=>load(...args)).catch(error=>{pending=null;throw error;}));}
export async function mapLimit(items,limit,work){const results=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;results[i]=await work(items[i],i);}}));return results;}
export async function packedBytes(url,fetcher=fetch){
 if(typeof DecompressionStream!=='undefined')try{const r=await fetcher(url+'.bin');if(!r.ok)throw Error('Packed asset unavailable');const bytes=await r.arrayBuffer(),head=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));return head[0]===31&&head[1]===139?await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():bytes;}catch{}
 const r=await fetcher(url);if(!r.ok)throw Error('Asset unavailable: '+url);return r.arrayBuffer();
}
export async function loadPackedJSON(url,fetcher=fetch){return JSON.parse(new TextDecoder().decode(await packedBytes(url,fetcher)));}
export async function loadPackedModel(loader,url){const bytes=await packedBytes(url);return loader.parseAsync(bytes,url.slice(0,url.lastIndexOf('/')+1));}

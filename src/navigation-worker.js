import {SeaRouter} from './navigation.js';
let router=null;
self.onmessage=event=>{const m=event.data;try{
 if(m.type==='init'){router=new SeaRouter(m.land,m.chart);self.postMessage({type:'ready'});return;}
 if(m.type==='route'){if(!router)throw Error('Chart is still loading.');const result=router.plan(m.start,m.target,{onProgress:visited=>self.postMessage({type:'progress',id:m.id,visited})});self.postMessage({type:'route',id:m.id,result});}
}catch(error){self.postMessage({type:'error',id:m.id,message:error.message});}};

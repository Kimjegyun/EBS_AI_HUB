import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function ensurePortalBackends(paths,{load=url=>import(url)}={}){
 const results=[];
 for(const path of paths){
  try{
   const module=await load(pathToFileURL(path).href);
   if(typeof module.ensurePortalBackend==='function'){
    const result=await module.ensurePortalBackend();
    results.push({ready:result?.ready===true});
   }
  }catch{results.push({ready:false});}
 }
 if(results.some(result=>!result.ready))throw Error('An application backend could not be recovered.');
 return {checked:results.length,ready:true};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const manifest=resolve(import.meta.dirname,'../.runtime/portal-app-modules.json');
 const paths=existsSync(manifest)?JSON.parse(readFileSync(manifest,'utf8')):[];
 console.log(JSON.stringify(await ensurePortalBackends(paths)));
}

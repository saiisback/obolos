import {randomBytes,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,chmod,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';

/** Persist a private development identity once; never print or silently rotate it. */
export async function prepareSpeculos(root){
 const directory=join(root,'data/speculos');
 await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
 const path=join(directory,'device.seed');
 try{
  await writeFile(path,randomBytes(64).toString('hex')+'\n',{flag:'wx',mode:0o600});
 }catch(error){if(error.code!=='EEXIST')throw error;}
 const info=await lstat(path);
 if(!info.isFile()||info.isSymbolicLink()||!/^[a-f0-9]{128}\n?$/.test(await readFile(path,'utf8')))throw Error('Invalid existing Speculos identity; restore it rather than rotate it.');
 await chmod(path,0o600);
}
async function main(){
 const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
 for(const [name,expected] of Object.entries({
  'sync.elf':'37741387a436ccb043312da5c1943d64ff61dbcedb7af8d6add7211046b09d6c',
  'ethereum.elf':'d8631ab43961928851e66175bef6d0157e5c516389b8b61bdb3c239a8125944e',
 })){
  const actual=createHash('sha256').update(await readFile(join(root,'tools/speculos/apps',name))).digest('hex');
  if(actual!==expected)throw Error(`Speculos application checksum mismatch: ${name}`);
 }
 await prepareSpeculos(root);
 console.log('Speculos apps verified; private development seed ready. Use npm run speculos:up.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});

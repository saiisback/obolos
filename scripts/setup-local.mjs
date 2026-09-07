import fs from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseEnv} from 'node:util';

const targets=['.env.local','.env.broker','.env.services'];
const templates=['.env.example','.env.broker.example','.env.services.example'];
const inside=(base,file)=>{const path=relative(base,file);return path!==''&&!path.startsWith('..'+sep)&&path!=='..'&&!path.startsWith(sep);};
class SetupError extends Error {}
function dotenv(value){if(/[\r\n\0]/.test(value))throw new SetupError('Unsupported local configuration path.');if(!value.includes("'"))return "'"+value+"'";if(!value.includes('"'))return '"'+value+'"';throw new SetupError('Unsupported local configuration path.');}
function replace(template,values){
  let output=template;
  for(const [key,value] of Object.entries(values)){
    const expression=new RegExp('^'+key+'=.*$','gm');
    if((output.match(expression)||[]).length!==1)throw new SetupError('Configuration template is missing a required field.');
    output=output.replace(expression,()=>key+'='+dotenv(value));
  }
  return output;
}
async function absent(file){try{await fs.lstat(file);return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}}

/** Local convenience only; creates no user wallet, password, Ring enrollment or account.
 * @param {string} root
 * @param {Record<string,string|undefined>} runtime
 */
export async function setupLocal(root=process.cwd(),runtime=process.env){
  const base=await fs.realpath(root);
  for(const name of targets)if(!await absent(join(base,name)))throw new SetupError('Existing configuration found; setup refuses to overwrite any env file.');
  const [appTemplate,brokerTemplate,serviceTemplate,ignoreText]=await Promise.all([...templates,'.gitignore'].map(name=>fs.readFile(join(base,name),'utf8')));
  const rules=ignoreText.split(/\r?\n/).map(line=>line.trim());
  if(!rules.includes('.env*')||!rules.includes('data/')||targets.some(name=>rules.includes('!'+name)))throw new SetupError('Required local configuration ignore rules are missing.');
  const dataRoot=join(base,'data');
  const appData=resolve(base,runtime.OBOLOS_DATA_DIR||runtime.AGENTGDP_DATA_DIR||parseEnv(appTemplate).OBOLOS_DATA_DIR||parseEnv(appTemplate).AGENTGDP_DATA_DIR||'data/app');
  if(!inside(dataRoot,appData))throw new SetupError('Local setup requires application state inside the ignored data directory.');
  const brokerData=join(dataRoot,'local-broker');
  const circleHome=join(brokerData,'circle-session');
  const ringFile=join(brokerData,'obolos-secrets.enc');
  const serviceData=join(dataRoot,'data-service');
  // Reject existing symlinks under managed state; never follow one into another location.
  async function safeDirectoryPath(directory){
    const parts=relative(base,directory).split(sep);let current=base;
    for(const part of parts){current=join(current,part);try{const info=await fs.lstat(current);if(!info.isDirectory()||info.isSymbolicLink())throw new SetupError('Local state path is not a plain directory.');}catch(error){if(error.code!=='ENOENT')throw error;}}
  }
  for(const directory of [appData,brokerData,circleHome,serviceData])await safeDirectoryPath(directory);
  for(const name of ['wallet-cli','circle']){const executable=join(base,'node_modules/.bin',name);try{if(!(await fs.stat(executable)).isFile())throw Error();await fs.access(executable,constants.X_OK);}catch{throw new SetupError('Install project dependencies before local setup.');}}
  let sessionSecret=randomBytes(32).toString('hex');let sessionKeyPreserved=false;
  const sessionFile=join(appData,'session.key');
  if(!await absent(sessionFile)){
    const info=await fs.lstat(sessionFile);
    if(!info.isFile()||info.isSymbolicLink()||info.size!==64)throw new SetupError('Existing session key is invalid; setup will not replace it.');
    const existing=await fs.readFile(sessionFile,'utf8');
    if(!/^[a-fA-F0-9]{64}$/.test(existing))throw new SetupError('Existing session key is invalid; setup will not replace it.');
    sessionSecret=existing;sessionKeyPreserved=true;
  }
  const operatorToken=randomBytes(32).toString('hex');
  const brokerToken=randomBytes(32).toString('hex');
  const serviceToken=randomBytes(32).toString('hex');
  const appDataKey=Object.hasOwn(parseEnv(appTemplate),'OBOLOS_DATA_DIR')?'OBOLOS_DATA_DIR':'AGENTGDP_DATA_DIR';
  const localNotice='# LOCAL DEVELOPMENT ONLY: same OS user and workspace are not credential isolation.\n';
  const contents=[
    replace(appTemplate,{[appDataKey]:appData,SESSION_SECRET:sessionSecret,OPERATOR_TOKEN:operatorToken,BROKER_TOKEN:brokerToken,DATA_SERVICE_OPERATOR_TOKEN:serviceToken}),
    localNotice+replace(brokerTemplate,{BROKER_TOKEN:brokerToken,BROKER_DATA_DIR:brokerData,LEDGER_WALLET_CLI:join(base,'node_modules/.bin/wallet-cli'),LEDGER_RING_FILE:ringFile,CIRCLE_CLI:join(base,'node_modules/.bin/circle'),CIRCLE_CLI_HOME:circleHome}),
    replace(serviceTemplate,{DATA_SERVICE_OPERATOR_TOKEN:serviceToken,DATA_SERVICE_DATA_DIR:serviceData}),
  ];
  const createdFiles=[];const createdDirectories=[];
  async function ensureDirectory(directory){
    if(!inside(base,directory))return;
    if(!await absent(directory)){const info=await fs.lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw Error();return;}
    await ensureDirectory(dirname(directory));
    try{await fs.mkdir(directory,{mode:0o700});createdDirectories.push(directory);}catch(error){if(error.code!=='EEXIST')throw error;const info=await fs.lstat(directory);if(!info.isDirectory()||info.isSymbolicLink())throw Error();}
  }
  try{
    for(const directory of [appData,brokerData,circleHome,serviceData])await ensureDirectory(directory);
    for(let index=0;index<targets.length;index++){
      const filename=join(base,targets[index]);
      const file=await fs.open(filename,'wx',0o600);
      const owned={filename,ino:undefined,dev:undefined};createdFiles.push(owned);
      try{const info=await file.stat();owned.ino=info.ino;owned.dev=info.dev;await file.writeFile(contents[index]);await file.sync();}finally{await file.close();}
    }
    const directory=await fs.open(base,'r');try{await directory.sync();}finally{await directory.close();}
  }catch{
    let rollbackIncomplete=false;
    for(const owned of createdFiles.reverse()){try{const info=await fs.lstat(owned.filename);if(owned.ino===undefined||(info.ino===owned.ino&&info.dev===owned.dev))await fs.unlink(owned.filename);else rollbackIncomplete=true;}catch(error){if(error.code!=='ENOENT')rollbackIncomplete=true;}}
    for(const directory of createdDirectories.reverse()){try{await fs.rmdir(directory);}catch(error){if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(error.code))rollbackIncomplete=true;}}
    throw new SetupError(rollbackIncomplete?'Local setup failed; rollback needs local operator review.':'Local setup failed; created configuration was rolled back.');
  }
  return {status:'created',files:targets,sessionKeyPreserved};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{const result=await setupLocal();for(const file of result.files)console.log(`${file}: created`);
    console.log(`SESSION_SECRET: ${result.sessionKeyPreserved?'existing-session-preserved':'generated'}`);
    console.log('LOCAL DEVELOPMENT: same OS user is not credential isolation.');
    console.log('WALLETS/RING/FUNDING: unconfigured; complete docs/live-setup.md locally.');
  }catch(error){console.error(error instanceof SetupError?error.message:'Local setup could not complete; no credential values were printed.');process.exitCode=1;}
}

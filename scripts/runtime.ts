import {spawn} from 'node:child_process'
import {mkdirSync,openSync,closeSync,existsSync} from 'node:fs'
import {resolve,join,dirname} from 'node:path'
import {homedir} from 'node:os'
const root=resolve(import.meta.dir,'..'),port=Number(process.env.AILYA_PORT??4317),url=`http://127.0.0.1:${port}`
const dataDir=resolve(process.env.AILYA_DATA_DIR??join(process.env.LOCALAPPDATA??join(homedir(),'.local/share'),'Ailya/data')),dataPath=join(dataDir,'ailya.sqlite')
type Health={service:string;pid:number;instanceId:string;dataPath:string;web:boolean;version:number}
async function probe(){
 let response:Response
 try{response=await fetch(url+'/api/health',{signal:AbortSignal.timeout(2000)})}catch(error){if((error as {name:string}).name==='TimeoutError')throw Error('Core 健康检查超时');return null}
 if(!response.ok)throw Error(`Core 当前不可用（HTTP ${response.status}）`)
 let health:Health;try{health=await response.json()}catch{throw Error('端口由其他服务占用')}
 if(health.service!=='ailya-core'||resolve(health.dataPath??'').toLowerCase()!==dataPath.toLowerCase())throw Error('端口已有其他服务或另一数据目录的 Core，未做任何停止操作')
 return health
}
async function build(){
 if(!existsSync(join(root,'node_modules')))throw Error('缺少依赖，请先运行 npm ci')
 const npm=Bun.which('npm');if(!npm)throw Error('请先安装 Node.js / npm')
 const command=process.platform==='win32'?['node',join(dirname(npm),'node_modules/npm/bin/npm-cli.js'),'run','build']:['npm','run','build']
 const child=Bun.spawn(command,{cwd:root,stdout:'inherit',stderr:'inherit'});if(await child.exited!==0)throw Error('构建失败，未启动 Core')
}
async function main(){
 const action=process.argv[2]??'start';if(!['start','stop','status'].includes(action)||!Number.isInteger(port)||port<1||port>65535)throw Error('用法：bun scripts/runtime.ts start|stop|status；AILYA_PORT 必须是有效端口')
 const health=await probe()
 if(action==='status'){console.log(health?JSON.stringify({running:true,url,pid:health.pid,schema:health.version,web:health.web,dataPath}):JSON.stringify({running:false,url,dataPath}));return}
 if(action==='stop'){
  if(!health){console.log('Core 未运行');return}
  const response=await fetch(url+'/api/runtime/shutdown',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({instanceId:health.instanceId})}),body=await response.json() as {error?:string};if(!response.ok)throw Error(body.error??'停止失败')
  for(let i=0;i<100;i++){await Bun.sleep(300);try{if(!await probe()){console.log('Core 已停止');return}}catch{/* The owned service returns 503 while draining. */}}
  throw Error('Core 尚未完成关闭，请检查日志；没有强制终止任务')
 }
 if(health){if(!health.web)throw Error('已有 Core 未提供正式网页，请先 npm run stop 后重新 npm start');console.log(`Ailya 已运行：${url}`);return}
 await build()
 // A second launcher may have won while this one was building.
 const other=await probe();if(other){console.log(`Ailya 已运行：${url}`);return}
 const logs=join(dataDir,'logs');mkdirSync(logs,{recursive:true});const stamp=new Date().toISOString().replaceAll(':','-'),out=join(logs,stamp+'.out.log'),err=join(logs,stamp+'.err.log'),outFd=openSync(out,'a'),errFd=openSync(err,'a')
 const child=spawn(process.execPath,[join(root,'core/server.ts')],{cwd:root,env:{...process.env,AILYA_DATA_DIR:dataDir,AILYA_PORT:String(port)},windowsHide:true,detached:true,stdio:['ignore',outFd,errFd]});closeSync(outFd);closeSync(errFd)
 let failure:Error|undefined;child.on('error',e=>{failure=e});child.unref()
 for(let i=0;i<100;i++){await Bun.sleep(300);if(failure)throw failure;if(child.exitCode!==null)throw Error('Core 启动失败，日志：'+err);const current=await probe();if(current){if(!current.web)throw Error('Core 未加载网页产物');console.log(`Ailya 已启动：${url}\n数据：${dataDir}\n日志：${err}`);return}}
 child.kill();throw Error('启动健康检查超时，已结束本次启动的进程。日志：'+err)
}
if(import.meta.main)await main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1})

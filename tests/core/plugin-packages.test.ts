import {test,expect} from 'bun:test'
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {join,dirname} from 'node:path'
import {tmpdir} from 'node:os'
import {PluginHost} from '../../core/plugin-host'
import {pluginFiles,writePluginFiles} from '../../core/plugin-files'
import {withCore,post,sse} from './helpers'
test('real npm package manager downloads from a loopback registry and restores installed bytes without registry access',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-plugin-npm-')),source=join(root,'source'),stage=join(root,'stage'),restored=join(root,'restored');for(const p of [source,stage,restored])mkdirSync(p)
 const manifest={name:'ailya-fixture-plugin',version:'1.2.3',pi:{extensions:['index.ts']}}
 writeFileSync(join(source,'package.json'),JSON.stringify(manifest));writeFileSync(join(source,'index.ts'),`import {writeFileSync} from 'node:fs';export default pi=>pi.registerTool({name:'receipt',label:'Receipt',description:'fixture',parameters:{type:'object',properties:{}},execute:async()=>{writeFileSync('cwd.txt','NPM-OK');return {content:[{type:'text',text:'NPM-OK'}],details:{}}}})`)
 const npm=join(dirname(Bun.which('npm')!),'node_modules/npm/bin/npm-cli.js'),pack=Bun.spawn(['node',npm,'pack','--ignore-scripts','--json'],{cwd:source,stdout:'pipe',stderr:'pipe'})
 const [code,out,err]=await Promise.all([pack.exited,new Response(pack.stdout).text(),new Response(pack.stderr).text()]);expect(code,err).toBe(0);const bytes=readFileSync(join(source,JSON.parse(out)[0].filename))
 let requests=0
 const registry=Bun.serve({hostname:'127.0.0.1',port:0,fetch:(req):Response=>{requests++;if(new URL(req.url).pathname.endsWith('.tgz'))return new Response(bytes);return Response.json({name:manifest.name,'dist-tags':{latest:manifest.version},versions:{[manifest.version]:{...manifest,dist:{tarball:`http://127.0.0.1:${registry.port}/fixture.tgz`}}}})}})
 const npmRoot=join(stage,'pi','npm');mkdirSync(npmRoot,{recursive:true});writeFileSync(join(npmRoot,'.npmrc'),`registry=http://127.0.0.1:${registry.port}/\naudit=false\nfund=false\ncache=${join(root,'npm-cache').replaceAll('\\','/')}\n`)
 const host=new PluginHost(stage),second=new PluginHost(restored)
 try{
  const prepared=await host.request<{entries:string[];version:string}>({op:'prepare',root:stage,kind:'npm',source:'npm:ailya-fixture-plugin@1.2.3'},undefined,30000)
  expect(prepared.version).toBe('1.2.3');expect(requests).toBeGreaterThan(1)
  const files=pluginFiles(stage);writePluginFiles(restored,files);await registry.stop(true)
  const tools=await second.request<{name:string}[]>({op:'load',root:restored,entries:prepared.entries,workspace:restored});expect(tools[0].name).toBe('receipt')
  await second.request({op:'call',tool:'receipt',args:{},callId:'npm-call'});expect(readFileSync(join(restored,'cwd.txt'),'utf8')).toBe('NPM-OK')
 }finally{await host.close();await second.close();await registry.stop(true);rmSync(root,{recursive:true,force:true})}
},40000)

test('Git source clones a real repository over loopback HTTP and checks out the requested tag',async()=>{
 await withCore(async(app,base,_workspace,root)=>{
  const source=join(root,'git-source');mkdirSync(source)
  const git=async(args:string[])=>{const proc=Bun.spawn(['git',...args],{cwd:source,stdout:'pipe',stderr:'pipe'});const [code,err]=await Promise.all([proc.exited,new Response(proc.stderr).text(),new Response(proc.stdout).text()]);expect(code,err).toBe(0)}
  await git(['init','-b','main']);writeFileSync(join(source,'package.json'),JSON.stringify({name:'ailya-git-fixture',version:'1.0.0',pi:{extensions:['index.ts']}}));writeFileSync(join(source,'.npmrc'),'audit=false\nfund=false\n')
  const content=(label:string)=>`export default pi=>pi.registerTool({name:'git_tool',label:${JSON.stringify(label)},description:'Git fixture',parameters:{type:'object',properties:{}},execute:async()=>({content:[{type:'text',text:'GIT-OK'}],details:{}})})`
  writeFileSync(join(source,'index.ts'),content('PINNED'));await git(['add','.']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','fixture']);await git(['tag','v1'])
  writeFileSync(join(source,'index.ts'),content('LATEST'));await git(['add','.']);await git(['-c','user.name=Fixture','-c','user.email=fixture@example.invalid','commit','-m','next']);await git(['update-server-info'])
  let requests=0;const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:(req):Response=>{requests++;const path=new URL(req.url).pathname.slice('/owner/repo/'.length);if(!/^[a-zA-Z0-9/._-]+$/.test(path)||path.split('/').some(p=>p==='..'||p==='.'))return new Response('',{status:400});try{return new Response(readFileSync(join(source,'.git',path)),{headers:{'Content-Type':'text/plain'}})}catch{return new Response('',{status:404})}}})
  try{const id=crypto.randomUUID();expect((await post(base+'/api/plugins',{id,kind:'Git',source:`git:http://127.0.0.1:${server.port}/owner/repo@v1`,enabled:true,trusted:true})).status).toBe(202);await app.core.plugins.jobs.get(id);expect(app.core.plugins.get(id)!.error).toBeNull();expect(app.core.plugins.list()[0].tools[0].label).toBe('PINNED');expect(requests).toBeGreaterThan(1)}finally{await server.stop(true)}
 },()=>sse({content:'unused'}))
},40000)

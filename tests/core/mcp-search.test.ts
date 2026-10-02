import {test,expect} from 'bun:test'
import {mkdtempSync,rmSync,readFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {Storage} from '../../core/storage'
import {Resources} from '../../core/resources'
import {McpSession} from '../../core/mcp'
import {WebSearch} from '../../core/web-search'
import {createServer} from 'node:http'
import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js'

test('real MCP stdio discovery and call, denial before process launch, encrypted config, owned process closes',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-mcp-')),db=new Storage(join(root,'db')),resources=new Resources(db,root)
 const m=resources.save({id:crypto.randomUUID(),kind:'mcp',name:'fixture',enabled:true,command:JSON.stringify(["node",resolve('tests/fixtures/mcp-server.ts')]),env:{TEST_MCP_TOKEN:'private'}})
 const denied=new McpSession(resources,root,'default',async()=>{throw Error('denied')}),live=new McpSession(resources,root,'full',async()=>{})
 try{
  await expect(denied.tools()[1].execute('no',{serverId:m.id} as never)).rejects.toThrow('denied');expect(existsSync(join(root,'mcp-started.txt'))).toBe(false)
  const list=JSON.stringify(await live.tools()[1].execute('list',{serverId:m.id} as never));expect(list).toContain('echo');expect(list).not.toContain('private')
  const result=await live.tools()[2].execute('call',{serverId:m.id,name:'echo',arguments:{text:'mcp real effect'}} as never)
  expect(JSON.stringify(result)).toContain('mcp real effect');expect(readFileSync(join(root,'mcp-proof.txt'),'utf8')).toBe('mcp real effect')
  let failure='';try{await live.tools()[2].execute('error',{serverId:m.id,name:'missing',arguments:{}} as never)}catch(e){failure=String(e)};expect(failure).toContain('unknown tool')
  const pid=Number(readFileSync(join(root,'mcp-started.txt'),'utf8'));await live.close();expect(()=>process.kill(pid,0)).toThrow()
 }finally{await live.close();await denied.close();db.close();rmSync(root,{recursive:true,force:true})}
},15000)

test('real MCP Streamable HTTP passes configured headers and discovers and calls tools',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-mcp-http-')),db=new Storage(join(root,'db')),resources=new Resources(db,root)
 let calls=0
 const http=createServer(async(req,res)=>{
  if(req.headers.authorization!=='Bearer local-test'){res.writeHead(401).end();return}
  const server=new Server({name:'http-test',version:'1'},{capabilities:{tools:{}}}),transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true})
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'echo',inputSchema:{type:'object'}}]}))
  server.setRequestHandler(CallToolRequestSchema,async()=>{calls++;return {content:[{type:'text',text:'http proof'}]}})
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk))
  res.on('close',()=>{void server.close()});await server.connect(transport);await transport.handleRequest(req,res,chunks.length?JSON.parse(Buffer.concat(chunks).toString()):undefined)
 })
 await new Promise<void>(r=>http.listen(0,'127.0.0.1',r))
 const port=(http.address() as {port:number}).port,m=resources.save({id:crypto.randomUUID(),kind:'mcp',name:'http',transport:'http',enabled:true,endpoint:`http://127.0.0.1:${port}/mcp`,headers:{Authorization:'Bearer local-test'}}),session=new McpSession(resources,root,'full',async()=>{})
 try{expect(JSON.stringify(await session.tools()[1].execute('list',{serverId:m.id} as never))).toContain('echo');expect(JSON.stringify(await session.tools()[2].execute('call',{serverId:m.id,name:'echo',arguments:{}} as never))).toContain('http proof');expect(calls).toBe(1)}finally{await session.close();http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));db.close();rmSync(root,{recursive:true,force:true})}
},15000)

test('Tavily request uses saved encrypted credential, bounds snippets, reports errors without leaking key',async()=>{
 const root=mkdtempSync(join(tmpdir(),'ailya-search-')),db=new Storage(join(root,'db'))
 try{
  let status=200
  const search=new WebSearch(db,(async(url,init)=>{
   expect(url).toBe('https://api.tavily.com/search');expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-private')
   expect(JSON.parse(String(init?.body))).toMatchObject({query:'test',max_results:3,include_raw_content:false})
   return Response.json({results:[{title:'Source',url:'https://example.com',content:'x'.repeat(3000)},{title:'bad scheme',url:'file:///private'}]},{status})
  }) as typeof fetch)
  search.save({apiKey:'test-private'});expect(search.config()).toEqual({provider:'tavily',hasKey:true})
  expect(db.get<{value:string}>("SELECT value FROM core_settings WHERE key='tavily-key'")!.value).not.toContain('test-private')
  const results=await search.search('test',3);expect(results).toHaveLength(1);expect(results[0].snippet).toHaveLength(2000)
  status=401;await expect(search.search('test',3)).rejects.toThrow('HTTP 401')
  await expect(search.search('test',11)).rejects.toThrow()
 }finally{db.close();rmSync(root,{recursive:true,force:true})}
})

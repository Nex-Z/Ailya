import {Server} from '@modelcontextprotocol/sdk/server/index.js'
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js'
import {writeFileSync} from 'node:fs'
const server=new Server({name:'ailya-test',version:'1'},{capabilities:{tools:{}}})
writeFileSync('mcp-started.txt',String(process.pid))
server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[{name:'echo',description:'test echo',inputSchema:{type:'object',properties:{text:{type:'string'}},required:['text']}}]}))
server.setRequestHandler(CallToolRequestSchema,async request=>{
 if(request.params.name!=='echo')return {isError:true,content:[{type:'text',text:'unknown tool'}]}
 const text=String(request.params.arguments?.text);writeFileSync('mcp-proof.txt',text)
 return {content:[{type:'text',text}],secretPresent:!!process.env.TEST_MCP_TOKEN}
})
await server.connect(new StdioServerTransport())

import {test,expect} from '@playwright/test'
test('thinking status and truncated failure remain visible after reload without exposing reasoning',async({page})=>{
 const reply:{id:string;role:string;text:string;parts:unknown[];executing:boolean;phase?:string;error?:string;durationMs:number}={id:'a',role:'assistant',text:'',parts:[],executing:true,phase:'thinking',durationMs:1000}
 const session={id:'output-ui',title:'输出状态',group:'今天',context:{workspace:'C:\\Work',agent:'Ailya',model:'["test","model"]'},messages:[{id:'u',role:'user',text:'制作 HTML'},reply]}
 await page.route('**/api/snapshot',route=>route.fulfill({json:{sessions:[session],providers:[{id:'test',name:'Test',models:['model']}],cursor:999999999}}))
 await page.goto('http://127.0.0.1:5173')
 await expect(page.getByText('正在思考…',{exact:true})).toBeVisible()
 await expect(page.getByRole('button',{name:'停止生成',exact:true})).toBeVisible()
 await page.reload();await expect(page.getByText('正在思考…',{exact:true})).toBeVisible()
 reply.executing=false;delete reply.phase;reply.error='模型达到本次输出上限，回复未完成。已完成的文件操作不会回滚，请检查后重试。'
 await page.reload()
 await expect(page.getByRole('alert')).toContainText('输出上限')
 await expect(page.getByRole('button',{name:'重试回复',exact:true})).toBeVisible()
 await expect(page.getByText('正在思考…',{exact:true})).toHaveCount(0)
 await page.screenshot({path:'artifacts/browser/output-limit-desktop.png'})
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'收起侧栏',exact:true}).click()
 await expect(page.getByRole('alert')).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
 await page.screenshot({path:'artifacts/browser/output-limit-narrow.png'})
})

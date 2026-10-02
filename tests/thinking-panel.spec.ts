import {test,expect,type WebSocketRoute} from '@playwright/test'

test('thinking expands automatically and respects manual overrides across updates',async({page})=>{
 const reply={id:'a',role:'assistant',text:'',reasoning:'Model supplied thinking',phase:'thinking',executing:true}
 const session={id:'panel-test',title:'Thinking panel',group:'今天',context:{workspace:'Ailya',agent:'Ailya',model:'默认模型'},messages:[{id:'u',role:'user',text:'test'},reply]}
 let socket:WebSocketRoute|undefined,seq=0
 await page.route('**/api/snapshot',route=>route.fulfill({json:{sessions:[session],providers:[],cursor:0}}))
 await page.routeWebSocket('**/api/events?*',ws=>{socket=ws})
 await page.goto('http://127.0.0.1:5173')
 const panel=page.locator('.reasoning-panel')
 await expect(panel).toHaveAttribute('open','')
 await expect.poll(()=>!!socket).toBe(true)
 const update=(phase:string)=>{reply.phase=phase;socket!.send(JSON.stringify({seq:++seq,session}))}
 update('generating');await expect(panel).not.toHaveAttribute('open','')
 update('thinking');await expect(panel).toHaveAttribute('open','')
 await panel.locator('summary').click();await expect(panel).not.toHaveAttribute('open','')
 update('generating');update('thinking');await expect(panel).not.toHaveAttribute('open','')
 await panel.locator('summary').focus();await page.keyboard.press('Enter');await expect(panel).toHaveAttribute('open','')
 reply.executing=false;update('');await expect(panel).toHaveAttribute('open','')
})

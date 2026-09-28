import { test, expect } from '@playwright/test'
const url='http://127.0.0.1:5173'
test('attachments retain bytes across session switches and sending', async ({page}) => {
 await page.goto(url)
 await page.locator('input[type=file]').setInputFiles({name:'note.txt',mimeType:'text/plain',buffer:Buffer.from('actual content')})
 await page.getByRole('button',{name:'一起梳理 Ailya 的交互',exact:true}).click()
 await expect(page.locator('.composer-attachments')).toHaveCount(0)
 await page.getByRole('button',{name:'新会话',exact:true}).first().click()
 await expect(page.locator('.composer-attachments')).toContainText('note.txt')
 await page.getByRole('button',{name:'发送消息',exact:true}).click()
 const contents=await page.evaluate(async()=>{const {useAttachments}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/attachments.ts')!);return Promise.all(Object.values(useAttachments.getState().files).map(f=>f.text()))})
 expect(contents).toEqual(['actual content'])
})
test('configured shortcut sends only on Ctrl Enter',async({page})=>{
 await page.goto(url)
 await page.evaluate(async()=>{const {usePreferences}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/preferences.ts')!);const s=usePreferences.getState();s.save({...s.config,sendKey:'Ctrl + Enter'})})
 const input=page.getByRole('textbox',{name:'消息',exact:true})
 await input.fill('shortcut check');await input.press('Enter')
 await expect(input).toHaveValue('shortcut check\n')
 await input.press('Control+Enter');await expect(input).toHaveValue('')
})
test('new reply ignores old question clock; retry clears stale results',async({page})=>{
 await page.goto(url)
 await page.evaluate(async()=>{
 const {useStore}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/store.ts')!);const {useAnswers}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/questions.ts')!)
 useAnswers.setState({deadlines:{old:Date.now()-600000},done:{old:true}})
 useStore.setState({activeId:'check',sessions:[{id:'check',title:'check',group:'今天',context:{workspace:'Ailya',agent:'Ailya',model:'默认模型'},questionRequest:{id:'old',agent:'Ailya',questions:[]},messages:[{id:'u',role:'user',text:'hello'},{id:'a',role:'assistant',text:'old',fileChanges:[{path:'/old',added:1,deleted:0,kind:'added'}],durationMs:99999}]}]})
 })
 await page.getByRole('button',{name:'重新生成',exact:true}).click()
 await expect(page.getByRole('region',{name:'文件修改'})).toHaveCount(0)
 await page.getByRole('button',{name:'停止生成',exact:true}).click()
 const duration=await page.evaluate(async()=>{const {useStore}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/store.ts')!);return useStore.getState().sessions[0].messages[1].durationMs})
 expect(duration).toBeLessThan(10000)
})
test('diff honors separated hunk line numbers',async({page})=>{
 await page.goto(url)
 await page.evaluate(async()=>{const {useStore}=await import(performance.getEntriesByType('resource').map(e=>e.name).find(n=>new URL(n).pathname==='/src/store.ts')!);useStore.getState().addMessage('welcome',{id:'diff',role:'assistant',text:'done',fileChanges:[{path:'/multi.ts',kind:'modified',added:2,deleted:2,diff:['@@ -10,1 +10,1 @@','-old','+new','@@ -100,1 +120,1 @@','-second','+replacement']}]})})
 await page.getByRole('button',{name:'查看差异 /multi.ts'}).click()
 const dialog=page.getByRole('dialog')
 await expect(dialog.getByText('100',{exact:true})).toBeVisible()
 await expect(dialog.getByText('120',{exact:true})).toBeVisible()
})


import {test,expect} from '@playwright/test'
test('directory button invokes native picker and cancellation preserves selection',async({page})=>{
 await page.goto('http://127.0.0.1:5173');
 await page.evaluate(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:async()=>({name:'SelectedProject'})}));
 await page.getByRole('button',{name:'定时任务',exact:true}).click();
 await page.getByRole('button',{name:'新增 定时任务',exact:true}).click();
 const picker=page.getByRole('button',{name:'选择工作目录',exact:true});
 await picker.click();
 await expect(picker).toHaveText('SelectedProject');
 await page.evaluate(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:async()=>{throw new DOMException('Cancelled','AbortError')}}));
 await picker.click();
 await expect(picker).toHaveText('SelectedProject');
 await expect(page.getByRole('alert')).toHaveCount(0);
});



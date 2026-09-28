import {test,expect} from '@playwright/test'
test('file diffs open, show added and deleted lines, and close',async({page})=>{
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'复杂任务 · 项目修复与交付',exact:true}).click();
 await page.getByRole('button',{name:'查看差异 E:/WorkSpace/project/Ailya/src/components/Composer.tsx',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByText('const [files, setFiles] = useState<File[]>([]);',{exact:true})).toBeVisible();
 await expect(dialog.getByText('const files = attachmentDrafts[sessionId] ?? [];',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await page.getByRole('button',{name:'展开其余 5 个文件'}).click();
 await page.getByRole('button',{name:'查看差异 E:/WorkSpace/project/Ailya/src/legacy-attachments.ts',exact:true}).click();
 await expect(dialog.getByText('let files: File[] = [];',{exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


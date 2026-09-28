import {test,expect} from '@playwright/test'
test('question deadline persists, multi-select, refuse and file changes',async({page})=>{
 await page.clock.install();
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'提问 · 多问题确认',exact:true}).click();
 await page.getByRole('button',{name:'聊天交互',exact:true}).click();
 await page.clock.fastForward(15000);
 await page.getByRole('button',{name:'下一个',exact:true}).click();
 await page.getByRole('button',{name:'构建',exact:true}).click();
 await page.getByRole('button',{name:'代码审查',exact:true}).click();
 await expect(page.getByRole('button',{name:'构建',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.clock.fastForward(16000);
 await expect(page.getByText('Ailya · 已超时停止')).toBeVisible();
 await page.getByRole('button',{name:'下一个',exact:true}).click();
 await page.getByRole('textbox',{name:'有哪些必须保留的交互？'}).fill('保留快捷键');
 await page.getByRole('button',{name:'下一个',exact:true}).click();
 await page.getByRole('button',{name:'手机',exact:true}).click();
 await page.getByRole('button',{name:'提交回答',exact:true}).click();
 await expect(page.getByRole('button',{name:'停止生成',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'停止生成',exact:true}).click();
 await page.getByRole('button',{name:'复杂任务 · 项目修复与交付',exact:true}).click();
 const files=page.getByRole('region',{name:'文件修改'});
 await expect(files.getByText('E:/WorkSpace/project/Ailya/src/components/Composer.tsx',{exact:true})).toBeVisible();
 await expect(files.getByText('E:/WorkSpace/project/Ailya/src/legacy-attachments.ts',{exact:true})).toHaveCount(0);
 await files.getByRole('button',{name:'展开其余 5 个文件'}).click();
 await expect(files.getByText('E:/WorkSpace/project/Ailya/src/legacy-attachments.ts',{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'执行权限'}).click();
 await page.getByRole('option',{name:'所有权限',exact:true}).click();
 await expect(page.getByRole('combobox',{name:'执行权限'})).toHaveText('所有权限');
});
test('refusal restores normal composer',async({page})=>{
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:'提问 · 多问题确认',exact:true}).click();
 await page.getByRole('button',{name:'拒答',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'消息',exact:true})).toBeVisible();
 await expect(page.getByRole('form',{name:'回答 Agent 问题'})).toHaveCount(0);
});


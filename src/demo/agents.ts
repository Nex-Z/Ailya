export const agents = [
 { name: 'Ailya', model: '默认模型', skills: ['任务规划'], tools: ['文件', 'Shell', 'MCP'], prompt: '作为个人助理理解任务，协调所需角色，并统一整理结果。' },
 { name: 'Coder', model: '默认模型', skills: ['代码实现'], tools: ['文件', 'Shell', 'Git'], prompt: '根据任务实现代码，保持改动范围清晰，并验证结果。' },
 { name: 'Reviewer', model: '默认模型', skills: ['代码审查'], tools: ['文件', 'Git'], prompt: '检查代码正确性、边界条件和潜在回归，给出可执行的审查意见。' },
 { name: 'Tester', model: '默认模型', skills: ['测试验证'], tools: ['文件', 'Shell'], prompt: '围绕实际使用流程设计验证场景，记录失败与未覆盖范围。' },
]
export const groups = [{ name: 'Dev Team', coordinator: 'Ailya', members: ['Coder', 'Reviewer', 'Tester'] }]

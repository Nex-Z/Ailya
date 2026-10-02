import {z} from 'zod'
export const questionSchema=z.object({
 id:z.string().min(1).max(80),title:z.string().trim().min(1).max(2000),kind:z.enum(['choice','multiple','text','mixed']),
 options:z.array(z.string().trim().min(1).max(500)).min(2).max(12).optional(),recommendedOptions:z.array(z.string()).max(12).optional(),
}).strict().superRefine((q,c)=>{
 if(q.kind!=='text'&&!q.options)c.addIssue({code:'custom',message:'选择题需要选项'})
 if(q.options&&new Set(q.options).size!==q.options.length)c.addIssue({code:'custom',message:'选项不能重复'})
 if(q.recommendedOptions?.some(o=>!q.options?.includes(o)))c.addIssue({code:'custom',message:'推荐项必须属于选项'})
})
export const questionBatchSchema=z.object({questions:z.array(questionSchema).min(1).max(8)}).strict().refine(v=>new Set(v.questions.map(q=>q.id)).size===v.questions.length,'问题 ID 不能重复')
export const answerSchema=z.object({selected:z.array(z.string().max(500)).max(12),text:z.string().max(10000)}).strict()
export const answersSchema=z.record(z.string().max(80),answerSchema)
export type Answers=z.infer<typeof answersSchema>
export type QuestionRequest={id:string;taskId:string;toolCallId:string;agent:string;questions:z.infer<typeof questionSchema>[];createdAt:number;deadlineAt:number;startedAt:number;status:'pending'|'timed_out'|'interrupted'|'answered'|'refused'|'cancelled';drafts:Answers;revision:number}
export function validateAnswers(request:QuestionRequest,input:unknown,complete:boolean){
 const answers=answersSchema.parse(input)
 if(Object.keys(answers).some(id=>!request.questions.some(q=>q.id===id)))throw Error('回答包含未知问题')
 for(const q of request.questions){const a=answers[q.id];if(!a){if(complete)throw Error('请完整回答所有问题');continue}
  if(new Set(a.selected).size!==a.selected.length||a.selected.some(v=>!q.options?.includes(v))||q.kind!=='multiple'&&a.selected.length>1||q.kind==='text'&&a.selected.length||['choice','multiple'].includes(q.kind)&&a.text.trim())throw Error('回答格式与问题不符')
  if(complete&&!a.selected.length&&!a.text.trim())throw Error('请完整回答所有问题')
 }
 return answers
}
export function answerText(q:QuestionRequest,answers:Answers){return q.questions.map(item=>`${item.title}\n${[...(answers[item.id]?.selected??[]),answers[item.id]?.text.trim()].filter(Boolean).join('；')}`).join('\n\n')}

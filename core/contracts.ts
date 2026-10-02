import {attachmentInput} from './attachments'
import { z } from 'zod'
export const contextSchema=z.object({workspace:z.string().min(1).max(4096),agent:z.string().min(1).max(200),model:z.string().min(1).max(500),permission:z.enum(['default','full']).default('default')})
export const providerSchema=z.object({id:z.string().min(1).max(100),name:z.string().min(1).max(200),baseUrl:z.string().url().refine(s=>{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash}),models:z.array(z.string().min(1).max(200)).max(500),availableModels:z.array(z.string()).max(500).optional(),modelOptions:z.record(z.string(),z.object({maxTokens:z.number().int().min(256).max(393216).optional(),contextWindow:z.number().int().min(1024).max(2097152).optional(),reasoning:z.enum(['off','low','medium','high']).optional()}).strict()).optional(),apiKey:z.string().max(10000).optional()})
export const sendSchema=z.object({requestId:z.string().uuid(),text:z.string().max(50000),attachments:z.array(attachmentInput).max(10).default([]),context:contextSchema,retryMessageId:z.string().optional()}).strict().refine(v=>!!v.text.trim()||v.attachments.length>0||!!v.retryMessageId,'请输入内容或添加附件')
export type ProviderConfig=Omit<z.infer<typeof providerSchema>,'apiKey'>
export type SessionContext=z.infer<typeof contextSchema>
export type Part={type:'text';text:string}|{type:'tool-call';toolCallId:string;toolName:string;args:Record<string,unknown>;argsText:string;result?:unknown;isError?:boolean}
export type ChatMessage={reasoning?:string;phase?:'waiting'|'thinking'|'generating'|'tool'|'compacting',files?:string[];attachmentIds?:string[];id:string;role:'user'|'assistant';text:string;error?:string;stopped?:boolean;executing?:boolean;durationMs?:number;fileChanges?:FileChange[];parts?:Part[]}
export type FileChange={path:string;added:number;deleted:number;kind:'modified'|'added'|'deleted';binary?:boolean;diff:string[]}
export type PermissionRequest={id:string;tool:string;args:Record<string,unknown>;action:string;createdAt:number;taskId:string;toolCallId:string}
export type Session={compaction?:import('./compaction').CompactState;questionRequest?:import('./question-contracts').QuestionRequest;parentSessionId?:string;groupId?:string;agentId?:string;permissionRequest?:PermissionRequest;id:string;title:string;context:SessionContext;messages:ChatMessage[];group:string}



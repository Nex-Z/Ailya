import {deepseekProvider} from '@earendil-works/pi-ai/providers/deepseek'
import {moonshotaiProvider} from '@earendil-works/pi-ai/providers/moonshotai'
import {moonshotaiCnProvider} from '@earendil-works/pi-ai/providers/moonshotai-cn'
import {zaiProvider} from '@earendil-works/pi-ai/providers/zai'
import type {Model,SimpleStreamOptions} from '@earendil-works/pi-ai'
import type {ProviderConfig} from './contracts'

const deepseekModels=deepseekProvider().getModels()
const catalogs=[moonshotaiProvider(),moonshotaiCnProvider(),zaiProvider()]
function knownModel(provider:ProviderConfig,id:string){
 if(new URL(provider.baseUrl).origin==='https://api.deepseek.com')return deepseekModels.find(m=>m.id===id)
 const configured=provider.baseUrl.replace(/\/+$/,'')
 const base=configured==='https://api.z.ai/api/paas/v4'?'https://api.z.ai/api/coding/paas/v4':configured
 return catalogs.find(p=>p.baseUrl===base)?.getModels().find(m=>m.id===id)
}
export type ThinkingChoice='off'|'on'|'low'|'high'|'max'
export function thinkingChoices(provider:ProviderConfig,id:string):ThinkingChoice[]{
 const model=knownModel(provider,id)
 if(!model?.reasoning)return []
 if(new URL(provider.baseUrl).origin==='https://api.deepseek.com')return ['off','low','high','max']
 const off:ThinkingChoice[]=model.thinkingLevelMap?.off===null?[]:['off']
 if(model.compat?.supportsReasoningEffort===false)return [...off,'on']
 return [...off,...(['low','high','max'] as const).filter(level=>typeof model.thinkingLevelMap?.[level]==='string')]
}
export function modelRuntime(provider:ProviderConfig,id:string,choice?:ThinkingChoice){
 // Only apply a provider's protocol profile to its verified origin, never by model-name substring.
 const known=knownModel(provider,id)
 const override=provider.modelOptions?.[id]
 const contextWindow=Math.min(override?.contextWindow??known?.contextWindow??32768,known?.contextWindow??Infinity)
 const requested=override?.maxTokens??(known?32768:4096)
 const maxTokens=Math.min(requested,known?.maxTokens??requested,contextWindow)
 const reasoning=choice==='on'?'high':choice??override?.reasoning??(known?.reasoning?'low':undefined)
 const model:Model<'openai-completions'>={
  ...(known??{api:'openai-completions',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},compat:{supportsStore:false,supportsDeveloperRole:false,maxTokensField:'max_tokens'}}),
  id,name:known?.name??id,provider:provider.id,baseUrl:provider.baseUrl,contextWindow,maxTokens,
  reasoning:known?.reasoning??(reasoning!==undefined&&reasoning!=='off'),
  // DeepSeek /models and its thinking-mode docs confirm low for V4 Pro (2026-09-28).
  // Pi 0.87.1 still marks that level unsupported. Keep Pi's adapter and correct only catalog metadata.
  ...(known&&new URL(provider.baseUrl).origin==='https://api.deepseek.com'?{thinkingLevelMap:{...known.thinkingLevelMap,low:'low'}}:{}),
 }
 const options:SimpleStreamOptions={maxTokens,reasoning:reasoning==='off'?undefined:reasoning}
 return {model,options,source:known?'pi-catalog':'compatible-fallback'}
}

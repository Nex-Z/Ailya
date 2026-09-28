import type { IMConfig } from './components/IMSettings'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
export type Preferences={imConfigs?:IMConfig[];allowlist?:string;language:string;sendKey:string;model:string;core:string;imChannel:string;imAccount:string;imScope:string;imEnabled:boolean}
export const usePreferences=create<{config:Preferences;save:(config:Preferences)=>void}>()(persist(set=>({config:{language:'简体中文',sendKey:'Enter',model:'默认模型',core:'http://127.0.0.1:3000',imChannel:'Telegram',imAccount:'',imScope:'仅允许指定用户',imEnabled:false},save:config=>set({config})}),{name:'ailya-preferences-v1'}))



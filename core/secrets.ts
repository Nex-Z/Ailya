import { execFileSync } from 'node:child_process'
function dpapi(value:string, decrypt:boolean) {
 if(process.platform!=='win32') throw Error('本版本凭据保存需要 Windows DPAPI；其他平台请使用环境变量凭据')
 const setup="$ErrorActionPreference='Stop'; [void][Reflection.Assembly]::LoadWithPartialName('System.Security'); $v=[Console]::In.ReadToEnd(); "
 const script=decrypt ? '[Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))' : '[Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($v),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)))'
 try{return execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',setup+script],{input:value,encoding:'utf8',windowsHide:true,stdio:['pipe','pipe','pipe']}).trim()}catch{throw Error('Windows 凭据加密服务失败')}
}
export const encryptSecret=(value:string)=>dpapi(value,false)
export const decryptSecret=(value:string)=>dpapi(value,true)

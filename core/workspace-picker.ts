import {realpathSync,statSync} from 'node:fs'

let selecting=false
export async function pickWorkspace():Promise<string|null>{
 if(process.platform!=='win32')throw Error('当前系统尚未接入本机文件夹选择器')
 if(selecting)throw Error('文件夹选择器已经打开')
 selecting=true
 try{
  const script=`
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '选择 Ailya 工作空间'
try {
 if ($dialog.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) {
  [Console]::Write([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dialog.SelectedPath)))
 }
} finally { $dialog.Dispose(); $owner.Dispose() }
`
  const child=Bun.spawn(['powershell.exe','-NoProfile','-STA','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{stdout:'pipe',stderr:'pipe',windowsHide:true})
  const [output,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited])
  if(code!==0){console.error('Workspace picker failed',code,stderr);throw Error('无法打开本机文件夹选择器')}
  if(!output.trim())return null
  const path=realpathSync(Buffer.from(output.trim(),'base64').toString('utf8'))
  if(!statSync(path).isDirectory())throw Error('请选择有效文件夹')
  return path
 }finally{selecting=false}
}

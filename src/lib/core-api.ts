export async function api<T>(path:string,body?:unknown,method=body===undefined?'GET':'POST'):Promise<T>{
 const response=await fetch('/api'+path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})})
 const result=await response.json()
 if(!response.ok)throw Error(result.error??`Core 请求失败（${response.status}）`)
 return result
}

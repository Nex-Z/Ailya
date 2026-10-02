// Regex evaluation is isolated so a pathological user expression cannot block Core.
self.onmessage=(event:MessageEvent<{patterns:string[];action:string}>)=>{
 try{self.postMessage(event.data.patterns.some(pattern=>new RegExp(pattern).test(event.data.action)))}catch{self.postMessage(false)}
}

import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createServer } from 'vite';
const output=resolve('artifacts/check-back-popup');await mkdir(output,{recursive:true});
let complete,fail;const completed=new Promise((res,rej)=>{complete=res;fail=rej;});
const vite=await createServer({server:{host:'127.0.0.1',port:0},plugins:[{name:'popup-check',configureServer(server){server.middlewares.use(async(req,res,next)=>{if(req.url!=='/__popup-complete')return next();const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);await writeFile(resolve(output,'report.json'),body);console.log(body.toString());res.end();complete();});}}]});
let browser,timeout;
try{await vite.listen();const profile=await mkdtemp(resolve(tmpdir(),'popup-render-'));browser=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',['--headless=new','--disable-gpu-sandbox','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--window-size=1400,1000','--hide-scrollbars','--virtual-time-budget=8000',`--screenshot=${resolve(output,'preview.png')}`,`http://127.0.0.1:${vite.httpServer.address().port}/dont-sleep-with-the-fishes/artifacts/check-back-popup/index.html`],{windowsHide:true,stdio:'ignore'});browser.once('error',fail);const exited=new Promise(res=>browser.once('exit',res));timeout=setTimeout(()=>fail(new Error('Popup render timed out')),60000);await completed;await exited;}finally{clearTimeout(timeout);browser?.kill();await vite.close();}

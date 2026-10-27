import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {runtimeIdentity} from '../server/local-runtime.js';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function probe(port=3000,requireLocal=false){
  const occupied=await new Promise(resolve=>{
    const socket=createConnection({host:'127.0.0.1',port});
    socket.setTimeout(800);socket.once('connect',()=>{socket.destroy();resolve(true);});
    socket.once('error',()=>resolve(false));socket.once('timeout',()=>{socket.destroy();resolve(true);});
  });
  if(!occupied)return 'stopped';
  try{
    const response=await fetch(`http://127.0.0.1:${port}/api/local/ready`,{signal:AbortSignal.timeout(1500),redirect:'error'});
    const body=await response.json();
    if(response.ok&&Object.keys(runtimeIdentity).every(key=>body[key]===runtimeIdentity[key])&&(!requireLocal||body.localAdminMode===true))return 'ready';
  }catch{}
  return 'occupied';
}
export async function launch({inspect=probe,start,open,check,delay=()=>new Promise(resolve=>setTimeout(resolve,350)),attempts=90}={}){
  const state=await inspect();
  if(state==='ready'){await open();return {reused:true};}
  if(state!=='stopped')throw new Error('Cổng 3000 đang được ứng dụng khác (hoặc phiên bản IVAN cũ) sử dụng. Hãy tắt ứng dụng đó rồi thử lại.');
  await check();
  const child=start();let exited=false;
  child.once('exit',()=>{exited=true;});child.once('error',()=>{exited=true;});
  for(let attempt=0;attempt<attempts;attempt++){
    await delay();
    if(exited)throw new Error('Server dừng trước khi sẵn sàng. Xem lỗi phía trên; kiểm tra .env và dependencies.');
    if(await inspect()==='ready'){await open();return {reused:false,child};}
  }
  child.kill();throw new Error('Server chưa sẵn sàng sau thời gian chờ; đã yêu cầu tắt tiến trình vừa tạo.');
}
async function main(){
  process.chdir(root);
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<24||(major===24&&minor<15))throw new Error('Cần Node.js 24.15 trở lên.');
  let server;
  const stop=()=>{if(server&&!server.killed)server.kill('SIGTERM');};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  try{
    const result=await launch({
      inspect:()=>probe(3000,true),
      check:async()=>{
        try{for(const name of ['express','express-session','express-rate-limit','google-auth-library','helmet','sharp'])await import(name);}
        catch{throw new Error('Dependencies thiếu hoặc không dùng được. Chạy npm.cmd ci trong thư mục dự án rồi mở lại launcher.');}
      },
      start:()=>{console.log('Đang khởi động quản trị local. Giữ cửa sổ này mở; nhấn Ctrl+C để tắt Admin.');return server=spawn(process.execPath,['--env-file-if-exists=.env','server/index.js'],{cwd:root,stdio:'inherit',shell:false,env:{...process.env,LOCAL_ADMIN_MODE:'true'}});},
      open:()=>new Promise((resolve,reject)=>{
        const browser=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Start-Process 'http://127.0.0.1:3000/admin'"],{windowsHide:true,stdio:'inherit',shell:false});
        browser.once('error',reject);browser.once('exit',code=>code===0?resolve():reject(new Error('Không mở được trình duyệt. Mở http://127.0.0.1:3000/admin bằng tay.')));
      })
    });
    if(result.reused)console.log('Server đã chạy; đã mở Admin. Tắt server tại cửa sổ đã khởi động trước đó.');
    else server.once('exit',code=>{if(code)process.exitCode=1;});
  }catch(error){stop();throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(error=>{console.error(error.message);process.exitCode=1;});

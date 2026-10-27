import { spawn } from 'node:child_process';

export class PublishError extends Error {
  constructor(code,message,hint='',status=409){super(message);this.code=code;this.hint=hint;this.status=status;}
}
export function gitFailure(error){
  if(error instanceof PublishError)return error;
  if(error.code==='ENOENT')return new PublishError('GIT_NOT_FOUND','Không tìm thấy Git trên máy.','Cài Git for Windows, mở lại terminal rồi chạy lại npm.cmd start.');
  const detail=String(error.stderr||error.message||'');
  if(/Authentication failed|User canceled authentication|No stored credentials|could not read Username|terminal prompts disabled|credential|logon failed|Permission denied \(publickey\)/i.test(detail))return new PublishError('GIT_AUTH','Git chưa xác thực được GitHub.','Đăng nhập Git Credential Manager trong terminal Windows bằng git credential-manager github login, rồi thử lại.');
  if(/index.lock|another git process/i.test(detail))return new PublishError('GIT_LOCK','Git đang bị khóa bởi tiến trình khác.','Kiểm tra tiến trình Git trong terminal; không tự xóa index.lock nếu Git vẫn đang chạy.');
  if(/Author identity unknown|unable to auto-detect email/i.test(detail))return new PublishError('GIT_IDENTITY','Chưa cấu hình tác giả commit.','Cấu hình git user.name và user.email trong terminal; CMS không lấy email từ ADMIN_EMAIL.');
  if(/rejected|non-fast-forward|protected branch|GH006|GH013|403|permission to .* denied/i.test(detail))return new PublishError('PUSH_REJECTED','GitHub từ chối push.','Kiểm tra quyền tài khoản, bảo vệ nhánh và origin/main. Không dùng force push. Commit local được giữ lại để xử lý hoặc thử lại.');
  if(/resolve host|connect|timed? out|network|unable to access|EACCES|ENOTFOUND/i.test(detail))return new PublishError('NETWORK','Không kết nối được GitHub.','Kiểm tra mạng/proxy/tường lửa rồi thử lại. Không xóa commit local nếu thao tác đã tạo commit.');
  return new PublishError('GIT_FAILED','Lệnh Git không hoàn tất.','Kiểm tra git status và cấu hình Git trong terminal. CMS không hiển thị raw stderr để tránh lộ credential.');
}
export function runGit(args,{cwd,stdin='',timeout=60000,env={}}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn('git',['--no-pager',...args],{cwd,shell:false,windowsHide:true,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never',...env},stdio:['pipe','pipe','pipe']});
  let stdout='',stderr='',settled=false;
  const timer=setTimeout(()=>{child.kill();finish(new Error('Git network timeout'));},timeout);
  function finish(error){if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(stdout);}
  child.stdout.on('data',data=>{stdout+=data;if(stdout.length>8*1024*1024)child.kill();});
  child.stderr.on('data',data=>{if(stderr.length<1024*1024)stderr+=data;});
  child.on('error',finish);child.on('close',code=>{if(code!==0){const error=new Error('Git failed');error.stderr=stderr;error.exitCode=code;finish(error);}else finish();});
  child.stdin.on('error',()=>{});child.stdin.end(stdin);
 });
}

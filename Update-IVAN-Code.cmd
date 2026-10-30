@echo off
setlocal
title IVAN Base Drive - Update code
set "IVAN_UPDATE_FILE=%~f0"
cd /d "%~dp0"
where powershell.exe >nul 2>nul
if errorlevel 1 (
  echo Windows PowerShell is required.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$s=Get-Content -LiteralPath $env:IVAN_UPDATE_FILE -Raw -Encoding UTF8; & ([scriptblock]::Create(($s -split '(?m)^# IVAN_POWERSHELL_PAYLOAD\r?$',2)[1]))"
set "IVAN_UPDATE_RESULT=%errorlevel%"
echo.
pause
exit /b %IVAN_UPDATE_RESULT%
# IVAN_POWERSHELL_PAYLOAD
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$root = Split-Path -LiteralPath $env:IVAN_UPDATE_FILE
Set-Location -LiteralPath $root
$expectedRemote = 'https://github.com/IvanCode-ddt/IVAN-Base-Drive'
$pages = 'https://ivancode-ddt.github.io/IVAN-Base-Drive/'
$actions = 'https://github.com/IvanCode-ddt/IVAN-Base-Drive/actions'

function Quote-Argument([string]$value) {
  '"' + [regex]::Replace([regex]::Replace($value, '(\\*)"', '$1$1\"'), '(\\+)$', '$1$1') + '"'
}
function Run([string]$program, [string[]]$arguments, [string]$inputText = '') {
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $program
  $info.Arguments = (($arguments | ForEach-Object { Quote-Argument $_ }) -join ' ')
  $info.WorkingDirectory = $root
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  $info.RedirectStandardInput = $true
  $info.StandardOutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $info.StandardErrorEncoding = New-Object System.Text.UTF8Encoding($false)
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $info
  if (!$process.Start()) { throw "Không chạy được $program." }
  $stdout = $process.StandardOutput.ReadToEndAsync()
  $stderr = $process.StandardError.ReadToEndAsync()
  if ($inputText) {
    $bytes = [Text.Encoding]::UTF8.GetBytes($inputText)
    $process.StandardInput.BaseStream.Write($bytes, 0, $bytes.Length)
    $process.StandardInput.BaseStream.Flush()
  }
  $process.StandardInput.Close()
  $process.WaitForExit()
  $code = $process.ExitCode
  $text = $stdout.GetAwaiter().GetResult()
  $null = $stderr.GetAwaiter().GetResult() # Never print raw credential/provider errors.
  $process.Dispose()
  if ($code -ne 0) { throw "Lệnh $program thất bại (mã $code). Kiểm tra mạng, đăng nhập Git Credential Manager, quyền repository và cấu hình Git. Không force push/reset; script đã dừng." }
  return $text
}
function Git([string[]]$arguments, [string]$inputText = '') {
  Run $script:gitExe (@('--no-pager') + $arguments) $inputText
}
function Paths([string]$text) { @($text.Split([char]0) | Where-Object { $_ -ne '' }) }
function Allowed([string]$name) {
  if ($name.StartsWith('docs/')) {
    return $name -match '^docs/(index\.html|\.nojekyll|content/posts\.json|css/style\.css|js/(main|data|content|post-source|media|markdown)\.js|images/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif|avif|ico)|uploads/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp)$'
  }
  # Exclude private/cache directories at ANY depth, even if tracked accidentally.
  $checked = $name -replace '^\.github/', 'github/'
  if ($checked -match '(^|/)(\.[^/]+|node_modules|data|uploads|backups?|private|secrets?|credentials?|logs?|coverage|test-artifacts|publish-previews|temp|tmp)(/|$)' -and $name -ne '.gitignore') { return $false }
  if ($name -match '(?i)\.(sqlite\d*|db)([-.]|$)|\.(bak|backup|log|pem|key|p12|pfx|lnk)$|(^|/)[^/]*(credentials?|client[_-]?secrets?|service[_-]?accounts?|tokens?|secrets?|backups?)[^/]*\.(json|txt|ya?ml)$|(^|/)(id_rsa|id_ed25519)(\.|$)|[\x00-\x1f]') { return $false }
  return $name -eq '.gitignore' -or $name -match '(^|/)(LICENSE|NOTICE)$|\.(js|mjs|cjs|ts|tsx|jsx|html|css|scss|sass|less|json|md|txt|cmd|bat|ps1|yml|yaml|png|jpe?g|webp|gif|avif|ico|mp3|wav|ogg|m4a|flac)$'
}
function Assert-Repository([string]$head) {
  if ((Git @('branch','--show-current')).Trim() -ne 'main') { throw 'Chỉ cập nhật từ nhánh main. Hãy chuyển nhánh thủ công.' }
  if ((Git @('rev-parse','HEAD')).Trim() -ne $head) { throw 'HEAD đã thay đổi trong lúc cập nhật. Hãy chạy lại.' }
  foreach ($arguments in @(@('remote','get-url','--all','origin'), @('remote','get-url','--push','--all','origin'))) {
    $urls = @((Git $arguments).Trim() -split '\r?\n')
    if ($urls.Count -ne 1 -or $urls[0].TrimEnd('/') -notin @($expectedRemote, "$expectedRemote.git")) { throw 'origin phải là HTTPS repository IvanCode-ddt/IVAN-Base-Drive, chỉ một URL fetch/push. Không tự sửa remote.' }
  }
  $remote = (Git @('ls-remote','--exit-code','origin','refs/heads/main')).Trim() -split '\s+'
  if ($remote[0] -ne $head) { throw 'origin/main khác HEAD local. Đồng bộ/giải quyết Git thủ công trước; không tự pull, merge, reset hoặc force push.' }
}
function Validate-Public-And-Source([string[]]$names) {
  # Same public DTO validator as the Admin publisher; temp bundle contains only allowlisted assets.
  # All code below is fixed, never constructed from a filename or commit message.
  $javascript = @'
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {validateBundle,allowedPublishPath} from './server/publish-bundle.js';
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const names=JSON.parse(Buffer.concat(chunks).toString('utf8'));
const secrets=Object.entries(process.env).filter(([key,value])=>/(SECRET|TOKEN|PASSWORD|ADMIN_EMAIL)/i.test(key)&&value.length>=8).map(([,value])=>value);
const pattern=/(?:gh[pousr]_[a-zA-Z0-9]{25,}|github_pat_[a-zA-Z0-9_]{30,}|GOCSPX-[a-zA-Z0-9_-]{20,}|ya29\.[a-zA-Z0-9_-]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----(?:\s|\\[rn])+[A-Za-z0-9+/=]{32,})/;
async function safeFile(name){
 let component=process.cwd();for(const part of name.split('/')){component=path.join(component,part);try{if((await fs.lstat(component)).isSymbolicLink())throw Error('SYMLINK');}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 const stat=await fs.lstat(name);if(!stat.isFile()||stat.size>50*1024*1024)throw Error('UNSAFE_FILE');
 const bytes=await fs.readFile(name),text=bytes.toString('utf8');
 if(pattern.test(text)||secrets.some(secret=>text.toLowerCase().includes(secret.toLowerCase())))throw Error('PRIVATE_DATA');
 return bytes;
}
let directory;
try{
 for(const name of names)await safeFile(name);
 directory=await fs.mkdtemp(path.join(os.tmpdir(),'ivan-code-review-'));
 async function walk(folder){for(const entry of await fs.readdir(folder,{withFileTypes:true})){const name=folder+'/'+entry.name;if(entry.isDirectory()){if(entry.name.startsWith('.'))throw Error('UNSAFE_BUNDLE');await walk(name);}else if(allowedPublishPath(name)){const bytes=await safeFile(name);const target=path.join(directory,name.slice(5));await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}}}
 await walk('docs');
 await validateBundle({directory,databasePath:path.resolve(process.env.DATABASE_PATH||'data/ivan.sqlite'),secrets,adminEmail:process.env.ADMIN_EMAIL||''});
 console.log('OK');
}catch{console.error('Public/source validation failed. No secret details are printed.');process.exitCode=1;}
finally{if(directory)await fs.rm(directory,{recursive:true,force:true});}
'@
  $json = ConvertTo-Json -Compress -InputObject @($names)
  $null = Run $script:nodeExe @('--env-file-if-exists=.env','--input-type=module','-e',$javascript) $json
}

# IVAN_UPDATE_MAIN
try {
  $key = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant()))).Replace('-','')
  $mutex = New-Object System.Threading.Mutex -ArgumentList @($false, "Local\IVAN-Code-$key")
  if (!$mutex.WaitOne(0)) { throw 'Đã có một cửa sổ cập nhật code đang chạy. Đóng/hoàn tất cửa sổ đó trước.' }
  $ownsMutex = $true
  $script:gitExe = (Get-Command git.exe -ErrorAction Stop).Source
  $script:nodeExe = (Get-Command node.exe -ErrorAction Stop).Source
  $npm = (Get-Command npm.cmd -ErrorAction Stop).Source
  $null = Git @('--version')
  $null = Run $nodeExe @('-e','const [a,b]=process.versions.node.split(".").map(Number);if(a<24||(a===24&&b<15))process.exit(1);')
  if ([IO.Path]::GetFullPath((Git @('rev-parse','--show-toplevel')).Trim()).TrimEnd('\') -ne [IO.Path]::GetFullPath($root).TrimEnd('\')) { throw 'Launcher phải nằm tại thư mục gốc repository.' }
  $head = (Git @('rev-parse','HEAD')).Trim()
  if ((Git @('diff','--cached','--name-only')).Trim()) { throw 'Đang có file được stage từ trước. Hãy kiểm tra và xử lý index thủ công trước; script không tự unstage.' }
  if ((Git @('ls-files','--unmerged')).Trim()) { throw 'Có conflict chưa giải quyết. Đã dừng.' }
  foreach ($marker in @('MERGE_HEAD','CHERRY_PICK_HEAD','REVERT_HEAD','rebase-merge','rebase-apply')) {
    if (Test-Path -LiteralPath (Git @('rev-parse','--git-path',$marker)).Trim()) { throw 'Git đang merge/rebase/cherry-pick. Hoàn tất thủ công trước.' }
  }
  Assert-Repository $head
  $null = Git @('var','GIT_AUTHOR_IDENT')
  Write-Host 'Đang chạy npm.cmd run export...'
  # cmd.exe is needed only for the installed npm.cmd; no user input is interpolated.
  & $npm run export
  if ($LASTEXITCODE -ne 0) { throw 'Export thất bại. Không stage, commit hoặc push.' }
  $changed = @(Paths (Git @('diff','--name-only','--no-renames','-z','HEAD','--')))
  $changed += @(Paths (Git @('ls-files','--others','--exclude-standard','-z')))
  $changed = @($changed | Sort-Object -Unique)
  $approved = @($changed | Where-Object { Allowed $_ })
  if (@($approved | Where-Object { $_ -match '^server/|^package(-lock)?\.json$|^scripts/launch-admin\.mjs$|^IVAN-Admin\.cmd$' }).Count) {
    Write-Host 'Có thay đổi backend/launcher. Nếu Admin đang chạy, hãy khởi động lại thủ công bằng Ctrl+C rồi IVAN-Admin.cmd sau khi cập nhật.'
    Write-Host 'Updater không tắt/khởi động server, không đổi session và không chạy Google OAuth.'
  }
  $skipped = @($changed | Where-Object { !(Allowed $_) })
  if ($skipped.Count) { Write-Host "`nKHÔNG đưa vào commit (ngoài danh sách cho phép):"; $skipped | ForEach-Object { Write-Host "  BỎ QUA  $_" } }
  if (!$approved.Count) { Write-Host 'Không có thay đổi code/docs hợp lệ để cập nhật.'; exit 0 }
  Write-Host 'Đang kiểm tra dữ liệu công khai, secret và file an toàn...'
  Validate-Public-And-Source $approved
  $snapshots = @{}
  Write-Host "`nTOÀN BỘ FILE SẼ COMMIT (A=thêm, M=sửa, D=xóa):"
  foreach ($name in $approved) {
    $tracked = @(Paths (Git @('--literal-pathspecs','ls-files','-z','--',$name))).Count -gt 0
    $exists = Test-Path -LiteralPath (Join-Path $root $name) -PathType Leaf
    $status = if (!$exists) {'D'} elseif (!$tracked) {'A'} else {'M'}
    Write-Host "  $status  $name"
    $snapshots[$name] = if ($exists) {(Git @('hash-object',"--path=$name",'--',$name)).Trim()} else {'DELETED'}
  }
  Write-Host "`nChỉ commit danh sách trên và push origin main. Không force push."
  Write-Host 'Nếu hủy, file export trong docs vẫn được giữ local; chưa stage/commit/push.'
  $answer = Read-Host 'Nhấn Y để xác nhận; N hoặc lựa chọn khác để hủy'
  if ($answer.Trim() -cnotmatch '^[Yy]$') { Write-Host 'Đã hủy. Không commit hoặc push.'; exit 0 }
  Assert-Repository $head
  if ((Git @('diff','--cached','--name-only')).Trim()) { throw 'Index đã thay đổi trong lúc xác nhận. Đã dừng.' }
  Validate-Public-And-Source $approved
  foreach ($name in $approved) {
    $hash = if (Test-Path -LiteralPath (Join-Path $root $name) -PathType Leaf) {(Git @('hash-object',"--path=$name",'--',$name)).Trim()} else {'DELETED'}
    if ($hash -ne $snapshots[$name]) { throw 'File đã thay đổi sau khi xem trước. Chạy lại để kiểm tra danh sách mới.' }
  }
  $pathspec = ($approved -join [char]0) + [char]0
  $null = Git @('--literal-pathspecs','add','--pathspec-from-file=-','--pathspec-file-nul') $pathspec
  $staged = @(Paths (Git @('diff','--cached','--name-only','--no-renames','-z')) | Sort-Object -Unique)
  if (@(Compare-Object $approved $staged).Count) { throw 'Index không khớp danh sách đã xác nhận. Không commit; kiểm tra Git index thủ công.' }
  foreach ($name in $approved) {
    if ($snapshots[$name] -ne 'DELETED' -and (Git @('rev-parse',":$name")).Trim() -ne $snapshots[$name]) { throw 'Nội dung đã stage không khớp bản xem trước. Không commit; kiểm tra index thủ công.' }
  }
  $message = 'Update IVAN code and public website ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
  $noHooks = Join-Path ([IO.Path]::GetTempPath()) ('ivan-no-hooks-' + [Guid]::NewGuid().ToString())
  $null = Git @('--literal-pathspecs','-c',"core.hooksPath=$noHooks",'-c','commit.gpgsign=false','commit','--only','--pathspec-from-file=-','--pathspec-file-nul','-m',$message) $pathspec
  $commit = (Git @('rev-parse','HEAD')).Trim()
  if ((Git @('rev-parse','HEAD^')).Trim() -ne $head) { throw 'Commit có lịch sử bất thường. Đã dừng trước push.' }
  $committed = @(Paths (Git @('diff-tree','--no-commit-id','--name-only','--no-renames','-r','-z',$commit)) | Sort-Object -Unique)
  if (@(Compare-Object $approved $committed).Count) { throw 'Commit không khớp danh sách xác nhận. Đã dừng trước push.' }
  foreach ($name in $approved) {
    if ($snapshots[$name] -ne 'DELETED' -and (Git @('rev-parse',"${commit}:$name")).Trim() -ne $snapshots[$name]) { throw 'Nội dung commit không khớp bản đã kiểm tra. Đã dừng trước push.' }
  }
  # Recheck remote immediately before a normal push; Git itself rejects races/non-fast-forward.
  if ((Git @('branch','--show-current')).Trim() -ne 'main') { throw 'Nhánh đã thay đổi. Đã dừng trước push.' }
  $remote = (Git @('ls-remote','--exit-code','origin','refs/heads/main')).Trim() -split '\s+'
  if ($remote[0] -ne $head -or (Git @('rev-parse','HEAD')).Trim() -ne $commit) { throw 'Remote hoặc HEAD đã đổi. Commit được giữ local; đồng bộ Git thủ công, không force push.' }
  Validate-Public-And-Source $approved
  foreach ($name in $approved) {
    $hash = if (Test-Path -LiteralPath (Join-Path $root $name) -PathType Leaf) {(Git @('hash-object',"--path=$name",'--',$name)).Trim()} else {'DELETED'}
    if ($hash -ne $snapshots[$name]) { throw 'File đã đổi sau commit. Đã dừng trước push; commit được giữ local.' }
  }
  Write-Host 'Đang push origin main bằng Git Credential Manager...'
  $null = Git @('push','origin','main')
  Write-Host "`nTHÀNH CÔNG. Commit: $commit"
  Write-Host "GitHub Pages: $pages"
  Write-Host "GitHub Actions: $actions"
  Write-Host 'GitHub Pages có thể cần thêm thời gian cập nhật.'
  exit 0
} catch {
  Write-Host "`nLỖI: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host 'Không tự reset/merge hoặc xóa dữ liệu. Nếu đã tạo commit nhưng push lỗi, commit vẫn nằm local; kiểm tra Git trước khi chạy lại.'
  Write-Host 'Nếu chưa đăng nhập GitHub: dùng Git Credential Manager (git credential-manager github login). Không dán token vào script.'
  exit 1
} finally {
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  if ($mutex) { $mutex.Dispose() }
}

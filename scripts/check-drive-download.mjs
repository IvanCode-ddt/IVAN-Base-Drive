// Anonymous, bounded HTTP check. Never reads .env, cookies, OAuth tokens, or private APIs.
// Usage: node scripts/check-drive-download.mjs FILE_ID [RESOURCE_KEY]
import { pathToFileURL } from 'node:url';

export async function inspectLink(url, { download = false, fetcher = fetch } = {}) {
  const response = await fetcher(url, { redirect:'follow', signal:AbortSignal.timeout(20000) });
  const type = response.headers.get('content-type') || '';
  const disposition = response.headers.get('content-disposition') || '';
  const reader = response.body?.getReader();
  let sample = '', bytes = 0;
  try {
    while (reader && bytes < 65536) {
      const {done,value} = await reader.read(); if(done) break;
      bytes += value.byteLength;
      if (/html|text/i.test(type)) sample += new TextDecoder().decode(value);
      if (download && !/html/i.test(type)) break;
    }
  } finally { await reader?.cancel(); }
  const html = /html/i.test(type);
  const login = /accounts\.google\.com/.test(response.url) || /ServiceLogin|identifierId|type=["']password/i.test(sample);
  const confirmation = html && /download anyway|virus.scan|virus scan|confirm=|download-form|không thể quét|vẫn tải xuống/i.test(sample);
  const result = !response.ok ? 'http-error' : login ? 'login-required' : confirmation ? 'google-confirmation-required' : download && !html && (disposition || type) ? 'download-started' : html ? 'html-page-not-file' : 'response-received';
  return { status:response.status, contentType:type, hasAttachmentHeader:/attachment/i.test(disposition), sampledBytes:bytes, result };
}

export async function checkFile(fileId, resourceKey = '') {
  if (!/^[\w-]{1,200}$/.test(fileId)) throw new Error('Invalid file ID');
  const view = new URL(`https://drive.google.com/file/d/${fileId}/view`);
  if (resourceKey) view.searchParams.set('resourcekey',resourceKey);
  const report = {fileId, mode:'anonymous-no-OAuth', checkedAt:new Date().toISOString()};
  try { report.view = await inspectLink(view.href); }
  catch { report.view = { result:'network-error' }; }
  try {
    const response = await fetch('http://localhost:3000/api/posts',{signal:AbortSignal.timeout(5000)});
    if(!response.ok)throw new Error();
    const posts = await response.json();
    const file = posts.flatMap(p=>p.drive_files||[]).find(f=>f.file_id===fileId && f.can_download===1 && f.download_url);
    if(!file) report.download = {result:'no-approved-download-link-in-public-API'};
    else {
      // Only follow the exact link supplied by Google and published by the application.
      const url = new URL(file.download_url);
      if(url.protocol!=='https:' || !['drive.google.com','docs.google.com','drive.usercontent.google.com'].includes(url.hostname) || url.username || url.password || url.searchParams.has('access_token'))throw new Error();
      report.download = await inspectLink(url.href,{download:true});
    }
  } catch { report.download = {result:'public-API-or-download-unavailable'}; }
  return report;
}

if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await checkFile(process.argv[2],process.argv[3]),null,2)); }
  catch { console.error('Usage: node scripts/check-drive-download.mjs FILE_ID [RESOURCE_KEY]'); process.exitCode=1; }
}

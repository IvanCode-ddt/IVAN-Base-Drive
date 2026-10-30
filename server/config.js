import path from 'node:path';
import {readFileSync,existsSync} from 'node:fs';
import {validateLocalRuntime} from './local-admin.js';
import {publicFormURL,DEFAULT_FEEDBACK_FORM_URL} from './public-settings.js';
export function readConfig(env = process.env) {
  const settingsPath=path.resolve('data/feedback-config.json');let feedbackSettings={};
  if(existsSync(settingsPath)){try{feedbackSettings=JSON.parse(readFileSync(settingsPath,'utf8'));if(!feedbackSettings||typeof feedbackSettings!=='object'||Array.isArray(feedbackSettings))throw Error();}catch{throw new Error('Cấu hình data/feedback-config.json không hợp lệ.');}}
  for(const key of ['spreadsheetId','sheetName','serviceAccountFile'])if(feedbackSettings[key]!==undefined&&typeof feedbackSettings[key]!=='string')throw new Error('Các trường cấu hình Sheets phải là chuỗi.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT không hợp lệ.');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET phải có ít nhất 32 ký tự ngẫu nhiên.');
  const baseUrl = env.BASE_URL || `http://localhost:${port}`;
  const base = new URL(baseUrl);
  // LOCAL_ADMIN_MODE is retired and deliberately ignored, even if an old .env sets it.
  validateLocalRuntime({baseUrl});
  if (!['http:', 'https:'].includes(base.protocol) || base.origin !== baseUrl) throw new Error('BASE_URL phải là origin, không có dấu / cuối.');
  const redirectUri = env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/google/callback`;
  if (redirectUri !== `${baseUrl}/auth/google/callback`) throw new Error('GOOGLE_REDIRECT_URI phải khớp BASE_URL/auth/google/callback.');
  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('Hãy cấu hình ADMIN_EMAIL.');
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Thiếu cấu hình Google OAuth trong .env.');
  const driveRootId = env.GOOGLE_DRIVE_FOLDER_ID || '15wgG35QoLwK6Z5H1re_HCCednk7-O3Qp';
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(driveRootId)) throw new Error('GOOGLE_DRIVE_FOLDER_ID không hợp lệ.');
  return { feedbackFormUrl:publicFormURL(env.FEEDBACK_FORM_URL??DEFAULT_FEEDBACK_FORM_URL),feedback:{enabled:env.FEEDBACK_SHEETS_ENABLED!==undefined?env.FEEDBACK_SHEETS_ENABLED==='true':feedbackSettings.enabled===true,spreadsheetId:env.FEEDBACK_SPREADSHEET_ID??feedbackSettings.spreadsheetId??'',sheetName:env.FEEDBACK_SHEET_NAME??feedbackSettings.sheetName??'',serviceAccountFile:env.FEEDBACK_SERVICE_ACCOUNT_FILE??feedbackSettings.serviceAccountFile??''},port, baseUrl, redirectUri, adminEmail, driveRootId, nodeEnv:env.NODE_ENV||'development', clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, sessionSecret: env.SESSION_SECRET, databasePath: path.resolve(env.DATABASE_PATH || 'data/ivan.sqlite'), secure: base.protocol === 'https:' };
}

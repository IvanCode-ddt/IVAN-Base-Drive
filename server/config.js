import path from 'node:path';
import {validateLocalMode} from './local-admin.js';
export function readConfig(env = process.env) {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT không hợp lệ.');
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET phải có ít nhất 32 ký tự ngẫu nhiên.');
  const baseUrl = env.BASE_URL || `http://localhost:${port}`;
  const base = new URL(baseUrl);
  const localAdminMode=env.LOCAL_ADMIN_MODE==='true';
  validateLocalMode({localAdminMode,baseUrl,nodeEnv:env.NODE_ENV});
  if (!['http:', 'https:'].includes(base.protocol) || base.origin !== baseUrl) throw new Error('BASE_URL phải là origin, không có dấu / cuối.');
  const redirectUri = env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/google/callback`;
  if (redirectUri !== `${baseUrl}/auth/google/callback`) throw new Error('GOOGLE_REDIRECT_URI phải khớp BASE_URL/auth/google/callback.');
  const adminEmail = (env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new Error('Hãy cấu hình ADMIN_EMAIL.');
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error('Thiếu cấu hình Google OAuth trong .env.');
  const driveRootId = env.GOOGLE_DRIVE_FOLDER_ID || '15wgG35QoLwK6Z5H1re_HCCednk7-O3Qp';
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(driveRootId)) throw new Error('GOOGLE_DRIVE_FOLDER_ID không hợp lệ.');
  return { localAdminMode,port, baseUrl, redirectUri, adminEmail, driveRootId, nodeEnv:env.NODE_ENV||'development', clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, sessionSecret: env.SESSION_SECRET, databasePath: path.resolve(env.DATABASE_PATH || 'data/ivan.sqlite'), secure: base.protocol === 'https:' };
}

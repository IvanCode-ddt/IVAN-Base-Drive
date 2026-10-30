import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validatePost,validatePin, InputError } from './posts.js';
import { DRIVE_SCOPE, DriveError } from './drive.js';
import { registerDriveRoutes, selectedDriveFiles } from './drive-routes.js';
import { oauthFailure } from './oauth-error.js';
import { registerMedia } from './media.js';
import {createPublisher} from './publisher.js';
import {registerPublishRoutes} from './publish-routes.js';
import {PublishError} from './publish-git.js';
import {runtimeIdentity} from './local-runtime.js';
import {validateLocalRuntime,localRequestAllowed} from './local-admin.js';
import {hasGoogleAdminSession,ADMIN_SESSION_MS} from './google-session.js';
import {FeedbackError,registerFeedbackRoutes} from './feedback.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const random = () => randomBytes(32).toString('hex');
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createApp({ config, db, oauthClient, driveRequest, feedbackTransport, uploadDir=path.join(root,'uploads'), publisher, sessionStore, now=Date.now }) {
  validateLocalRuntime(config);
  const app = express();
  const oauth = oauthClient || new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  app.disable('x-powered-by');
  app.use((req,res,next)=>localRequestAllowed(req,config)?next():res.status(403).json({error:'Chỉ cho phép truy cập trực tiếp từ máy local, đúng Host và Origin.',code:'LOCAL_ONLY'}));
  app.get('/api/local/ready',(req,res)=>res.set('Cache-Control','no-store').json(runtimeIdentity));
  // Keep OAuth cookies and CSRF on the configured origin when the desktop opens 127.0.0.1.
  app.use((req,res,next)=>{
    const base=new URL(config.baseUrl);
    if(req.get('host')===`127.0.0.1:${base.port||'80'}`&&base.hostname==='localhost'){
      if(req.method==='GET'||req.method==='HEAD')return res.redirect(302,base.origin+req.originalUrl);
      return res.status(403).json({error:'Hãy sử dụng địa chỉ localhost đang cấu hình.'});
    }
    next();
  });
  app.use(helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'https:'], 'media-src': ["'self'", 'https:'], 'frame-src': ["'self'", 'https://docs.google.com','https://drive.google.com'], 'style-src': ["'self'", "'unsafe-inline'"], 'script-src': ["'self'"], 'upgrade-insecure-requests': config.secure ? [] : null } }, strictTransportSecurity: config.secure ? undefined : false }));
  app.use(express.json({ limit: '150kb' }));
  app.use(session({ name:'ivan.sid', secret:config.sessionSecret, store:sessionStore, resave:false, saveUninitialized:false, cookie:{ httpOnly:true, secure:config.secure, sameSite:'lax', maxAge:ADMIN_SESSION_MS } }));
  const admin = (req,res,next) => {
    if (hasGoogleAdminSession(req.session,config,now())) return next();
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error:'Cần đăng nhập quản trị.' });
    return res.redirect('/login');
  };
  const csrf = (req,res,next) => {
    if (req.get('origin') !== config.baseUrl || !equal(req.get('x-csrf-token'),req.session.csrf)) return res.status(403).json({ error:'CSRF không hợp lệ. Hãy tải lại trang.' });
    next();
  };
  app.use(['/admin','/api/admin','/auth','/login'], (req,res,next) => { res.set('Cache-Control','no-store'); next(); });
  const authLimiter = rateLimit({ windowMs:15*60*1000, limit:30, standardHeaders:'draft-8', legacyHeaders:false });
  app.get('/login', (req,res) => res.sendFile(path.join(root,'admin/login.html')));
  app.get('/auth/google', authLimiter, async (req,res,next) => {
    try {
      req.session.oauth = { state:random(), nonce:random(), verifier:random(), created:Date.now() };
      const { state,nonce,verifier } = req.session.oauth;
      const codeChallenge = createHash('sha256').update(verifier).digest('base64url');
      req.session.save(error => error ? next(error) : res.redirect(oauth.generateAuthUrl({ scope:['openid','email',DRIVE_SCOPE], state, nonce, access_type:'online', code_challenge:codeChallenge, code_challenge_method:'S256', prompt:'consent select_account' })));
    } catch(error) { next(error); }
  });
  app.get('/auth/google/callback', authLimiter, async (req,res) => {
    const pending = req.session.oauth;
    delete req.session.oauth;
    if (!pending || Date.now()-pending.created > 10*60*1000 || !equal(req.query.state,pending.state) || typeof req.query.code !== 'string' || req.query.code.length > 4096) return res.status(400).send('Phiên đăng nhập không hợp lệ. Trở về /login để thử lại.');
    let stage = 'exchange';
    try {
      const { tokens } = await oauth.getToken({ code:req.query.code, codeVerifier:pending.verifier, redirect_uri:config.redirectUri });
      stage = 'verify';
      const ticket = await oauth.verifyIdToken({ idToken:tokens.id_token, audience:config.clientId });
      const identity = ticket.getPayload();
      if (!identity || identity.nonce !== pending.nonce || identity.email_verified !== true || identity.email?.toLowerCase() !== config.adminEmail || !identity.sub) return res.status(403).send('Tài khoản này không có quyền quản trị.');
      stage = 'session';
      await new Promise((resolve,reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
      req.session.admin = { provider:'google',email:config.adminEmail,sub:identity.sub,expiresAt:now()+ADMIN_SESSION_MS };
      req.session.csrf = random();
      // Store only short-lived access credentials in the server's memory session.
      // Never store an ID token or a refresh token, even if Google returns one.
      if (tokens.access_token && tokens.scope?.split(' ').includes(DRIVE_SCOPE)) {
        req.session.drive = { access_token:tokens.access_token, scope:tokens.scope, expiry_date:tokens.expiry_date || Date.now()+3600000 };
      }
      await new Promise((resolve,reject) => req.session.save(error => error ? reject(error) : resolve()));
      // A 302 keeps the Google redirect chain cross-site, so the local guard would
      // reject /admin. Commit a local document first; its navigation is same-origin.
      // Static markup only: never include OAuth query parameters or credentials.
      if(req.get('sec-fetch-site')==='cross-site'||(req.get('origin')&&req.get('origin')!==config.baseUrl))return res.type('html').send('<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=/admin"><title>Đăng nhập Google thành công</title></head><body><p>Đã xác thực Google. <a href="/admin">Mở Dashboard</a></p></body></html>');
      res.redirect('/admin');
    } catch(error) {
      const failure = oauthFailure(error, stage);
      console.warn(`OAuth callback failed: ${failure.code}`);
      res.status(401).send(failure.message);
    }
  });
  app.get('/api/posts', (req,res) => { res.set('Cache-Control','no-store'); res.json(db.list(true).map(post => db.publicPost(post))); });
  app.get('/api/site-settings',(req,res)=>res.set('Cache-Control','no-store').json({feedbackFormUrl:config.feedbackFormUrl||''}));
  app.get('/api/posts/:slug', (req,res) => { res.set('Cache-Control','no-store'); const post=db.publicPost(db.published(req.params.slug)); post ? res.json(post) : res.status(404).json({error:'Không tìm thấy bài viết.'}); });
  app.use('/api/admin', admin);
  registerFeedbackRoutes(app,{db,config,csrf,transport:feedbackTransport});
  registerPublishRoutes(app,{config,csrf,publisher:publisher||createPublisher({root,databasePath:config.databasePath,adminEmail:config.adminEmail,secrets:[config.clientSecret,config.sessionSecret]})});
  registerMedia(app,{admin,csrf,db,uploadDir});
  registerDriveRoutes(app, {db,config,csrf,driveRequest,revokeToken:token => oauth.revokeToken(token)});
  app.get('/api/admin/session', (req,res) => res.json({ email:req.session.admin.email, authMode:'google',supportsPinning:true,contentSchemaVersion:9,driveConnected:!!req.session.drive?.access_token&&req.session.drive.expiry_date>Date.now()+10000, csrfToken:req.session.csrf, saveContractVersion:2 }));
  app.get('/api/admin/posts', (req,res) => res.json(db.list()));
  app.patch('/api/admin/posts/:id/pin',csrf,(req,res)=>{
    const pin=validatePin(req.body),post=db.setPin(req.params.id,pin.is_pinned,pin.pin_order);
    return post?res.json(post):res.status(404).json({error:'Không tìm thấy bài viết.'});
  });
  app.patch('/api/admin/posts/:id/spotlight',csrf,(req,res)=>{
    if(typeof req.body?.is_spotlight!=='boolean')throw new InputError('Spotlight cần giá trị true/false.');
    const post=db.setSpotlight(req.params.id,req.body.is_spotlight);post?res.json(post):res.status(404).json({error:'Không tìm thấy bài viết.'});
  });
  app.get('/api/admin/trash',(req,res)=>res.json(db.trash()));
  app.get('/api/admin/settings',(req,res)=>res.json({email:config.adminEmail,driveRootId:config.driveRootId,exportCommand:'npm.cmd run export',postCount:db.list().length,trashCount:db.trash().length}));
  app.delete('/api/admin/posts/:id',csrf,(req,res)=>{
    const post=db.get(req.params.id);if(!post)return res.status(404).json({error:'Không tìm thấy bài viết.'});
    if(req.body?.confirmTitle!==post.title)return res.status(400).json({error:'Tên xác nhận không khớp bài viết.'});
    db.softDelete(post.id);res.json({ok:true});
  });
  app.post('/api/admin/trash/:id/restore',csrf,(req,res)=>{
    const post=db.get(req.params.id,true);if(!post?.deleted_at)return res.status(404).json({error:'Không tìm thấy bài trong thùng rác.'});
    if(req.body?.confirmTitle!==post.title)return res.status(400).json({error:'Tên xác nhận không khớp.'});
    db.restore(post.id);res.json(db.get(post.id));
  });
  app.delete('/api/admin/trash/:id',csrf,(req,res)=>{
    const post=db.get(req.params.id,true);if(!post?.deleted_at)return res.status(404).json({error:'Chỉ xóa vĩnh viễn bài trong thùng rác.'});
    if(req.body?.confirmTitle!==post.title||req.body?.action!=='purge')return res.status(400).json({error:'Cần xác nhận riêng việc xóa vĩnh viễn.'});
    db.purge(post.id);res.json({ok:true});
  });
  app.get('/api/admin/posts/:id', (req,res) => { const post=db.get(req.params.id); post ? res.json(post) : res.status(404).json({error:'Không tìm thấy bài viết.'}); });
  app.post('/api/admin/posts', csrf, async (req,res) => {
    if(req.body?.cms_contract===2&&!Array.isArray(req.body.drive_file_ids))throw new InputError('Thiếu danh sách file của form. Chưa lưu bài viết.');
    const post=validatePost(req.body),files=await selectedDriveFiles(req.body,req,config,driveRequest);
    res.status(201).json(db.saveWithFiles(post,null,files,config.adminEmail));
  });
  app.put('/api/admin/posts/:id', csrf, async (req,res) => {
    if(req.body?.cms_contract===2&&!Array.isArray(req.body.drive_file_ids))throw new InputError('Thiếu danh sách file của form. Chưa lưu thay đổi.');
    const validated=validatePost(req.body);
    if(!db.get(req.params.id))return res.status(404).json({error:'Không tìm thấy bài viết.'});
    const files=await selectedDriveFiles(req.body,req,config,driveRequest);
    res.json(db.saveWithFiles(validated,req.params.id,files,config.adminEmail));
  });
  app.post('/api/admin/preview', csrf, (req,res) => res.json(validatePost(req.body)));
  app.post('/api/admin/logout', csrf, (req,res,next) => req.session.destroy(error => { if(error)return next(error);res.clearCookie('ivan.sid',{httpOnly:true,sameSite:'lax',secure:config.secure});res.json({ok:true}); }));
  app.use('/admin', admin, express.static(path.join(root,'admin'), {index:'index.html', dotfiles:'deny'}));
  app.get('/', (req,res) => res.sendFile(path.join(root,'index.html')));
  app.get('/index.html', (req,res) => res.sendFile(path.join(root,'index.html')));
  for(const folder of ['css','js','images','sounds']) app.use(`/${folder}`,express.static(path.join(root,folder),{dotfiles:'deny'}));
  app.use((req,res) => res.status(404).json({error:'Không tìm thấy đường dẫn.'}));
  app.use((error,req,res,next) => {
    if(error instanceof PublishError)return res.status(error.status).json({error:error.message,code:error.code,hint:error.hint});
    if(error instanceof FeedbackError)return res.status(error.status).json({error:error.message,code:error.code});
    if(error instanceof DriveError) return res.status(error.status).json({error:error.message,code:error.code});
    if(error instanceof InputError) return res.status(400).json({error:error.message});
    if(error.code?.startsWith('ERR_SQLITE') && error.message.includes('UNIQUE')) return res.status(409).json({error:'Slug đã tồn tại. Hãy chọn slug khác.'});
    if(error.type==='entity.too.large')return res.status(413).json({error:'Dữ liệu vượt giới hạn cho phép (JSON 150 KB; ảnh 5 MB).'});
    if(error instanceof SyntaxError && 'body' in error)return res.status(400).json({error:'JSON không hợp lệ.'});
    if(error.postSaveRolledBack)return res.status(500).json({error:'Không lưu được bài viết và file đính kèm. Các thay đổi đã được rollback; vui lòng thử lại.'});
    console.error('Request failed:',error.code || error.name);
    res.status(500).json({error:'Lỗi máy chủ. Vui lòng thử lại.'});
  });
  return app;
}

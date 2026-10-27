import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validatePost, InputError } from './posts.js';
import { DRIVE_SCOPE, DriveError } from './drive.js';
import { registerDriveRoutes } from './drive-routes.js';
import { oauthFailure } from './oauth-error.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const random = () => randomBytes(32).toString('hex');
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function createApp({ config, db, oauthClient, driveRequest }) {
  const app = express();
  const oauth = oauthClient || new OAuth2Client(config.clientId, config.clientSecret, config.redirectUri);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { 'img-src': ["'self'", 'https:'], 'media-src': ["'self'", 'https:'], 'style-src': ["'self'", "'unsafe-inline'"], 'script-src': ["'self'"], 'upgrade-insecure-requests': config.secure ? [] : null } }, strictTransportSecurity: config.secure ? undefined : false }));
  app.use(express.json({ limit: '150kb' }));
  app.use(session({ name:'ivan.sid', secret:config.sessionSecret, resave:false, saveUninitialized:false, cookie:{ httpOnly:true, secure:config.secure, sameSite:'lax', maxAge:8*60*60*1000 } }));
  const admin = (req,res,next) => {
    if (req.session.admin?.email === config.adminEmail) return next();
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
      req.session.admin = { email:config.adminEmail, sub:identity.sub };
      req.session.csrf = random();
      // Store only short-lived access credentials in the server's memory session.
      // Never store an ID token or a refresh token, even if Google returns one.
      if (tokens.access_token && tokens.scope?.split(' ').includes(DRIVE_SCOPE)) {
        req.session.drive = { access_token:tokens.access_token, scope:tokens.scope, expiry_date:tokens.expiry_date || Date.now()+3600000 };
      }
      await new Promise((resolve,reject) => req.session.save(error => error ? reject(error) : resolve()));
      res.redirect('/admin');
    } catch(error) {
      const failure = oauthFailure(error, stage);
      console.warn(`OAuth callback failed: ${failure.code}`);
      res.status(401).send(failure.message);
    }
  });
  app.get('/api/posts', (req,res) => { res.set('Cache-Control','no-store'); res.json(db.list(true).map(post => db.publicPost(post))); });
  app.get('/api/posts/:slug', (req,res) => { res.set('Cache-Control','no-store'); const post=db.publicPost(db.published(req.params.slug)); post ? res.json(post) : res.status(404).json({error:'Không tìm thấy bài viết.'}); });
  app.use('/api/admin', admin);
  registerDriveRoutes(app, {db,config,csrf,driveRequest,revokeToken:token => oauth.revokeToken(token)});
  app.get('/api/admin/session', (req,res) => res.json({ email:req.session.admin.email, csrfToken:req.session.csrf }));
  app.get('/api/admin/posts', (req,res) => res.json(db.list()));
  app.get('/api/admin/posts/:id', (req,res) => { const post=db.get(req.params.id); post ? res.json(post) : res.status(404).json({error:'Không tìm thấy bài viết.'}); });
  app.post('/api/admin/posts', csrf, (req,res) => res.status(201).json(db.create(validatePost(req.body))));
  app.put('/api/admin/posts/:id', csrf, (req,res) => { const post=db.update(req.params.id,validatePost(req.body)); post ? res.json(post) : res.status(404).json({error:'Không tìm thấy bài viết.'}); });
  app.post('/api/admin/preview', csrf, (req,res) => res.json(validatePost(req.body)));
  app.post('/api/admin/logout', csrf, (req,res,next) => req.session.destroy(error => { if(error)return next(error);res.clearCookie('ivan.sid',{httpOnly:true,sameSite:'lax',secure:config.secure});res.json({ok:true}); }));
  app.use('/admin', admin, express.static(path.join(root,'admin'), {index:'index.html', dotfiles:'deny'}));
  app.get('/', (req,res) => res.sendFile(path.join(root,'index.html')));
  app.get('/index.html', (req,res) => res.sendFile(path.join(root,'index.html')));
  for(const folder of ['css','js','images','sounds']) app.use(`/${folder}`,express.static(path.join(root,folder),{dotfiles:'deny'}));
  app.use((req,res) => res.status(404).json({error:'Không tìm thấy đường dẫn.'}));
  app.use((error,req,res,next) => {
    if(error instanceof DriveError) return res.status(error.status).json({error:error.message,code:error.code});
    if(error instanceof InputError) return res.status(400).json({error:error.message});
    if(error.code?.startsWith('ERR_SQLITE') && error.message.includes('UNIQUE')) return res.status(409).json({error:'Slug đã tồn tại. Hãy chọn slug khác.'});
    if(error.type==='entity.too.large')return res.status(413).json({error:'Dữ liệu vượt giới hạn 150 KB.'});
    if(error instanceof SyntaxError && 'body' in error)return res.status(400).json({error:'JSON không hợp lệ.'});
    console.error('Request failed:',error.code || error.name);
    res.status(500).json({error:'Lỗi máy chủ. Vui lòng thử lại.'});
  });
  return app;
}

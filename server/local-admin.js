export function validateLocalMode(config){
  if(!config.localAdminMode)return;
  const base=new URL(config.baseUrl);
  if(config.nodeEnv==='production'||process.env.NODE_ENV==='production'||base.protocol!=='http:'||!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('LOCAL_ADMIN_MODE chỉ được dùng với HTTP loopback và không được bật trong production.');
}
export function localRequestAllowed(req,config){
  const base=new URL(config.baseUrl);
  const hosts=[`localhost:${base.port||80}`,`127.0.0.1:${base.port||80}`];
  const oauthCallback=req.method==='GET'&&req.path==='/auth/google/callback';
  return ['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    &&hosts.includes(req.get('host')?.toLowerCase())
    &&!['forwarded','x-forwarded-for','x-forwarded-host','x-real-ip'].some(h=>req.get(h))
    &&(oauthCallback||!req.get('origin')||req.get('origin')===config.baseUrl)
    // Google redirects the top-level browser back cross-site; callback still verifies
    // session-bound state, nonce and PKCE before accepting any credentials.
    &&(req.get('sec-fetch-site')!=='cross-site'||oauthCallback);
}

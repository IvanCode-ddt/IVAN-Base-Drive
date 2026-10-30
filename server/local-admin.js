export function validateLocalRuntime(config){
  const base=new URL(config.baseUrl);
  if(base.protocol!=='http:'||!['localhost','127.0.0.1'].includes(base.hostname))throw new Error('Admin chỉ chạy trên HTTP localhost/127.0.0.1; không hỗ trợ origin LAN hoặc Internet.');
}
export function localRequestAllowed(req,config){
  const base=new URL(config.baseUrl);
  // Both configured origin and actual loopback listener are valid (tests may use an
  // ephemeral listener); the shipped entry point always binds 127.0.0.1:config.port.
  const ports=[base.port||'80',req.socket.localPort].filter(Boolean);
  const hosts=ports.flatMap(port=>[`localhost:${port}`,`127.0.0.1:${port}`]);
  const oauthCallback=req.method==='GET'&&req.path==='/auth/google/callback';
  return ['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
    &&hosts.includes(req.get('host')?.toLowerCase())
    &&!['forwarded','x-forwarded-for','x-forwarded-host','x-real-ip'].some(h=>req.get(h))
    &&(oauthCallback||!req.get('origin')||req.get('origin')===config.baseUrl)
    // Google redirects the top-level browser back cross-site; callback still verifies
    // session-bound state, nonce and PKCE before accepting any credentials.
    &&(req.get('sec-fetch-site')!=='cross-site'||oauthCallback);
}

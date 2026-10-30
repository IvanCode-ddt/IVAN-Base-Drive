export const ADMIN_SESSION_MS=8*60*60*1000;
export function hasGoogleAdminSession(session,config,now=Date.now()){
 const identity=session?.admin;
 return identity?.provider==='google'&&identity.email===config.adminEmail
   &&typeof identity.sub==='string'&&identity.sub.length>0
   &&Number.isFinite(identity.expiresAt)&&identity.expiresAt>now;
}

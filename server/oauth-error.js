// Never return or log provider responses, request bodies, codes, tokens or secrets.
export function oauthFailure(error, stage) {
  const providerCode = error.response?.data?.error;
  if (providerCode === 'invalid_client') return { code:'OAUTH_CLIENT', message:'Google từ chối OAuth Client. Kiểm tra Client ID và Client Secret trong .env rồi khởi động lại server.' };
  if (providerCode === 'redirect_uri_mismatch') return { code:'OAUTH_REDIRECT', message:'OAuth Redirect URI không khớp. Kiểm tra http://localhost:3000/auth/google/callback trong Google Cloud và .env.' };
  if (providerCode === 'invalid_grant') return { code:'OAUTH_CODE', message:'Mã đăng nhập Google đã hết hạn hoặc đã được sử dụng. Trở về /login và đăng nhập lại trong một tab.' };
  const networkCodes = ['ENOTFOUND','EAI_AGAIN','ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENETUNREACH','EACCES','EPERM','UND_ERR_CONNECT_TIMEOUT'];
  if (networkCodes.includes(error.code) || networkCodes.includes(error.cause?.code) || (!error.response && stage==='exchange')) return { code:'OAUTH_NETWORK', message:'Server không kết nối được dịch vụ OAuth Google. Kiểm tra mạng, proxy hoặc tường lửa phía server rồi đăng nhập lại tại /login.' };
  return { code:stage==='verify'?'OAUTH_VERIFY':'OAUTH_SESSION', message:stage==='verify'?'Không xác minh được ID token Google. Kiểm tra kết nối Google, đồng hồ hệ thống và cấu hình Client ID; đăng nhập lại tại /login.':'Không tạo được phiên quản trị. Hãy đăng nhập lại tại /login.' };
}

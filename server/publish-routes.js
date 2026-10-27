import express from 'express';
import {PublishError} from './publish-git.js';

export function localPublishAllowed(req,config){
 const loopback=value=>['localhost','127.0.0.1','::1','[::1]','::ffff:127.0.0.1'].includes(value);
 let base;try{base=new URL(config.baseUrl);}catch{return false;}
 return process.env.NODE_ENV!=='production'&&config.nodeEnv!=='production'&&loopback(base.hostname)&&loopback(req.socket.remoteAddress)&&req.get('host')?.toLowerCase()===base.host.toLowerCase()&&!['forwarded','x-forwarded-for','x-forwarded-host','x-real-ip'].some(header=>req.get(header));
}
export function registerPublishRoutes(app,{publisher,config,csrf}){
 app.use('/api/admin/publish',(req,res,next)=>localPublishAllowed(req,config)?next():res.status(403).json({error:'Xuất bản chỉ hoạt động trực tiếp trên máy local, không qua proxy hoặc production.',code:'LOCAL_ONLY'}));
 app.get('/api/admin/publish/status',async(req,res)=>res.json(await publisher.status()));
 app.post('/api/admin/publish/preview',csrf,async(req,res)=>res.json(await publisher.prepare(req.sessionID)));
 app.post('/api/admin/publish/confirm',csrf,async(req,res)=>{
  if(req.body?.confirm!==true||typeof req.body.previewId!=='string'||!/^[a-f0-9-]{36}$/.test(req.body.previewId))throw new PublishError('CONFIRMATION','Cần xác nhận bản xem trước trước khi đăng.','Tạo bản xem trước và bấm xác nhận lần cuối.',400);
  const id=req.body.previewId,owner=req.sessionID;
  // Resolve capability synchronously before returning 202, then report progress by polling.
  publisher.previewDirectory(id,owner);
  if((await publisher.status()).busy)throw new PublishError('BUSY','Đang có một tiến trình xuất bản.');
  const operation=publisher.publish(id,owner);
  operation.catch(()=>{});res.status(202).json({accepted:true});
 });
 app.use('/api/admin/publish/previews/:id/site',(req,res,next)=>{
  if(req.method!=='GET'&&req.method!=='HEAD')return res.sendStatus(405);
  try{return express.static(publisher.previewDirectory(req.params.id,req.sessionID),{dotfiles:'deny',index:'index.html',redirect:true})(req,res,next);}catch(error){next(error);}
 });
}

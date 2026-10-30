import express from 'express';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, lstat,readFile } from 'node:fs/promises';
import path from 'node:path';
import { isUploadPath, localImages } from '../js/media.js';
import { InputError } from './posts.js';

export const MAX_IMAGE_BYTES=5*1024*1024;
export async function saveImage(buffer,directory) {
  if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_IMAGE_BYTES)throw new InputError('Ảnh phải có dung lượng từ 1 byte đến 5 MB.');
  const png=buffer.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'));
  const jpeg=buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
  const webp=buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP';
  if(!png&&!jpeg&&!webp)throw new InputError('Chữ ký file không phải JPEG, PNG hoặc WebP.');
  let output;
  try {
    const decoder=sharp(buffer,{limitInputPixels:16000000,failOn:'warning'});
    const metadata=await decoder.metadata();
    if(!['png','jpeg','webp'].includes(metadata.format)||metadata.pages>1)throw new Error('format');
    output=await decoder.rotate().resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
  }catch{throw new InputError('Ảnh không hợp lệ. Chỉ nhận JPEG, PNG, WebP tĩnh, tối đa 16 triệu pixel; không nhận SVG hoặc file thực thi.');}
  const name=`${randomUUID()}.webp`;
  await mkdir(directory,{recursive:true});await writeFile(path.join(directory,name),output,{flag:'wx'});
  return {path:`uploads/${name}`,mime:'image/webp',size:output.length};
}
export function registerMedia(app,{admin,csrf,db,uploadDir}) {
  app.get(/^\/images\/spotlight-([a-f0-9-]{36})-(640|960|1440)\.webp$/,async(req,res,next)=>{
    const name=req.params[0]+'.webp',width=Number(req.params[1]),relative='uploads/'+name;
    const activeSlides=new Set(db.highlightConfig({publicOnly:true}).slides.map(slide=>slide.post_id));
    if(!isUploadPath(relative)||!db.list(true).some(post=>activeSlides.has(post.id)&&post.cover_url===relative))return res.sendStatus(404);
    try{const original=path.join(uploadDir,name);if(!(await lstat(original)).isFile())return res.sendStatus(404);
      const bytes=await sharp(await readFile(original),{limitInputPixels:16000000}).resize({width}).webp({quality:90}).toBuffer();res.set('Cache-Control','no-store').type('webp').send(bytes);
    }catch(error){if(error.code==='ENOENT')return res.sendStatus(404);next(error);}
  });
  app.post('/api/admin/images',csrf,express.raw({type:()=>true,limit:MAX_IMAGE_BYTES}),async(req,res)=>res.status(201).json(await saveImage(req.body,uploadDir)));
  async function serve(req,res,next,privateView) {
    const relative=`uploads/${req.params.name}`;
    if(!isUploadPath(relative))return res.sendStatus(404);
    if(!privateView&&!db.list(true).some(post=>localImages(post).includes(relative)))return res.sendStatus(404);
    const filename=path.join(uploadDir,req.params.name);
    try {if(!(await lstat(filename)).isFile())return res.sendStatus(404);}catch{return res.sendStatus(404);}
    res.set('Cache-Control','no-store');res.type('webp');res.sendFile(filename,error=>error&&next(error));
  }
  app.get('/admin/media/:name',admin,(req,res,next)=>serve(req,res,next,true));
  app.get('/uploads/:name',(req,res,next)=>serve(req,res,next,false));
}

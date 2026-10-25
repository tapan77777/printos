import QRCode from 'qrcode';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
export function customerQrUrl(origin:string,deviceId:string){
 const base=new URL(origin);if(base.username||base.password||!['https:','http:'].includes(base.protocol))throw Error('Invalid website address');
 return new URL('/p/'+encodeURIComponent(deviceId),base.origin).toString();
}
export async function qrPreview(origin:string,deviceId:string){return QRCode.toDataURL(customerQrUrl(origin,deviceId),{width:320,margin:4,errorCorrectionLevel:'M'});}
export async function qrPoster(origin:string,deviceId:string,shopName:string){
 const url=customerQrUrl(origin,deviceId);const doc=await PDFDocument.create();
 const page=doc.addPage([595.28,841.89]);const bold=await doc.embedFont(StandardFonts.HelveticaBold);const font=await doc.embedFont(StandardFonts.Helvetica);
 // The built-in PDF font cannot encode all scripts; retain a readable fallback.
 const name=Array.from(shopName).map(c=>{try{font.encodeText(c);return c;}catch{return '';}}).join('').trim()||'Your print shop';
 function center(text:string,y:number,size:number,strong=false){const face=strong?bold:font;while(face.widthOfTextAtSize(text,size)>515&&size>8)size--;page.drawText(text,{x:(595.28-face.widthOfTextAtSize(text,size))/2,y,size,font:face,color:rgb(.10,.16,.25)});}
 center('PrintOS',770,20,true);center(name.slice(0,100),718,28,true);center('Scan to send your PDF',665,24,true);
 const png=await doc.embedPng(await QRCode.toBuffer(url,{width:960,margin:4,errorCorrectionLevel:'M'}));page.drawImage(png,{x:127.64,y:280,width:340,height:340});
 center('1. Scan   2. Upload a PDF   3. Choose print options',235,14);center('The shop reviews your order before printing.',205,14);center('Online orders are available when the shop enables them.',175,12);center(url,115,10);
 doc.setTitle('PrintOS customer QR poster');return doc.save();
}

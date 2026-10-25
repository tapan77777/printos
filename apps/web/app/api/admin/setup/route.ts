import {NextRequest,NextResponse} from 'next/server';
import {getOwnerFromRequest} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import {readSetup,updateSetup} from '@/lib/setupService';
import {qrPreview,customerQrUrl} from '@/lib/qrPoster';
import {accountRequest} from '@/lib/authBody';
import {UploadError} from '@/lib/uploadQuote';
import {withRequestPerformance} from '@/lib/requestPerformance';
async function handle(req:NextRequest){
 const owner=await getOwnerFromRequest(req);
 if(!owner?.shopId)return NextResponse.json({error:'Select your shop first'},{status:401});
 if(owner.role!=='owner')return NextResponse.json({error:'Only the shop owner can change setup'},{status:403});
 try{
  let state;
  if(req.method==='GET')state=await readSetup(prisma,owner.shopId);
  else{const bounded=await accountRequest(req);if(bounded instanceof Response)return bounded;const body=await bounded.json().catch(()=>null);if(!body||typeof body!=='object')throw new UploadError('Choose a setup action');state=await updateSetup(prisma,owner.shopId,body.action,body.enabled);}
  const origin=process.env.BETTER_AUTH_URL;if(!origin)throw Error('Website address unavailable');
  return NextResponse.json({...state,qrImage:state.intake?await qrPreview(origin,state.intake.deviceId):null,customerUrl:state.intake?customerQrUrl(origin,state.intake.deviceId):null},{headers:{'Cache-Control':'private, no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof UploadError?error.message:'Setup could not be saved. Please try again.'},{status:error instanceof UploadError?error.status:500});}
}
const handler=(req:NextRequest)=>withRequestPerformance('setup',()=>handle(req));
export {handler as GET,handler as POST};

import {NextRequest,NextResponse} from 'next/server';
import {getOwnerFromRequest} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import {readSetup} from '@/lib/setupService';
import {qrPoster} from '@/lib/qrPoster';
export async function GET(req:NextRequest){
 const owner=await getOwnerFromRequest(req);if(!owner?.shopId||owner.role!=='owner')return NextResponse.json({error:'Shop owner access required'},{status:403});
 try{const setup=await readSetup(prisma,owner.shopId);if(!setup.intake)return NextResponse.json({error:'Generate your QR poster in shop setup first'},{status:409});
 const origin=process.env.BETTER_AUTH_URL;if(!origin)throw Error();const bytes=await qrPoster(origin,setup.intake.deviceId,setup.shopName);
 return new NextResponse(Buffer.from(bytes),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="PrintOS-QR-poster.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return NextResponse.json({error:'The poster could not be generated. Please try again.'},{status:500});}
}

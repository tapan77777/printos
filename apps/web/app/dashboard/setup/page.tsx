import {redirect} from 'next/navigation';
import {getOwnerFromCookies} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import {readSetup} from '@/lib/setupService';
import {qrPreview,customerQrUrl} from '@/lib/qrPoster';
import {Notice} from '../../components/ui';
import {SetupWizard} from './SetupWizard';
export const dynamic="force-dynamic";
export default async function SetupPage(){
 const owner=await getOwnerFromCookies();if(!owner?.shopId)redirect('/shops');
 if(owner.role!=='owner')return <Notice>Only the shop owner can finish setup and turn on ordering.</Notice>;
 try{const setup=await readSetup(prisma,owner.shopId);const origin=process.env.BETTER_AUTH_URL;
 if(!origin)throw Error();return <SetupWizard initial={{...setup,qrImage:setup.intake?await qrPreview(origin,setup.intake.deviceId):null,customerUrl:setup.intake?customerQrUrl(origin,setup.intake.deviceId):null}}/>;
 }catch{return <Notice tone="error">We couldn’t load your setup. Refresh this page to try again.</Notice>;}
}

import {redirect} from 'next/navigation';
import {getOwnerFromCookies} from '@/lib/session';
import {deviceOverview} from '@/lib/deviceOverview';
import {Notice} from '../../components/ui';
import {DevicesPanel} from './DevicesPanel';
export const dynamic="force-dynamic";
export default async function DevicesPage(){
 const owner=await getOwnerFromCookies();if(!owner?.shopId)redirect('/shops');
 if(owner.role!=='owner')return <Notice>Only the shop owner can manage connected computers and printers.</Notice>;
 if(process.env.PRINTOS_DEVICE_ENROLLMENT!=='enabled')return <Notice>Printer connection is not available yet. You can finish your shop setup and connect later.</Notice>;
 try{return <DevicesPanel initial={await deviceOverview(owner.shopId)}/>;}
 catch{return <Notice tone="error">We couldn’t load your printers. Refresh this page to try again.</Notice>;}
}

import {redirect} from 'next/navigation';
import {getOwnerFromCookies} from '@/lib/session';
import {prisma} from '@/lib/prisma';
import {PricingEditor} from './PricingEditor';
import {Notice} from '../../components/ui';
export const dynamic="force-dynamic";
export default async function Pricing(){
 const owner=await getOwnerFromCookies();if(!owner?.shopId)redirect('/shops');
 try{const card=await prisma.shopRateCard.findFirst({where:{shopId:owner.shopId},orderBy:[{createdAt:'desc'},{id:'desc'}]});return <><div className="page-heading setup-pricing-heading"><p className="eyebrow">YOUR SHOP</p><h1>Printing prices</h1><p>Clear prices for your customers. Existing orders keep their original prices.</p></div><PricingEditor initialCard={card} canEdit={owner.role==='owner'}/></>;}
 catch{return <Notice tone="error">We couldn’t load your prices. Refresh this page to try again.</Notice>;}
}

import CustomerPrinter from "./CustomerPrinter";
import {prisma} from "@/lib/prisma";
import {setupSettings} from "@/lib/shopSetupState";
import {CustomerFrame} from "../../components/ui";
export const dynamic="force-dynamic";
export default async function Page({params}:{params:Promise<{printerId:string}>}){
 const {printerId}=await params;
 const printer=await prisma.printer.findUnique({where:{deviceId:printerId},select:{shop:{select:{metadata:true}}}});
 if(!printer?.shop||!setupSettings(printer.shop.metadata).orderingEnabled)return <CustomerFrame printerId={printerId}><section className="panel panel-body"><h1>We’re not taking online orders yet.</h1><p>Please ask at the counter. You can use this QR code once the shop turns on ordering.</p></section></CustomerFrame>;
 return <CustomerPrinter params={{printerId}} cloudStorage={process.env.PRINTOS_DOCUMENT_STORAGE==="supabase"}/>;
}

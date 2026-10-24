import CustomerPrinter from "./CustomerPrinter";
export default async function Page({params}:{params:Promise<{printerId:string}>}){return <CustomerPrinter params={await params} cloudStorage={process.env.PRINTOS_DOCUMENT_STORAGE === "supabase"}/>;}

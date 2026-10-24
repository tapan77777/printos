import CustomerStatus from "./CustomerStatus";
export default async function Page({params}:{params:Promise<{printerId:string;jobId:string}>}){return <CustomerStatus params={await params}/>;}

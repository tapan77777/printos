import {prisma} from '@/lib/prisma';
import {effectiveHealth} from './agentHealth';
export const deviceSelection={id:true,label:true,mode:true,confirmedAt:true,revokedAt:true,processingEnabled:true,configurationConfirmedAt:true,printer:{select:{name:true,deviceId:true}}} as const;
export async function deviceOverview(shopId:string){
 const [devices,printers]=await Promise.all([
  prisma.desktopDevice.findMany({where:{shopId},orderBy:{createdAt:'desc'},select:deviceSelection}),
  prisma.printer.findMany({where:{shopId},orderBy:{createdAt:'asc'},select:{id:true,name:true,deviceId:true,simulationOnly:true,lastHeartbeat:true,status:true}}),
 ]);
 return {devices:devices.map(d=>({...d,confirmedAt:d.confirmedAt?.toISOString()??null,revokedAt:d.revokedAt?.toISOString()??null,configurationConfirmedAt:d.configurationConfirmedAt?.toISOString()??null})),printers:printers.map(p=>({...p,status:effectiveHealth(p.lastHeartbeat,p.status==='ONLINE').printerAvailable===true?'ONLINE':'OFFLINE'}))};
}

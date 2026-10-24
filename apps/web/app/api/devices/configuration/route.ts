import type {NextRequest} from 'next/server';
import {prisma} from '@/lib/prisma';import {deviceCredential} from '@/lib/deviceCredential';import {deviceActivation} from '@/lib/deviceActivation';import {enrollmentReady,deviceBody,deviceJson,deviceError} from '@/lib/deviceApi';
export async function POST(req:NextRequest){try{enrollmentReady();const c=await deviceCredential(prisma,req.headers);if(!c)return deviceJson({error:'Device unavailable'},401);return deviceJson(await deviceActivation(prisma).configure(c.device.id,await deviceBody(req),c.credential.id));}catch(e){return deviceError(e);}}

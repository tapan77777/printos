import {logAccountFailure} from "./authDiagnostic";
import {accountResponse} from "./authResponse";
import {accountRequest} from "./authBody";
import {APIError} from "better-auth/api";
import {betterAuth} from "better-auth";
import {prismaAdapter} from "better-auth/adapters/prisma";
import {organization} from "better-auth/plugins";
import {ownerAc,memberAc} from "better-auth/plugins/organization/access";
import {prisma} from "./prisma";

type Mail = (to:string,subject:string,url:string)=>Promise<void>;
export async function sendAccountEmail(to:string,subject:string,url:string){
 const key=process.env.RESEND_API_KEY;const from=process.env.AUTH_EMAIL_FROM;
 if(!key||!from)throw Error("ACCOUNT_EMAIL_NOT_CONFIGURED");
 const response=await fetch("https://api.resend.com/emails",{method:"POST",redirect:"error",signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject,text:`${subject}\n\n${url}\n\nIf you did not request this, ignore this message.`})});
 await response.body?.cancel();if(!response.ok)throw Object.assign(Error("ACCOUNT_EMAIL_DELIVERY_FAILED"),{providerStatus:response.status});
}
export function createAccountAuth(database:ReturnType<typeof prismaAdapter>, mail:Mail, origin:string, secret:string){
 const auth=betterAuth({
  logger:{level:"error",log:(level,_message,...args)=>{if(level==="error")logAccountFailure("better-auth",args);}},appName:"PrintOS",baseURL:origin,basePath:"/api/account-auth",secret,
  database, trustedOrigins:[origin],
  advanced:{cookiePrefix:"printos-account",useSecureCookies:new URL(origin).protocol==="https:",ipAddress:{ipAddressHeaders:process.env.PRINTOS_TRUST_PROXY==="true"?["x-real-ip"]:[]}},
  emailAndPassword:{enabled:true,requireEmailVerification:true,autoSignIn:false,minPasswordLength:12,maxPasswordLength:128,revokeSessionsOnPasswordReset:true,resetPasswordTokenExpiresIn:900,
   sendResetPassword:async({user,url})=>mail(user.email,"Reset your PrintOS password",url)},
  emailVerification:{sendOnSignUp:true,sendOnSignIn:true,expiresIn:3600,autoSignInAfterVerification:false,
   sendVerificationEmail:async({user,url})=>mail(user.email,"Verify your PrintOS email",url)},
  session:{expiresIn:60*60*12,updateAge:60*60,cookieCache:{enabled:false}},
  rateLimit:{enabled:true,storage:"database",window:60,max:60,customRules:{"/sign-in/email":{window:60,max:5},"/sign-up/email":{window:3600,max:5},"/request-password-reset":{window:3600,max:5}}},
  plugins:[organization({allowUserToCreateOrganization:user=>user.emailVerified,organizationHooks:{
    beforeCreateOrganization:async({organization:o})=>{if(!o.name?.trim()||o.name.length>100||!o.slug||!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.slug)||o.slug.length<3||o.slug.length>60)throw new APIError("BAD_REQUEST",{message:"Valid shop name and identifier required."});},
    beforeCreateInvitation:async({invitation})=>{if(!["owner","staff"].includes(invitation.role))throw new APIError("BAD_REQUEST",{message:"Choose owner or staff."});},
    beforeUpdateMemberRole:async({newRole})=>{if(!["owner","staff"].includes(newRole))throw new APIError("BAD_REQUEST",{message:"Choose owner or staff."});},
    beforeAddMember:async({member})=>{if(!["owner","staff"].includes(member.role))throw new APIError("BAD_REQUEST",{message:"Choose owner or staff."});}
   },creatorRole:"owner",roles:{owner:ownerAc,staff:memberAc},organizationLimit:10,membershipLimit:50,disableOrganizationDeletion:true,
   sendInvitationEmail:async(data)=>mail(data.email,"Join your PrintOS shop",`${origin}/shops?invitation=${encodeURIComponent(data.id)}`)})],
 });
 // Enforce Origin for every HTTP mutation, including endpoints without a session
 // cookie. Library API methods remain for trusted server-side code only.
 return {...auth,handler:async(request:Request)=>{
  if(!["GET","HEAD","OPTIONS"].includes(request.method)&&request.headers.get("origin")!==origin)return new Response(JSON.stringify({error:"Trusted Origin required"}),{status:403,headers:{"Content-Type":"application/json"}});
  const bounded=await accountRequest(request);
  return bounded instanceof Response?bounded:accountResponse(await auth.handler(bounded));
 }};
}
let singleton:ReturnType<typeof createAccountAuth>|undefined;
export function getAuth(){
 if(process.env.PRINTOS_AUTH_MODE!=="tenant")return null;
 if(singleton)return singleton;
 const origin=process.env.BETTER_AUTH_URL;const secret=process.env.BETTER_AUTH_SECRET;
 // No generated defaults, fallback global password, or emails logged to the console.
 if(!origin||!secret||secret.length<32||!process.env.RESEND_API_KEY||!process.env.AUTH_EMAIL_FROM)return null;
 let url:URL;try{url=new URL(origin);}catch{return null;}
 if(url.username||url.password||url.search||url.hash||url.pathname!=="/"||(url.protocol!=="https:"&&!(process.env.NODE_ENV!=="production"&&url.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(url.hostname))))return null;
 singleton=createAccountAuth(prismaAdapter(prisma,{provider:"postgresql",transaction:true}),sendAccountEmail,url.origin,secret);
 return singleton;
}

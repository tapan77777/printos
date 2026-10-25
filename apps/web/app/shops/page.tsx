"use client";
import {useEffect,useState,useRef} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {shopIdentifier} from "@/lib/shopSetupState";
import {accountClient} from "@/lib/auth-client";
import {Brand,Notice} from "../components/ui";
export default function ShopsPage(){
 const router=useRouter();const submitLock=useRef(false);
 const [invitation,setInvitation]=useState<string|null>(null);
 const [inviteEmail,setInviteEmail]=useState("");const [inviteShop,setInviteShop]=useState("");const [notice,setNotice]=useState("");
 const [shops,setShops]=useState<{id:string;name:string}[]>([]);const [name,setName]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [ready,setReady]=useState(false);
 async function load(clearError=true){if(clearError)setError("");try{const result=await accountClient.organization.list();if(result.error){if(result.error.status===401){const invitation=new URLSearchParams(window.location.search).get("invitation");router.replace(invitation?"/login?next="+encodeURIComponent("/shops?invitation="+encodeURIComponent(invitation)):"/login");return;}throw Error(result.error.message);}setShops(result.data??[]);setReady(true);}catch{setError("We couldn’t load your shops. Please try again.");}}
 useEffect(()=>{setInvitation(new URLSearchParams(window.location.search).get("invitation"));void load();},[]);
 async function select(id:string){if(submitLock.current)return;submitLock.current=true;setBusy(true);setError("");try{const result=await accountClient.organization.setActive({organizationId:id});if(result.error)throw Error(result.error.message);router.push("/dashboard");}catch{setError("This shop could not be selected. Your membership may have changed.");}finally{submitLock.current=false;setBusy(false);}}
 async function create(event:React.FormEvent){event.preventDefault();if(submitLock.current)return;submitLock.current=true;setBusy(true);setError("");try{
  let created:{id:string}|null=null;
  for(let attempt=0;attempt<3;attempt++){const slug=shopIdentifier(name,crypto.randomUUID().replace(/-/g,"").slice(0,10));const result=await accountClient.organization.create({name:name.trim(),slug,keepCurrentActiveOrganization:false});if(result.data){created=result.data;break;}if(result.error?.code!=="ORGANIZATION_ALREADY_EXISTS")throw Error(result.error?.message??"Your shop could not be created. Please try again.");}
  if(!created)throw Error("We couldn’t reserve your shop address. Please try again.");
  // Better Auth selects the created shop before returning this response.
  router.push("/dashboard/setup");
 }catch(e){setError(e instanceof Error?e.message:"We couldn’t create your shop.");void load(false);}finally{submitLock.current=false;setBusy(false);}}
 async function invite(event:React.FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError("");try{const result=await accountClient.organization.inviteMember({email:inviteEmail,role:"staff",organizationId:inviteShop});if(result.error)throw Error(result.error.message);setNotice("Staff invitation sent. The recipient must verify their own account and accept it.");}catch(e){setError(e instanceof Error?e.message:"Invitation unavailable.");}finally{setBusy(false);}}
 async function accept(){const invitationId=new URLSearchParams(window.location.search).get("invitation");if(!invitationId)return;setBusy(true);setError("");try{const result=await accountClient.organization.acceptInvitation({invitationId});if(result.error)throw Error(result.error.message);setNotice("Invitation accepted. Select your shop below.");await load();}catch(e){setError(e instanceof Error?e.message:"Couldn’t accept this invitation.");}finally{setBusy(false);}}
 async function revoke(){if(busy)return;setBusy(true);setError("");try{const result=await accountClient.revokeSessions();if(result.error)throw Error();await accountClient.signOut();window.location.assign("/login");}catch{setError("Couldn’t revoke your sessions. Try again when connected.");}finally{setBusy(false);}}
 return <main className="owner-main"><Brand/><p className="eyebrow">STEP 2 OF 4 · YOUR SHOP</p><h1>Let’s set up your shop.</h1><p>Choose an existing shop, or start with its name. We’ll take you through prices and your QR poster next.</p>{error&&<div role="alert"><Notice tone="error">{error}</Notice><button className="btn" onClick={()=>void load()}>Try again</button></div>}
 {notice&&<Notice>{notice}</Notice>}
 {ready&&invitation&&<button className="btn" disabled={busy} onClick={accept}>Accept invitation from this link</button>}
 {!ready&&!error&&<p role="status">Checking your account…</p>}
 {shops.map(shop=><button className="btn btn-secondary" disabled={busy} key={shop.id} onClick={()=>select(shop.id)}>{shop.name}</button>)}
 {ready&&<section className="panel panel-body"><h2>Create your shop</h2><form className="login-form" onSubmit={create}><label className="field-label">Shop name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><p className="muted">We’ll create your unique shop address automatically.</p><button className="btn btn-primary" disabled={busy}>{busy?"Please wait…":"Create shop"}</button></form></section>}
 {ready&&shops.length>0&&<section className="panel panel-body"><h2>Invite staff</h2><p>Only a shop owner can send invitations. Each recipient needs their own verified account.</p><form className="login-form" onSubmit={invite}><label className="field-label">Shop<select required value={inviteShop} onChange={e=>setInviteShop(e.target.value)}><option value="">Choose a shop</option>{shops.map(shop=><option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label><label className="field-label">Staff email<input required type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/></label><button className="btn" disabled={busy}>Invite staff</button></form></section>}
 <button className="btn" disabled={busy} onClick={revoke}>Sign out all my sessions</button>
 <p><Link href="/#windows-app">Windows app download &amp; installation instructions</Link></p>
 <p>After creating a shop, review your prices and download a QR poster. Connect a printer whenever you’re ready. Ordering stays off until you explicitly enable it.</p><Link href="/login">Back to sign in</Link></main>;
}

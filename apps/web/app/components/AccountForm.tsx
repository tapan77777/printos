"use client";
import {useState,useRef} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {accountClient} from "@/lib/auth-client";
import {Brand,Notice} from "./ui";
export function AccountForm({mode}:{mode:"login"|"register"|"recover"|"reset"}){
 const router=useRouter();const submitLock=useRef(false);
 const [name,setName]=useState("");const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [message,setMessage]=useState("");const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 const title={login:"Welcome back.",register:"Create your PrintOS account.",recover:"Recover your account.",reset:"Choose a new password."}[mode];
 async function submit(event:React.FormEvent){event.preventDefault();if(submitLock.current)return;submitLock.current=true;setBusy(true);setError("");setMessage("");
 try{
  let result;
  if(mode==="login")result=await accountClient.signIn.email({email,password});
  else if(mode==="register")result=await accountClient.signUp.email({name,email,password,callbackURL:"/shops"});
  else if(mode==="recover")result=await accountClient.requestPasswordReset({email,redirectTo:"/reset-password"});
  else {const token=new URLSearchParams(window.location.search).get("token");if(!token)throw Error("The recovery link is missing or expired. Request another link.");result=await accountClient.resetPassword({newPassword:password,token});}
  if(result.error)throw Error(result.error.message??"Account service could not complete this request.");
  if(mode==="login"){const requested=new URLSearchParams(window.location.search).get("next");let destination="/shops";if(requested){const url=new URL(requested,window.location.origin);if(url.origin===window.location.origin&&url.pathname==="/shops")destination=url.pathname+url.search;}router.push(destination);}
  else setMessage(mode==="register"?"If this address can be registered, you’ll receive a verification email. Verify it, then sign in.":mode==="recover"?"If this account exists, a recovery email will arrive shortly.":"Password updated. Existing sessions have been revoked. Sign in again.");
 }catch(e){setError(e instanceof Error?e.message:"Account service unavailable. Try again later.");}finally{submitLock.current=false;setBusy(false);}}
 return <main className="login-form-side"><div className="login-form-wrap"><Link href="/"><Brand/></Link><h1>{title}</h1><p>{mode==="register"?"Step 1 of 4: create your account and verify your email. Then we’ll help you name your shop, set prices and make your QR poster. You can connect a printer later.":"One account. Access only the shops you belong to."}</p><form className="login-form" onSubmit={submit}>
 {mode==="register"&&<label className="field-label">Your name<input required maxLength={100} autoComplete="name" value={name} onChange={e=>setName(e.target.value)}/></label>}
 {mode!=="reset"&&<label className="field-label">Email<input required type="email" maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>}
 {mode!=="recover"&&<label className="field-label">Password<input required type="password" minLength={12} maxLength={128} autoComplete={mode==="login"?"current-password":"new-password"} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
 {error&&<div role="alert"><Notice tone="error">{error}</Notice></div>}{message&&<div role="status"><Notice>{message}</Notice></div>}
 <button className="btn btn-primary" disabled={busy}>{busy?"Please wait…":mode==="login"?"Sign in":mode==="register"?"Create account":mode==="recover"?"Send recovery link":"Save new password"}</button></form>
 <p><Link href="/login">Sign in</Link> · <Link href="/register">Create account</Link> · <Link href="/recover">Forgot password?</Link></p></div></main>;
}

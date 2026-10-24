import Link from "next/link";
import { Brand } from "./components/ui";
import { Icon } from "./components/Icon";
export default function Home() {
  return <div className="entry-page"><header className="entry-header"><Brand/><Link href="/login" className="btn btn-secondary">Owner sign in<Icon name="arrow" size={15}/></Link></header><main id="main-content" className="entry-main"><p className="eyebrow">HELLO, PAPER.</p><h1>Big ideas.<br/>Meet the printed page.</h1><p>Your next print starts at the shop. Scan the printer’s QR code to upload your PDF and choose your print options.</p><div className="entry-qr"><Icon name="printer" size={37}/></div><div className="entry-note">At the counter? Look for your shop’s PrintOS QR code.<br/>It takes you straight to the right printer.</div></main><footer className="entry-footer">PrintOS · A simpler way from document to paper.</footer></div>;
}

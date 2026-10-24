export function WindowsDownload() {
  // Set only after the approved public release asset has been downloaded and verified.
  const configured = process.env.PRINTOS_WINDOWS_INSTALLER_URL;
  const url = configured && /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/[^/?#]+\.exe$/i.test(configured) ? configured : null;
  return <section id="windows-app" className="panel panel-body" style={{marginTop: 24, textAlign: "left"}}>
    <h2>Windows app</h2>
    {url ? <a className="btn btn-primary" href={url}>Download PrintOS for Windows (64-bit)</a> : <p>Windows installer release pending approval. The download will appear here when the installer is published.</p>}
    <ol>
      <li>Download the installer on the Windows computer connected to your printer. Install the printer’s Windows driver first.</li>
      <li>Run the installer, choose an installation folder, then open PrintOS.</li>
      <li>Enter this website’s HTTPS address and sign in. Create or select your shop, then register its printer in Devices &amp; printers.</li>
      <li>Start secure pairing in the app. In Devices &amp; printers, compare the computer name and fingerprint and enter its pairing code. Check approval in the app.</li>
      <li>Discover and select the Windows printer, configure the required trusted PDF renderer, publish rates in Pricing, then generate the customer QR in the app.</li>
      <li>Prepare the app, enable the device in Devices &amp; printers, and start processing in the app. Customers scan the QR and submit PDFs; you review and approve jobs before printing.</li>
    </ol>
    <p>Installation and pairing do not start printing. The current build is unsigned and still needs Windows installation and physical print verification. Its printer setup requires a trusted SumatraPDF 3.7+ executable and verified SHA-256; the renderer is installed separately.</p>
  </section>;
}

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-semibold">PrintOS</h1>
      <p className="text-gray-500 mt-2">
        Scan a printer QR code to get started. Example: <code>/p/printer-001</code>
      </p>
    </main>
  );
}

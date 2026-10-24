import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PrintOS",
  description: "Self-service printing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";

const sans = Manrope({ variable: "--font-sans", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://lead-intelligence-workbench.g-pfeffer.chatgpt.site"),
  title: "Negroni — Paid lead generation, end to end",
  description: "A five-phase AI system for paid social and display lead generation.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "Negroni — Paid lead generation, end to end",
    description: "Research, Create, Launch, Iterate, and Loop—one reviewable campaign operating system.",
    type: "website",
    images: [{ url: "/og-phase1.png", width: 1731, height: 909, alt: "Negroni — Find the signal." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Negroni — Paid lead generation, end to end",
    description: "Five phases. Explicit artifacts. Approval-gated action.",
    images: ["/og-phase1.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="system" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}

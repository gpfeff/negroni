import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";

const sans = Manrope({ variable: "--font-sans", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Negroni — Paid lead generation, end to end",
  description: "A five-phase AI system for paid social and display lead generation.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "Negroni — Paid lead generation, end to end",
    description: "Research, Create, Launch, Iterate, and Loop—one reviewable campaign operating system.",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Negroni — Paid lead generation, end to end",
    description: "Five phases. Explicit artifacts. Approval-gated action.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
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
    images: [{ url: "/og.png", width: 1734, height: 907, alt: "Negroni campaign studio — What are we making?" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Negroni — Paid lead generation, end to end",
    description: "Five phases. Explicit artifacts. Approval-gated action.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}

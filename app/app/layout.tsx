import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://lead-intelligence-workbench.g-pfeffer.chatgpt.site"),
  title: "Negroni — Your agent-native advertising workspace",
  description: "A live Sites workspace for Negroni's five-phase advertising plugin.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "Negroni — Your agent-native advertising workspace",
    description: "Install the plugin, connect approved data, and work through Research, Creative, Launch, Iteration, and Loop.",
    type: "website",
    images: [{ url: "/og.jpg", width: 1200, height: 630, alt: "Negroni agent-native campaign workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Negroni — Your agent-native advertising workspace",
    description: "One plugin. Five phases. Explicit artifacts. Approval-gated action.",
    images: ["/og.jpg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`}>{children}</body>
    </html>
  );
}

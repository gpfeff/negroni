import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({ variable: "--font-sans", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://negroni-campaign-studio.gpfeff.chatgpt.site"),
  title: "Negroni — Your agent-native advertising workspace",
  description: "A live Sites workspace for Negroni's five-phase advertising plugin.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "Negroni — Your agent-native advertising workspace",
    description: "Install the plugin, connect approved data, and work through Research, Creative, Launch, Iteration, and Loop.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Negroni connects one permanent brand to every offer and asset" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Negroni — Your agent-native advertising workspace",
    description: "One plugin. Five phases. Explicit artifacts. Approval-gated action.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>{children}</body>
    </html>
  );
}

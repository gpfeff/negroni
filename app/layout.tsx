import type { Metadata } from "next";
import { DM_Sans, Lora } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
const serif = Lora({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PHASE 1: RESEARCH",
  description: "A focused intake for complete lead-generation research, three deliverables, and nightly competitor-ad monitoring.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "PHASE 1: RESEARCH",
    description: "From partial context to a complete report, a matching Markdown file, and a competitor-ad sheet refreshed nightly.",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "PHASE 1: RESEARCH intake and three deliverables" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PHASE 1: RESEARCH",
    description: "One research intake. Three deliverables. Nightly competitor-ad monitoring.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  );
}

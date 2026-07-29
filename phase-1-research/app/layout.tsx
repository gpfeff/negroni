import type { Metadata } from "next";
import { DM_Sans, Lora } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
const serif = Lora({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PHASE 1: RESEARCH",
  description: "Four inputs, five research passes, three durable deliverables, and nightly competitor-ad monitoring.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "PHASE 1: RESEARCH",
    description: "Save a research set, run five evidence-backed prompts, and receive a Google Doc, Markdown report, and competitor-ad Google Sheet.",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 908, alt: "PHASE 1: RESEARCH — four inputs, five passes, three deliverables" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PHASE 1: RESEARCH",
    description: "Four inputs. Five research passes. Three deliverables.",
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

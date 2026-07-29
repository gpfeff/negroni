import type { Metadata } from "next";
import { DM_Sans, Lora } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({ variable: "--font-sans", subsets: ["latin"] });
const serif = Lora({ variable: "--font-serif", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PHASE 1: RESEARCH",
  description: "A focused intake for evidence-backed lead-generation research and three complete deliverables.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: "PHASE 1: RESEARCH",
    description: "From partial market context to one report, one competitor sheet, and one portable Markdown file.",
    type: "website",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "PHASE 1: RESEARCH intake and three deliverables" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "PHASE 1: RESEARCH",
    description: "One focused research intake. Three complete deliverables.",
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

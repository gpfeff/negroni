import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Work_Sans } from "next/font/google";
import "./globals.css";

const display = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Work_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const utility = IBM_Plex_Mono({
  variable: "--font-utility",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: "Lead Intelligence Workbench",
    template: "%s · Lead Intelligence Workbench",
  },
  description:
    "A local-first evidence workbench for two-sided lead-generation research.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  openGraph: {
    title: "Lead Intelligence Workbench",
    description:
      "Research the lead buyer, the end customer, and the qualification contract between them.",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "Abstract two-sided buyer and consumer evidence workbench",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Lead Intelligence Workbench",
    description:
      "Research the lead buyer, the end customer, and the qualification contract between them.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} ${utility.variable}`}>
        {children}
      </body>
    </html>
  );
}

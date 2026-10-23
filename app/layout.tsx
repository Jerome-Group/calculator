import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { engineBuild } from "@/lib/calculator/engine-build";

export const metadata: Metadata = {
  title: "Calculator",
  description:
    "Exact symbolic and numerical mathematics, graphs and saved work. Runs on your device.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-calculator-engine={engineBuild.id}>
      <body className="antialiased">{children}</body>
    </html>
  );
}

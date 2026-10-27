import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RAGStack: context engineering for your documents",
  description: "Upload documents into collections and ask grounded questions with source-linked answers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full bg-[#0f0f13]">
      <body className={`${inter.className} h-full antialiased text-[#e8e8f0]`}>
        {children}
      </body>
    </html>
  );
}

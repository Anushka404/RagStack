import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AskPDF — Chat with your documents",
  description: "Upload a PDF and ask questions, powered by AI and grounded retrieval.",
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

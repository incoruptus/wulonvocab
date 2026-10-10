import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/components/app/Providers";

export const metadata: Metadata = {
  title: {
    default: "WulonVocab · 单词本工坊",
    template: "%s · WulonVocab",
  },
  description:
    "WulonVocab：可自定义字段的单词本软件。字段自由组合、JSON 一键导入、A4/B5/A5 精美导出，打印装订即可成书。",
};

const themeScript = `
try {
  var t = localStorage.getItem("wv-theme");
  var d = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (t === "dark" || (t !== "light" && d)) document.documentElement.classList.add("dark");
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh bg-background-100 text-gray-1000 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

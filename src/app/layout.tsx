import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
// 衬线：思源宋（Source Han Serif / Noto Serif SC，SIL OFL 1.1，unicode-range 分片）
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/noto-serif-sc/600.css";
import { assetPath } from "@/lib/paths";
import { Providers } from "@/components/app/Providers";
import { SyncAutoProvider } from "@/components/sync/SyncAutoProvider";

export const metadata: Metadata = {
  title: {
    default: "WulonVocab · 单词本工坊",
    template: "%s · WulonVocab",
  },
  description:
    "你攒下的词，值得被认真对待——本地优先的单词本：字段自由组合、一键导入、A4/B5/A5 打印装订成书。",
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
        {/* 中文无衬线 HarmonyOS Sans SC：由 scripts/sync-fonts.mjs 在 dev/build 前从 npm 包同步到
            public/fonts/harmony/（不进 git；相对 url 兼容 basePath；unicode-range 分片按需加载） */}
        <link rel="stylesheet" href={assetPath("/fonts/harmony/Regular.css")} />
        <link rel="stylesheet" href={assetPath("/fonts/harmony/Medium.css")} />
        <link rel="stylesheet" href={assetPath("/fonts/harmony/Semibold.css")} />
      </head>
      <body className="min-h-dvh bg-background-100 text-gray-1000 antialiased">
        <Providers>
          {children}
          {/* 全局自动同步调度：不依赖任何页面是否打开（见 SyncAutoProvider 注释） */}
          <SyncAutoProvider />
        </Providers>
      </body>
    </html>
  );
}

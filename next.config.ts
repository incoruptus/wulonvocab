import type { NextConfig } from "next";
import path from "node:path";

/** 静态导出模式（GitHub Pages）：WV_EXPORT=1 时启用；本地开发 / 常规构建不受影响 */
const isExport = process.env.WV_EXPORT === "1";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(isExport
    ? { output: "export" as const, trailingSlash: true, partialPrefetching: false }
    : { cacheComponents: true, partialPrefetching: true }),
  /** 隐藏开发工具悬浮指示器（左下角 N 徽标） */
  devIndicators: false,
  ...(basePath ? { basePath } : {}),
  turbopack: {
    root: path.resolve(process.cwd()),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

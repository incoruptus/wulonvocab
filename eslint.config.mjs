import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "**/.next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/downloads/**",
    // 生成物目录（构建前由 npm pre 脚本同步，见 scripts/sync-*.mjs）
    "public/fonts/**",
    "public/pdfjs/**",
    "test-fixtures/**",
    "tsconfig.tsbuildinfo",
  ]),
]);

export default eslintConfig;

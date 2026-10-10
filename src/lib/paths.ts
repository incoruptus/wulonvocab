/** 部署路径工具：GitHub Pages 子路径（/wulonvocab）下公开静态资源需要带前缀 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function assetPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${p}`;
}

/**
 * 读取当前主题下的 CSS 语义颜色，供无法使用 class 的内联 SVG / 图表库使用。
 * SSR 或变量缺失时回退到给定兜底值。
 */
export function semanticColor(variableName: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

export type ThemeKey = "light" | "dark" | "emerald" | "blue" | "violet" | "rose" | "amber" | "cyan" | "custom";

// emerald/blue/violet/rose/amber/cyan 已从预设入口下架，但保留 ThemeKey 与 CSS 变量，
// 老用户本地/服务端存的这些主题仍然照常生效；新预设只提供经典白与暗色两套。
export interface PresetTheme {
  label: string;
  color: string;
  preview: { page: string; surface: string; border: string; line: string };
}

export const PRESET_THEMES: Record<"light" | "dark", PresetTheme> = {
  light: {
    label: "亮色",
    color: "#4f46e5",
    preview: { page: "#f6f7fb", surface: "#ffffff", border: "#e4e8f0", line: "#e6eaf2" },
  },
  dark: {
    label: "暗色",
    color: "#6366f1",
    preview: { page: "#0e0f12", surface: "#17181c", border: "#282a31", line: "#2b2e36" },
  },
};

// 保留向后兼容
export const THEMES = PRESET_THEMES as Record<string, PresetTheme>;
export const THEME_KEYS = Object.keys(PRESET_THEMES) as ThemeKey[];
export const PRESET_KEYS = Object.keys(PRESET_THEMES) as ("light" | "dark")[];

const THEME_STORAGE_KEY = "zb_theme";
const CUSTOM_COLOR_KEY = "zb_custom_color";

/* ── hex/hsl 工具 ── */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  h /= 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = Math.round(hue2rgb(p, q, h + 1/3) * 255);
  const g = Math.round(hue2rgb(p, q, h) * 255);
  const b = Math.round(hue2rgb(p, q, h - 1/3) * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** 计算颜色的相对亮度 (0~1)，用于判断需要深色还是浅色文字 */
function luminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/** 从一个 hex 主色生成全套 CSS 变量并写入 :root */
export function applyCustomColor(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);

  const accent = hex;
  const accentLight = hslToHex(h, Math.min(s * 1.15, 1), Math.min(l + 0.12, 0.85));
  const accentDark = hslToHex(h, s, Math.max(l - 0.1, 0.15));

  // 界面级：极暗色调，融入主色色相
  const pageBg = hslToHex(h, Math.min(s * 0.6, 0.8), 0.04);
  const surface = hslToHex(h, Math.min(s * 0.5, 0.7), 0.08);
  const surfaceHover = hslToHex(h, Math.min(s * 0.5, 0.7), 0.12);
  const border = hslToHex(h, Math.min(s * 0.45, 0.6), 0.16);
  const inputBg = hslToHex(h, Math.min(s * 0.5, 0.7), 0.07);
  const progressBg = border;

  // 文字色：根据页面背景亮度自动选择
  const pageBgRgb = hexToRgb(pageBg);
  const bgLum = luminance(...pageBgRgb);
  const isDark = bgLum < 0.15;

  // 按钮上的文字色：根据 accent 亮度决定
  const accentLum = luminance(r, g, b);
  const textOnAccent = accentLum > 0.4 ? "#1e293b" : "#ffffff";

  const vars: Record<string, string> = {
    "--accent": accent,
    "--accent-light": accentLight,
    "--accent-dark": accentDark,
    "--accent-bg": `rgba(${r}, ${g}, ${b}, 0.1)`,
    "--accent-bg-hover": `rgba(${r}, ${g}, ${b}, 0.2)`,
    "--page-bg": pageBg,
    "--nav-bg": `rgba(${pageBgRgb.join(", ")}, 0.92)`,
    "--surface": surface,
    "--surface-hover": surfaceHover,
    "--surface-alt": `rgba(${r}, ${g}, ${b}, 0.05)`,
    "--border": border,
    "--border-hover": accent,
    "--input-bg": inputBg,
    "--progress-bg": progressBg,
    "--text-primary": isDark ? "#f3f4f6" : "#1e293b",
    "--text-secondary": isDark ? "#9ca3af" : "#64748b",
    "--text-muted": isDark ? "#6b7280" : "#94a3b8",
    "--text-on-accent": textOnAccent,
  };

  const el = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    el.style.setProperty(k, v);
  }
}

/** 清除 JS 设置的 inline style 变量（切换回预设主题时） */
function clearCustomVars() {
  const keys = [
    "--accent", "--accent-light", "--accent-dark", "--accent-bg", "--accent-bg-hover",
    "--page-bg", "--nav-bg", "--surface", "--surface-hover", "--surface-alt",
    "--border", "--border-hover", "--input-bg", "--progress-bg",
    "--text-primary", "--text-secondary", "--text-muted", "--text-on-accent",
  ];
  const el = document.documentElement;
  keys.forEach(k => el.style.removeProperty(k));
}

/* ── 存储 ── */
export function getStoredTheme(): ThemeKey {
  if (typeof window === "undefined") return "light";
  return (localStorage.getItem(THEME_STORAGE_KEY) as ThemeKey) || "light";
}

export function getStoredCustomColor(): string {
  if (typeof window === "undefined") return "#4f46e5";
  return localStorage.getItem(CUSTOM_COLOR_KEY) || "#4f46e5";
}

export function setStoredTheme(theme: ThemeKey, customColor?: string) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
  if (theme === "custom" && customColor) {
    localStorage.setItem(CUSTOM_COLOR_KEY, customColor);
  }
  applyTheme(theme, customColor);
}

export function applyTheme(theme: ThemeKey, customColor?: string) {
  if (theme === "custom") {
    document.documentElement.setAttribute("data-theme", "custom");
    const color = customColor || getStoredCustomColor();
    applyCustomColor(color);
  } else {
    clearCustomVars();
    document.documentElement.setAttribute("data-theme", theme);
  }
}

/** 初始化主题（在 app 启动时调用） */
export function initTheme(): ThemeKey {
  const theme = getStoredTheme();
  applyTheme(theme);
  return theme;
}
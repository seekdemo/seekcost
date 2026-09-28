import type { UserProfile } from "./types";
import { USER_UPDATED_EVENT } from "./navigation";

const TOKEN_KEY = "zb_token";
const USER_KEY = "zb_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function setUser(user: UserProfile) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent(USER_UPDATED_EVENT, { detail: user }));
}

export function getUser(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

/**
 * 当前登录用户 id。优先解析访问令牌的 sub 声明（后端鉴权实际使用的身份），
 * 本地用户缓存缺失或过旧时仍可可靠获得，避免依赖缓存做权限判断。
 */
export function getCurrentUserId(): string | null {
  const token = getToken();
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1])) as { sub?: string | number };
      if (payload.sub != null) return String(payload.sub);
    } catch {
      // 令牌格式异常时回退到本地缓存
    }
  }
  const cached = getUser()?.id;
  return cached != null ? String(cached) : null;
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

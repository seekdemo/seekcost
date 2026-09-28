import { getToken } from "./auth";
import { whenPageQuiet } from "./api";

/**
 * 管理员身份与路由无关，整个页面会话只探测一次；StrictMode 的“挂载-清理-挂载”也只会共享同一个请求。
 * 不要用 AbortController：它会在 StrictMode 首次清理和路由切换时立即中止请求，产生 net::ERR_ABORTED 红错。
 */
let adminCheck: Promise<boolean> | null = null;
export function fetchAdmin(): Promise<boolean> {
  if (!adminCheck) {
    adminCheck = whenPageQuiet()
      .then(() => {
        const token = getToken();
        if (!token) return false;
        // keepalive：路由切换/整页重载导致旧文档卸载时，探测请求继续完成而不是被浏览器中止报红错
        return fetch("/api/v1/admin/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", keepalive: true })
          .then(response => response.ok)
          .catch(() => { adminCheck = null; return false; });
      });
  }
  return adminCheck;
}

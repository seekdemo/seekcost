import Link from "next/link";

export default function NotFound() {
  return (
    <div className="error-state">
      <span className="error-state__code" aria-hidden="true">404</span>
      <h1>没有找到这个页面</h1>
      <p>链接可能已经变化，或对应内容已被移除。</p>
      <Link href="/" className="ui-button ui-button--primary">返回工作台</Link>
    </div>
  );
}

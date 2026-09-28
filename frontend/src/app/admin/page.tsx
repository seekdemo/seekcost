"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import AuthGuard from "@/components/AuthGuard";
import ConfirmModal from "@/components/ConfirmModal";
import { AboutStoryView } from "@/components/AboutStory";
import { api } from "@/lib/api";
import { CONTENT_FIELDS, type AboutCopy, type ContentDraft, type ContentLocale, type ContentAudit } from "@/lib/siteContent";

export default function AdminPage() { return <AuthGuard><AdminContent /></AuthGuard>; }

function AdminContent() {
  const [access, setAccess] = useState<{username:string} | null>(null);
  const [accessError, setAccessError] = useState("");
  const [locale, setLocale] = useState<ContentLocale>("zh-CN");
  const [record, setRecord] = useState<ContentDraft | null>(null);
  const [form, setForm] = useState<AboutCopy | null>(null);
  const [audit, setAudit] = useState<ContentAudit[]>([]);
  const [auditError, setAuditError] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [reload, setReload] = useState(0);
  const dirty = !!form && !!record && JSON.stringify(form) !== JSON.stringify(record.draft);
  const unpublished = !!record && JSON.stringify(record.draft) !== JSON.stringify(record.published);

  useEffect(() => { let cancelled = false; api.adminMe().then(value => {if (!cancelled) setAccess(value);}).catch(e => {if (!cancelled) setAccessError(e.message);}); return () => {cancelled = true;}; }, []);
  useEffect(() => {
    if (!access) return;
    let cancelled = false;
    api.contentDraft(locale).then(value => { if (!cancelled) {setRecord(value); setForm(value.draft);} })
      .catch(e => {if (!cancelled) setError(e.message);}).finally(() => {if (!cancelled) setLoading(false);});
    return () => {cancelled = true;};
  }, [access, locale, reload]);
  useEffect(() => {
    if (!access) return;
    let cancelled = false;
    api.contentAudit().then(value => {if (!cancelled) {setAudit(value);setAuditError("");}}).catch(() => {if (!cancelled) setAuditError("操作记录暂时无法加载，内容保存状态不受影响。");});
    return () => {cancelled = true;};
  }, [access, record]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const link = (event: MouseEvent) => {
      const anchor = (event.target as Element)?.closest?.("a[href]");
      if (anchor && !window.confirm("有未保存的修改。确定离开并放弃这些修改吗？")) {event.preventDefault(); event.stopPropagation();}
    };
    window.addEventListener("beforeunload", leave); document.addEventListener("click", link, true);
    return () => {window.removeEventListener("beforeunload", leave);document.removeEventListener("click", link, true);};
  }, [dirty]);

  function reloadContent(next = locale) {
    if (dirty && !window.confirm("有未保存的修改，确定放弃并重新加载吗？")) return;
    setLoading(true); setRecord(null); setForm(null); setError("");setFeedback(""); setLocale(next); setReload(n => n + 1);
  }
  async function save() {
    if (!form || !record || busy) return;
    setBusy(true); setError("");setFeedback("");
    try {const value = await api.saveContentDraft(locale, record.version, form);setRecord(value);setForm(value.draft);setFeedback("草稿已保存，访客看到的内容尚未改变。预览确认后再发布。");}
    catch(e) {setError(e instanceof Error ? e.message : "保存失败，输入已保留。");}
    finally {setBusy(false);}
  }
  async function publish() {
    setPublishOpen(false);
    if (!record || dirty || busy) return;
    setBusy(true);setError("");setFeedback("");
    try {const value = await api.publishContent(locale, record.version);setRecord(value);setForm(value.draft);setFeedback("发布成功。访客下次打开或刷新 About 页面即可看到新内容。");}
    catch(e) {setError(e instanceof Error ? e.message : "发布失败，草稿仍保留。");}
    finally {setBusy(false);}
  }
  if (!access) return <div className="page-shell max-w-3xl py-10"><h1 className="page-title">管理员后台</h1><p className="mt-5 text-secondary" role={accessError ? "alert" : "status"}>{accessError || "正在验证管理员权限…"}</p>{accessError && <><p className="mt-3 text-sm text-muted">普通账户不能发布公共内容。请由平台维护者在服务器上为指定账户授予权限。</p><Link href="/about" className="ui-button mt-5 min-h-11">返回 About</Link></>}</div>;
  return <div className="page-shell mx-auto max-w-6xl space-y-6 pb-28">
    <header className="page-header"><div><p className="text-xs text-accent">公共内容管理 · {access.username}</p><h1 className="page-title mt-2">管理员后台</h1><p className="page-description">管理 About 的开发初衷、平台价值和未来方向。保存草稿不会影响访客；发布前请核对预览。本后台不提供用户私有研究、持仓或交易数据访问。</p></div><Link href="/about" target="_blank" rel="noopener noreferrer" className="ui-button min-h-11">查看公开页面 ↗</Link></header>
    <section className="rounded-xl border border-themed bg-surface p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2" role="group" aria-label="内容语言">{([['zh-CN','简体中文'],['en','English']] as const).map(([value,label]) => <button key={value} disabled={busy || loading} aria-pressed={locale === value} onClick={() => {if (locale !== value) reloadContent(value);}} className={`ui-button min-h-11 ${locale === value ? "text-accent bg-[var(--accent-bg)]" : ""}`}>{label}</button>)}</div><button disabled={busy} onClick={() => reloadContent()} className="ui-button min-h-11">重新加载</button></div>
      <p className="mt-3 text-xs leading-5 text-muted">中英文分别保存与发布。其他语言使用英文。此处编辑主内容；隐私、行情边界和使用指南链接保留为平台固定说明。</p>
      {record && <p className="mt-3 text-sm text-secondary">版本 {record.version} · {dirty ? "有未保存修改" : unpublished ? "草稿尚未发布" : "与公开内容一致"} · {record.published_at ? `最近发布 ${new Date(record.published_at).toLocaleString()}` : "当前公开内容为平台初始文案"}</p>}
    </section>
    {error && <p role="alert" className="rounded-xl border border-red-400/30 p-4 text-sm text-red-400">{error}（请保留当前输入后再重新加载。）</p>}
    {feedback && <p role="status" className="rounded-xl border border-themed bg-[var(--accent-bg)] p-4 text-sm text-accent">{feedback}</p>}
    {loading ? <p role="status" className="py-12 text-center text-muted">正在加载内容…</p> : form && record && <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="编辑模式"><button className="ui-button min-h-11" aria-pressed={!preview} onClick={() => setPreview(false)}>编辑内容</button><button className="ui-button min-h-11" aria-pressed={preview} onClick={() => setPreview(true)}>页面预览</button></div>
      {preview ? <section className="product-info-page rounded-xl border border-themed bg-surface p-5 sm:p-8" aria-label="草稿预览"><p className="mb-6 text-sm text-accent">草稿预览 · 仅管理员可见，尚未自动发布</p><AboutStoryView content={form} locale={locale} /></section> : <form id="content-editor" onSubmit={event => {event.preventDefault();void save();}} className="space-y-6 rounded-xl border border-themed bg-surface p-4 sm:p-6"><fieldset disabled={busy} className="space-y-6">{CONTENT_FIELDS.map(field => <label key={field.key} className="block text-sm text-secondary"><span className="flex flex-wrap justify-between gap-2"><span>{field.label}</span><span className="text-xs text-muted">{form[field.key].length}/{field.max}</span></span><textarea required maxLength={field.max} rows={field.rows} value={form[field.key]} onChange={event => setForm({...form, [field.key]:event.target.value})} className="alert-input mt-2 w-full resize-y leading-7" /></label>)}</fieldset><p className="text-xs leading-6 text-muted">纯文本内容，空行分段；不支持 HTML 或脚本。请勿将用户隐私写入公共页面。</p></form>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-themed bg-surface p-4"><p className="text-sm text-muted">{dirty ? "请先保存草稿，再发布。" : "发布将更新所有访客看到的当前语言版本。"}</p><div className="flex flex-wrap gap-3"><button disabled={busy || !dirty || CONTENT_FIELDS.some(f => !form[f.key].trim())} onClick={() => void save()} className="ui-button min-h-11 disabled:opacity-40">{busy ? "处理中…" : "保存草稿"}</button><button disabled={busy || dirty || !unpublished} onClick={() => setPublishOpen(true)} className="ui-button ui-button--primary min-h-11 disabled:opacity-40">发布内容</button></div></div>
    </>}
    <section className="rounded-xl border border-themed bg-surface p-4 sm:p-6"><h2 className="text-lg font-semibold">最近操作记录</h2><p className="mt-2 text-xs text-muted">最近 50 条 · 记录操作者、保存与发布版本；不是可回滚的历史版本库。</p>{auditError && <p role="alert" className="mt-3 text-sm text-red-400">{auditError}</p>}<ul className="mt-4 divide-y divide-themed">{audit.map(row => <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span>{({save:"保存草稿",publish:"发布内容",grant:"授予权限",revoke:"撤销权限"} as Record<string,string>)[row.action] || row.action} · {row.key} {row.locale} · v{row.version}</span><span className="text-muted">{row.actor_id ? `账户 #${row.actor_id}` : "服务器维护者"} · {new Date(row.created_at).toLocaleString()}</span></li>)}</ul>{!audit.length && !auditError && <p className="mt-4 text-sm text-muted">还没有内容管理操作。</p>}</section>
    <ConfirmModal open={publishOpen} title="发布 About 内容？" message={`将发布${locale === "zh-CN" ? "简体中文" : "英文"}已保存草稿，所有访客都可阅读。请确认内容不包含隐私，且未来计划没有被描述为已上线功能。`} confirmText="确认发布" danger={false} onConfirm={() => void publish()} onCancel={() => setPublishOpen(false)} />
  </div>;
}

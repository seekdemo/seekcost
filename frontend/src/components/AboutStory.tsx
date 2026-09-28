"use client";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import Link from "next/link";
import type { AboutCopy, ContentLocale } from "@/lib/siteContent";
import "./AboutStory.css";

function blocks(text: string) { return text.split(/\n\s*\n/).map(part => part.trim()).filter(Boolean); }
function EditorialBlock({ text }: { text: string }) {
  const split = text.indexOf("\n");
  return split > 0 ? <><h3>{text.slice(0, split)}</h3><p>{text.slice(split + 1)}</p></> : <p>{text}</p>;
}

export function AboutStoryView({ content, locale }: { content: AboutCopy; locale: ContentLocale }) {
  const zh = locale === "zh-CN";
  return <div className="about-story" data-testid="about-story">
    <header className="about-hero">
      <div className="about-hero__copy">
        <p className="about-kicker"><span /> SEEKCOST / OUR STORY</p>
        <h1>{zh ? content.title.split(/(?<=，)/).map((phrase, index) => <span className="about-title-phrase" key={index}>{phrase}</span>) : content.title}</h1>
        <p className="about-hero__intro">{content.intro}</p>
        <div className="about-hero__actions"><Link href="/guide">{zh ? "了解如何开始" : "Find your starting point"}<span aria-hidden="true">↗</span></Link><a href="#about-mission">{zh ? "阅读开发初衷" : "Read the story"}<span aria-hidden="true">↓</span></a></div>
      </div>
      <aside className="about-compass" aria-label={zh ? "决策之前，留住四个问题" : "Four questions worth keeping"}>
        <div className="about-compass__top"><span>THE DECISION NOTES</span><span aria-hidden="true">✳</span></div>
        <p className="about-compass__title">{zh ? "少一点噪音。\n多一点自己的判断。" : "Less noise.\nMore considered decisions."}</p>
        <ol>{(zh ? ["为什么关注？", "在等什么条件？", "什么说明我错了？", "后来判断得怎样？"] : ["Why does it matter?", "What am I waiting for?", "What would prove me wrong?", "What happened afterward?"]).map((item, index) => <li key={item}><span>0{index+1}</span>{item}</li>)}</ol>
        <p className="about-compass__foot">{zh ? "不是替你决定，而是陪你想清楚。" : "Your judgment. A clearer record."}</p>
      </aside>
    </header>
    <section id="about-mission" className="about-mission" aria-label={zh ? "为什么开发这个平台" : "Why I built this platform"}>
      <div className="about-section-heading"><p className="about-kicker">01 / THE ORIGIN</p><h2>{zh ? "把理由留下，\n不只把代码收藏。" : "Keep the reason.\nNot just the ticker."}</h2><p className="about-margin-note">{zh ? "从个人的真实需要出发。" : "Built from a personal need."}</p></div>
      <div className="about-mission__prose">{blocks(content.mission).map((paragraph,index) => <p key={index}>{paragraph}</p>)}</div>
    </section>
    <section className="about-values" aria-label={zh ? "我希望它带来的价值" : "The value I want it to bring"}>
      <div className="about-section-heading"><p className="about-kicker">02 / WHAT MATTERS</p><h2>{zh ? "让关注，有所沉淀。" : "Make attention count."}</h2></div>
      <div className="about-values__grid">{blocks(content.values).map((paragraph,index) => <article className="about-value" key={index}><span className="about-value__number" aria-hidden="true">{String(index+1).padStart(2,"0")}</span><div><EditorialBlock text={paragraph}/></div></article>)}</div>
    </section>
    <section className="about-roadmap" aria-label={zh ? "接下来，持续优化什么" : "Where we go next"}>
      <div className="about-section-heading"><p className="about-kicker">03 / THE NEXT CHAPTER</p><h2>{zh ? "把产品做好，\n是一件持续的事。" : "A work in progress.\nWith a clear direction."}</h2><span className="about-roadmap__badge">{zh ? "未来方向 · 非已上线功能" : "Planned direction · Not shipped features"}</span></div>
      <ol className="about-roadmap__list">{blocks(content.roadmap).map((paragraph,index) => <li key={index}><span className="about-roadmap__dot" aria-hidden="true"/><div><EditorialBlock text={paragraph}/></div></li>)}</ol>
    </section>
  </div>;
}

export default function AboutStory() {
  const { localeTag } = useI18n();
  const locale: ContentLocale = localeTag === "zh-CN" ? "zh-CN" : "en";
  const [state, setState] = useState<{locale: string; content: AboutCopy | null; error: boolean}>({locale:"", content:null, error:false});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/v1/content/about?locale=${locale}`, {cache:"no-store", signal:controller.signal})
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => setState({locale, content:data.content, error:false}))
      .catch(() => { if (!controller.signal.aborted) setState({locale, content:null, error:true}); });
    return () => controller.abort();
  }, [locale, retry]);
  if (state.locale !== locale || !state.content) return <div className="rounded-xl border border-themed p-8" role={state.error ? "alert" : "status"}>
    <h1 className="text-xl font-semibold">{locale === "zh-CN" ? "关于 SeekCost" : "About SeekCost"}</h1>
    <p className="mt-3 text-sm text-muted">{state.error ? (locale === "zh-CN" ? "公共内容暂时无法加载，请重试。" : "Public content is temporarily unavailable. Please retry.") : (locale === "zh-CN" ? "正在加载平台故事…" : "Loading our story…")}</p>
    {state.error && <button className="ui-button mt-4 min-h-11" onClick={() => {setState({locale:"", content:null, error:false}); setRetry(n => n + 1);}}>{locale === "zh-CN" ? "重试" : "Retry"}</button>}
  </div>;
  return <AboutStoryView content={state.content} locale={locale} />;
}

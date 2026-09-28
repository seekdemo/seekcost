"use client";

import { useState } from "react";

const STORAGE_KEY = "zb_onboarding_done";

const STEPS = [
  {
    title: "欢迎来到 SeekCost",
    subtitle: "散户专属的心理成本管理系统",
    content: "SeekCost 帮你用「心理成本」的视角管理持仓，目标是让每一笔投资都迈向零成本。",
    icon: "🎯",
  },
  {
    title: "三大区域",
    subtitle: "按投资性质分区管理",
    content: "",
    icon: "📊",
    zones: [
      { name: "动态博弈区", color: "text-brand", border: "border-brand", desc: "主动交易的股票/加密等，通过做T、波段降低心理成本" },
      { name: "静态防御区", color: "text-blue-400", border: "border-blue-500/30", desc: "长期持有的ETF/债基/黄金等，稳健增值" },
      { name: "能力投资区", color: "text-purple-400", border: "border-purple-500/30", desc: "课程/工具/流量等自我投资，用赚钱能力来回本" },
    ],
  },
  {
    title: "心理成本 vs 持仓均价",
    subtitle: "核心差异",
    content: "",
    icon: "🧠",
    comparison: [
      { label: "持仓均价", desc: "券商显示的账面成本，纯数学计算", color: "text-blue-400" },
      { label: "心理成本", desc: "你内心认定的成本。卖出利润可以「摊薄」到其他持仓，让心理成本不断下降", color: "text-amber-400" },
    ],
    tip: "当心理成本被摊薄到 0，这笔投资就是「零成本」——即使股价下跌，你也不会恐慌。",
  },
  {
    title: "利润去向",
    subtitle: "卖出赚钱后，利润怎么分配？",
    content: "",
    icon: "💰",
    flows: [
      { name: "原位摊薄", desc: "降低本资产的心理成本", emoji: "🔄" },
      { name: "跨标的拯救", desc: "帮亏损的资产降低心理成本", emoji: "🤝" },
      { name: "存入避风港", desc: "锁定利润，积累安全垫", emoji: "🛡️" },
    ],
  },
  {
    title: "准备好了！",
    subtitle: "开始你的零成本之旅",
    content: "去「资产管理」添加你的第一笔持仓，然后通过「记账」记录每笔交易，系统会自动追踪你的零成本进度。",
    icon: "🚀",
  },
];

export default function OnboardingGuide() {
  const [show, setShow] = useState(() => typeof window !== "undefined" && !localStorage.getItem(STORAGE_KEY));
  const [step, setStep] = useState(0);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" onClick={finish}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg mx-4 rounded-2xl border border-themed bg-surface shadow-2xl animate-in fade-in zoom-in-95 duration-300"
        onClick={e => e.stopPropagation()}>

        {/* 进度指示器 */}
        <div className="flex gap-1 px-6 pt-5">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= step ? "bg-accent" : "bg-progress"}`} />
          ))}
        </div>

        {/* 内容 */}
        <div className="px-6 pt-5 pb-2">
          <div className="text-3xl mb-3">{s.icon}</div>
          <h2 className="text-xl font-bold text-primary">{s.title}</h2>
          <p className="text-sm text-accent mt-0.5">{s.subtitle}</p>

          {s.content && (
            <p className="mt-4 text-sm text-secondary leading-relaxed">{s.content}</p>
          )}

          {/* 三区说明 */}
          {s.zones && (
            <div className="mt-4 space-y-2">
              {s.zones.map(z => (
                <div key={z.name} className={`rounded-lg border ${z.border} bg-surface-alt p-3`}>
                  <p className={`text-sm font-semibold ${z.color}`}>{z.name}</p>
                  <p className="text-xs text-secondary mt-0.5">{z.desc}</p>
                </div>
              ))}
            </div>
          )}

          {/* 成本对比 */}
          {s.comparison && (
            <div className="mt-4 space-y-2">
              {s.comparison.map(c => (
                <div key={c.label} className="rounded-lg border border-themed bg-surface-alt p-3">
                  <p className={`text-sm font-semibold ${c.color}`}>{c.label}</p>
                  <p className="text-xs text-secondary mt-0.5">{c.desc}</p>
                </div>
              ))}
              {s.tip && (
                <p className="text-xs text-amber-400/80 bg-amber-500/10 rounded-lg px-3 py-2 mt-2">{s.tip}</p>
              )}
            </div>
          )}

          {/* 利润流向 */}
          {s.flows && (
            <div className="mt-4 space-y-2">
              {s.flows.map(f => (
                <div key={f.name} className="flex items-start gap-3 rounded-lg border border-themed bg-surface-alt p-3">
                  <span className="text-xl flex-shrink-0">{f.emoji}</span>
                  <div>
                    <p className="text-sm font-semibold text-primary">{f.name}</p>
                    <p className="text-xs text-secondary mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-between px-6 py-4">
          <button onClick={finish} className="text-xs text-muted hover:text-secondary transition">
            跳过引导
          </button>
          <div className="flex gap-2">
            {!isFirst && (
              <button onClick={() => setStep(step - 1)}
                className="rounded-lg border border-themed px-4 py-2 text-sm text-secondary hover:text-primary transition">
                上一步
              </button>
            )}
            {isLast ? (
              <button onClick={finish}
                className="rounded-lg bg-accent bg-accent-hover px-5 py-2 text-sm font-semibold text-on-accent transition">
                开始使用
              </button>
            ) : (
              <button onClick={() => setStep(step + 1)}
                className="rounded-lg bg-accent bg-accent-hover px-5 py-2 text-sm font-semibold text-on-accent transition">
                下一步
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

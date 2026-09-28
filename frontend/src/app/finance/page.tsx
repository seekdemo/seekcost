"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { SalaryConfig, SalaryPreview, IncomeRecord, LiabilityItem, NetWorthOverview } from "@/lib/types";
import AuthGuard from "@/components/AuthGuard";
import ConfirmModal from "@/components/ConfirmModal";

const COUNTRY_LABELS: Record<string, string> = { cn: "中国", us: "美国", custom: "自定义" };
const SOURCE_LABELS: Record<string, string> = { salary: "工资", bonus: "奖金", freelance: "自由职业", investment: "投资收益", other: "其他" };
const LIAB_LABELS: Record<string, string> = { mortgage: "房贷", car_loan: "车贷", credit_card: "信用卡", student_loan: "学生贷款", personal_loan: "个人贷款", other: "其他" };
const ZONE_NAMES: Record<string, string> = { active: "博弈区", base: "防御区", invest: "投资区" };

function fmt(n: number) { return n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function FinancePage() {
  return <AuthGuard><FinanceContent /></AuthGuard>;
}

type Tab = "overview" | "salary" | "income" | "liability";

const EMPTY_SALARY_FORM = {
  gross_salary: "", pay_day: "15", currency: "CNY", country: "cn",
  pension_rate: "8", medical_rate: "2", unemployment_rate: "0.5",
  housing_fund_rate: "12", special_deduction: "0",
  custom_tax_rate: "", custom_deductions: "", custom_brackets: "",
};

function salaryFormFromConfig(config: SalaryConfig | null) {
  if (!config) return { ...EMPTY_SALARY_FORM };
  return {
    gross_salary: String(config.gross_salary), pay_day: String(config.pay_day),
    currency: config.currency, country: config.country,
    pension_rate: String(+(config.pension_rate * 100).toFixed(4)), medical_rate: String(+(config.medical_rate * 100).toFixed(4)),
    unemployment_rate: String(+(config.unemployment_rate * 100).toFixed(4)), housing_fund_rate: String(+(config.housing_fund_rate * 100).toFixed(4)),
    special_deduction: String(config.special_deduction),
    custom_tax_rate: config.custom_tax_rate ? String(+(config.custom_tax_rate * 100).toFixed(4)) : "",
    custom_deductions: config.custom_deductions ? String(config.custom_deductions) : "",
    custom_brackets: config.custom_brackets || "",
  };
}

function FinanceContent() {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [netWorth, setNetWorth] = useState<NetWorthOverview | null>(null);
  const [salaryConfig, setSalaryConfig] = useState<SalaryConfig | null>(null);
  const [preview, setPreview] = useState<SalaryPreview | null>(null);
  const [incomes, setIncomes] = useState<IncomeRecord[]>([]);
  const [liabilities, setLiabilities] = useState<LiabilityItem[]>([]);
  const [deleteId, setDeleteId] = useState<{ type: string; id: number } | null>(null);

  const loadAll = async () => {
    // Keep the initial effect free of synchronous state writes; subsequent
    // refreshes still expose an immediate loading state in the next microtask.
    await Promise.resolve();
    setLoading(true);
    const [nw, sc, inc, liab] = await Promise.all([
      api.getNetWorth().catch(() => null),
      api.getSalaryConfig().catch(() => null),
      api.listIncome().catch(() => []),
      api.listLiabilities().catch(() => []),
    ]);
    setNetWorth(nw); setSalaryConfig(sc); setIncomes(inc as IncomeRecord[]); setLiabilities(liab as LiabilityItem[]);
    setLoading(false);
  };
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getNetWorth().catch(() => null),
      api.getSalaryConfig().catch(() => null),
      api.listIncome().catch(() => []),
      api.listLiabilities().catch(() => []),
    ]).then(([nw, sc, inc, liab]) => {
      if (cancelled) return;
      setNetWorth(nw);
      setSalaryConfig(sc);
      setIncomes(inc as IncomeRecord[]);
      setLiabilities(liab as LiabilityItem[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const confirmDelete = async () => {
    if (!deleteId) return;
    if (deleteId.type === "income") await api.deleteIncome(deleteId.id);
    else if (deleteId.type === "liability") await api.deleteLiability(deleteId.id);
    setDeleteId(null);
    loadAll();
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "总览" },
    { key: "salary", label: "工资配置" },
    { key: "income", label: "收入记录" },
    { key: "liability", label: "负债管理" },
  ];

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Personal finance</p>
          <h1 className="page-title">个人财务</h1>
          <p className="page-description">管理收入、负债和长期现金流，让投资决策建立在可承受的基础上。</p>
        </div>
      </header>

      <div className="flex gap-2 overflow-x-auto rounded-[var(--radius-md)] border border-themed bg-surface p-2 pb-2">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition whitespace-nowrap ${tab === t.key ? "bg-accent text-on-accent" : "bg-surface text-secondary hover:bg-surface-hover"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-muted">加载中...</div>
      ) : (
        <>
          {tab === "overview" && <OverviewTab netWorth={netWorth} liabilities={liabilities} />}
          {tab === "salary" && <SalaryTab key={salaryConfig?.updated_at || "new"} config={salaryConfig} preview={preview} setPreview={setPreview} onSave={loadAll} />}
          {tab === "income" && <IncomeTab incomes={incomes} salaryConfig={salaryConfig} onRefresh={loadAll} onDelete={(id) => setDeleteId({ type: "income", id })} />}
          {tab === "liability" && <LiabilityTab liabilities={liabilities} onRefresh={loadAll} onDelete={(id) => setDeleteId({ type: "liability", id })} />}
        </>
      )}

      <ConfirmModal open={deleteId !== null} title="确认删除" message="此操作不可撤销" confirmText="删除"
        onConfirm={confirmDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}

/* ══════════════════ 总览 ══════════════════ */
function OverviewTab({ netWorth, liabilities }: { netWorth: NetWorthOverview | null; liabilities: LiabilityItem[] }) {
  if (!netWorth) return <div className="py-16 text-center text-muted">暂无数据，请先配置工资或添加资产</div>;
  const nw = netWorth;
  return (
    <div className="space-y-6">
      {/* 净资产大卡 */}
      <div className="rounded-xl border border-themed bg-surface p-6">
        <p className="text-xs text-muted mb-1">净资产</p>
        <p className={`text-3xl font-bold ${nw.net_worth >= 0 ? "text-up" : "text-down"}`}>{fmt(nw.net_worth)}</p>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted">总资产</span>
            <p className="font-semibold text-primary">{fmt(nw.total_assets)}</p>
          </div>
          <div className="text-right">
            <span className="text-muted">总负债</span>
            <p className="font-semibold text-red-400">{fmt(nw.total_liabilities)}</p>
          </div>
        </div>
      </div>

      {/* 资产分布 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(nw.asset_breakdown).map(([zone, val]) => (
          <div key={zone} className="rounded-xl border border-themed bg-surface p-4">
            <p className="text-xs text-muted">{ZONE_NAMES[zone] || zone}</p>
            <p className="text-lg font-bold text-primary">{fmt(val)}</p>
          </div>
        ))}
      </div>

      {/* 收入概览 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-themed bg-surface p-4">
          <p className="text-xs text-muted">本月到手</p>
          <p className="text-lg font-bold text-info">{fmt(nw.monthly_income)}</p>
        </div>
        <div className="rounded-xl border border-themed bg-surface p-4">
          <p className="text-xs text-muted">本年到手</p>
          <p className="text-lg font-bold text-info">{fmt(nw.yearly_income)}</p>
        </div>
      </div>

      {/* 负债一览 */}
      {liabilities.length > 0 && (
        <div className="rounded-xl border border-themed bg-surface overflow-hidden">
          <div className="px-4 py-3 border-b border-themed">
            <h3 className="text-sm font-semibold text-primary">负债一览</h3>
          </div>
          <div className="divide-y divide-themed">
            {liabilities.map(l => (
              <div key={l.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <span className="text-sm font-medium text-primary">{l.name}</span>
                  <span className="ml-2 text-xs text-muted">{LIAB_LABELS[l.liability_type] || l.liability_type}</span>
                </div>
                <div className="text-right text-sm">
                  <p className="text-red-400 font-medium">剩余 {fmt(l.remaining_amount)}</p>
                  {l.monthly_payment > 0 && <p className="text-xs text-muted">月供 {fmt(l.monthly_payment)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════ 工资配置 ══════════════════ */
function SalaryTab({ config, preview, setPreview, onSave }: {
  config: SalaryConfig | null; preview: SalaryPreview | null;
  setPreview: (p: SalaryPreview | null) => void; onSave: () => void;
}) {
  const [form, setForm] = useState(() => salaryFormFromConfig(config));
  const [editing, setEditing] = useState(!config);

  const doPreview = async () => {
    try {
      const p = await api.previewSalary({
        gross_salary: parseFloat(form.gross_salary) || 0,
        country: form.country, month_index: new Date().getMonth() + 1,
        pension_rate: (parseFloat(form.pension_rate) || 0) / 100,
        medical_rate: (parseFloat(form.medical_rate) || 0) / 100,
        unemployment_rate: (parseFloat(form.unemployment_rate) || 0) / 100,
        housing_fund_rate: (parseFloat(form.housing_fund_rate) || 0) / 100,
        special_deduction: parseFloat(form.special_deduction) || 0,
        custom_tax_rate: form.custom_tax_rate ? (parseFloat(form.custom_tax_rate) || 0) / 100 : null,
        custom_deductions: form.custom_deductions ? parseFloat(form.custom_deductions) : null,
        custom_brackets: form.custom_brackets || null,
      });
      setPreview(p);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    const data: Record<string, unknown> = {
      gross_salary: parseFloat(form.gross_salary) || 0,
      pay_day: parseInt(form.pay_day) || 15,
      currency: form.currency, country: form.country,
      pension_rate: (parseFloat(form.pension_rate) || 0) / 100,
      medical_rate: (parseFloat(form.medical_rate) || 0) / 100,
      unemployment_rate: (parseFloat(form.unemployment_rate) || 0) / 100,
      housing_fund_rate: (parseFloat(form.housing_fund_rate) || 0) / 100,
      special_deduction: parseFloat(form.special_deduction) || 0,
      custom_tax_rate: form.custom_tax_rate ? (parseFloat(form.custom_tax_rate) || 0) / 100 : null,
      custom_deductions: form.custom_deductions ? parseFloat(form.custom_deductions) : null,
      custom_brackets: form.custom_brackets || null,
    };
    if (config) await api.updateSalaryConfig(config.id, data);
    else await api.createSalaryConfig(data);
    setEditing(false);
    onSave();
  };

  const isCN = form.country === "cn";
  const isCustom = form.country === "custom";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">工资与税收配置</h2>
        {config && !editing && (
          <button onClick={() => setEditing(true)} className="rounded-lg border border-themed px-3 py-1.5 text-sm text-secondary hover:text-primary transition">编辑</button>
        )}
      </div>

      {/* 当前配置展示 */}
      {config && !editing && (
        <div className="rounded-xl border border-themed bg-surface p-5 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><span className="text-muted text-xs">税前月薪</span><p className="font-bold text-primary">{fmt(config.gross_salary)}</p></div>
            <div><span className="text-muted text-xs">国家/税制</span><p className="font-semibold">{COUNTRY_LABELS[config.country]}</p></div>
            <div><span className="text-muted text-xs">发薪日</span><p className="font-semibold">每月 {config.pay_day} 日</p></div>
            <div><span className="text-muted text-xs">货币</span><p className="font-semibold">{config.currency}</p></div>
          </div>
          {config.country === "cn" && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <div><span className="text-muted">养老</span><p>{(config.pension_rate * 100).toFixed(1)}%</p></div>
              <div><span className="text-muted">医疗</span><p>{(config.medical_rate * 100).toFixed(1)}%</p></div>
              <div><span className="text-muted">失业</span><p>{(config.unemployment_rate * 100).toFixed(1)}%</p></div>
              <div><span className="text-muted">公积金</span><p>{(config.housing_fund_rate * 100).toFixed(1)}%</p></div>
              <div><span className="text-muted">专项扣除/月</span><p>{fmt(config.special_deduction)}</p></div>
            </div>
          )}
          <button onClick={doPreview} className="rounded-lg bg-accent bg-accent-hover px-4 py-2 text-sm font-semibold text-on-accent transition">
            预览本月到手
          </button>
          {preview && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 rounded-lg border border-themed p-3 text-sm">
              <div><span className="text-muted text-xs">税前</span><p className="font-bold">{fmt(preview.gross)}</p></div>
              <div><span className="text-muted text-xs">社保</span><p className="text-red-400">{fmt(preview.social_insurance)}</p></div>
              <div><span className="text-muted text-xs">公积金</span><p className="text-blue-400">{fmt(preview.housing_fund)}</p></div>
              <div><span className="text-muted text-xs">个税</span><p className="text-yellow-400">{fmt(preview.tax)}</p></div>
              <div><span className="text-muted text-xs">到手</span><p className="font-bold text-info">{fmt(preview.net)}</p></div>
            </div>
          )}
        </div>
      )}

      {/* 编辑表单 */}
      {editing && (
        <div className="rounded-xl border border-themed bg-surface p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <FInput label="税前月薪" value={form.gross_salary} onChange={v => setForm({...form, gross_salary: v})} type="number" />
            <div>
              <label className="text-xs text-muted">国家/税制</label>
              <select value={form.country} onChange={e => setForm({...form, country: e.target.value})}
                className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
                <option value="cn">中国</option><option value="us">美国</option><option value="custom">自定义</option>
              </select>
            </div>
            <FInput label="发薪日" value={form.pay_day} onChange={v => setForm({...form, pay_day: v})} type="number" />
            <div>
              <label className="text-xs text-muted">货币</label>
              <select value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}
                className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
                <option value="CNY">CNY ¥</option><option value="USD">USD $</option>
              </select>
            </div>
          </div>
          {isCN && (
            <>
              <p className="text-xs text-muted font-medium">五险一金比例（个人缴纳 %）</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <FInput label="养老保险 %" value={form.pension_rate} onChange={v => setForm({...form, pension_rate: v})} type="number" />
                <FInput label="医疗保险 %" value={form.medical_rate} onChange={v => setForm({...form, medical_rate: v})} type="number" />
                <FInput label="失业保险 %" value={form.unemployment_rate} onChange={v => setForm({...form, unemployment_rate: v})} type="number" />
                <FInput label="公积金 %" value={form.housing_fund_rate} onChange={v => setForm({...form, housing_fund_rate: v})} type="number" />
                <FInput label="专项扣除/月" value={form.special_deduction} onChange={v => setForm({...form, special_deduction: v})} type="number" />
              </div>
            </>
          )}
          {isCustom && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FInput label="固定税率 %" value={form.custom_tax_rate} onChange={v => setForm({...form, custom_tax_rate: v})} type="number" />
              <FInput label="免征额/月" value={form.custom_deductions} onChange={v => setForm({...form, custom_deductions: v})} type="number" />
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleSave} className="rounded-lg bg-accent bg-accent-hover px-6 py-2 font-semibold text-on-accent transition">保存</button>
            {config && <button onClick={() => setEditing(false)} className="rounded-lg border border-themed px-4 py-2 text-sm text-secondary">取消</button>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════ 收入记录 ══════════════════ */
function IncomeTab({ incomes, salaryConfig, onRefresh, onDelete }: {
  incomes: IncomeRecord[]; salaryConfig: SalaryConfig | null;
  onRefresh: () => void; onDelete: (id: number) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ source: "salary", gross_amount: "", net_amount: "", tax: "0", social_insurance: "0", housing_fund: "0", month: new Date().toISOString().slice(0, 7), note: "" });
  const [generating, setGenerating] = useState(false);

  const curMonth = new Date().toISOString().slice(0, 7);

  const handleAutoGen = async () => {
    setGenerating(true);
    try {
      await api.autoGenerateIncome(curMonth);
      onRefresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "生成失败";
      alert(msg);
    }
    setGenerating(false);
  };

  const handleSubmit = async () => {
    await api.createIncome({
      source: form.source, gross_amount: parseFloat(form.gross_amount) || 0,
      net_amount: parseFloat(form.net_amount) || 0, tax: parseFloat(form.tax) || 0,
      social_insurance: parseFloat(form.social_insurance) || 0,
      housing_fund: parseFloat(form.housing_fund) || 0,
      month: form.month, note: form.note || null,
    });
    setShowForm(false);
    setForm({ source: "salary", gross_amount: "", net_amount: "", tax: "0", social_insurance: "0", housing_fund: "0", month: curMonth, note: "" });
    onRefresh();
  };

  // 按月分组
  const grouped = incomes.reduce<Record<string, IncomeRecord[]>>((acc, r) => {
    (acc[r.month] = acc[r.month] || []).push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">收入记录</h2>
        <div className="flex gap-2">
          {salaryConfig && (
            <button onClick={handleAutoGen} disabled={generating}
              className="rounded-lg border border-themed px-3 py-1.5 text-sm text-secondary hover:text-primary transition disabled:opacity-50">
              {generating ? "生成中..." : `生成${curMonth}工资`}
            </button>
          )}
          <button onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-accent bg-accent-hover px-3 py-1.5 text-sm font-semibold text-on-accent transition">
            {showForm ? "取消" : "+ 手动添加"}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-xl border border-themed bg-surface p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted">来源</label>
              <select value={form.source} onChange={e => setForm({...form, source: e.target.value})}
                className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
                {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <FInput label="税前金额" value={form.gross_amount} onChange={v => setForm({...form, gross_amount: v})} type="number" />
            <FInput label="到手金额" value={form.net_amount} onChange={v => setForm({...form, net_amount: v})} type="number" />
            <FInput label="月份" value={form.month} onChange={v => setForm({...form, month: v})} placeholder="YYYY-MM" />
          </div>
          <button onClick={handleSubmit} className="rounded-lg bg-accent bg-accent-hover px-6 py-2 font-semibold text-on-accent transition">添加</button>
        </div>
      )}

      {Object.keys(grouped).length === 0 ? (
        <div className="py-16 text-center text-muted">暂无收入记录</div>
      ) : (
        Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([month, records]) => {
          const total = records.reduce((s, r) => s + r.net_amount, 0);
          return (
            <div key={month} className="rounded-xl border border-themed bg-surface overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-themed">
                <span className="text-sm font-semibold text-primary">{month}</span>
                <span className="text-sm font-bold text-info">到手 {fmt(total)}</span>
              </div>
              <div className="divide-y divide-themed">
                {records.map(r => (
                  <div key={r.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-hover">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-md px-2 py-0.5 text-xs ${r.is_auto ? "bg-blue-500/10 text-blue-400" : "bg-surface text-secondary"}`}>
                        {r.is_auto ? "自动" : "手动"}
                      </span>
                      <span className="text-sm text-primary">{SOURCE_LABELS[r.source] || r.source}</span>
                      {r.note && <span className="text-xs text-muted">{r.note}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted">税前{fmt(r.gross_amount)}</span>
                      <span className="text-info font-medium">{fmt(r.net_amount)}</span>
                      <button onClick={() => onDelete(r.id)} className="text-xs text-muted hover:text-red-400 transition">删除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ══════════════════ 负债管理 ══════════════════ */
function LiabilityTab({ liabilities, onRefresh, onDelete }: {
  liabilities: LiabilityItem[]; onRefresh: () => void; onDelete: (id: number) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", liability_type: "other", total_amount: "", remaining_amount: "", monthly_payment: "", interest_rate: "0" });

  const handleSubmit = async () => {
    await api.createLiability({
      name: form.name, liability_type: form.liability_type,
      total_amount: parseFloat(form.total_amount) || 0,
      remaining_amount: parseFloat(form.remaining_amount) || 0,
      monthly_payment: parseFloat(form.monthly_payment) || 0,
      interest_rate: parseFloat(form.interest_rate) || 0,
    });
    setShowForm(false);
    setForm({ name: "", liability_type: "other", total_amount: "", remaining_amount: "", monthly_payment: "", interest_rate: "0" });
    onRefresh();
  };

  const totalRemaining = liabilities.reduce((s, l) => s + l.remaining_amount, 0);
  const totalMonthly = liabilities.reduce((s, l) => s + l.monthly_payment, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">负债管理</h2>
          {liabilities.length > 0 && (
            <p className="text-xs text-muted mt-1">
              总负债 <strong className="text-red-400">{fmt(totalRemaining)}</strong> · 月供合计 <strong className="text-yellow-400">{fmt(totalMonthly)}</strong>
            </p>
          )}
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-accent bg-accent-hover px-3 py-1.5 text-sm font-semibold text-on-accent transition">
          {showForm ? "取消" : "+ 添加负债"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-themed bg-surface p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            <FInput label="名称" value={form.name} onChange={v => setForm({...form, name: v})} placeholder="如 房贷" />
            <div>
              <label className="text-xs text-muted">类型</label>
              <select value={form.liability_type} onChange={e => setForm({...form, liability_type: e.target.value})}
                className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]">
                {Object.entries(LIAB_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <FInput label="总金额" value={form.total_amount} onChange={v => setForm({...form, total_amount: v})} type="number" />
            <FInput label="剩余待还" value={form.remaining_amount} onChange={v => setForm({...form, remaining_amount: v})} type="number" />
            <FInput label="月供" value={form.monthly_payment} onChange={v => setForm({...form, monthly_payment: v})} type="number" />
            <FInput label="年利率 %" value={form.interest_rate} onChange={v => setForm({...form, interest_rate: v})} type="number" />
          </div>
          <button onClick={handleSubmit} className="rounded-lg bg-accent bg-accent-hover px-6 py-2 font-semibold text-on-accent transition">添加</button>
        </div>
      )}

      {liabilities.length === 0 ? (
        <div className="py-16 text-center text-muted">暂无负债记录</div>
      ) : (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
          {liabilities.map(l => {
            const paidPct = l.total_amount > 0 ? ((l.total_amount - l.remaining_amount) / l.total_amount * 100) : 0;
            return (
              <div key={l.id} className="rounded-xl border border-themed bg-surface p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold text-primary">{l.name}</p>
                    <p className="text-xs text-muted">{LIAB_LABELS[l.liability_type] || l.liability_type}{l.interest_rate > 0 ? ` · ${l.interest_rate}%` : ""}</p>
                  </div>
                  <button onClick={() => onDelete(l.id)} className="text-xs text-muted hover:text-red-400 transition">删除</button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <div><span className="text-muted">总额</span><p className="text-sm font-semibold">{fmt(l.total_amount)}</p></div>
                  <div className="text-right"><span className="text-muted">剩余</span><p className="text-sm font-semibold text-red-400">{fmt(l.remaining_amount)}</p></div>
                  {l.monthly_payment > 0 && <div><span className="text-muted">月供</span><p className="text-sm">{fmt(l.monthly_payment)}</p></div>}
                  {l.profit_repaid > 0 && <div className="text-right"><span className="text-muted">利润还贷</span><p className="text-sm text-purple-400">{fmt(l.profit_repaid)}</p></div>}
                </div>
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] text-muted mb-0.5">
                    <span>还款进度</span><span>{Math.round(paidPct)}%</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-progress">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${paidPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ══════════════════ 通用输入 ══════════════════ */
function FInput({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  const isNum = type === "number";
  return (
    <div>
      <label className="text-xs text-muted">{label}</label>
      <input type={isNum ? "number" : type} step={isNum ? "any" : undefined}
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-themed bg-input px-3 py-2.5 text-sm text-primary outline-none transition focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
    </div>
  );
}

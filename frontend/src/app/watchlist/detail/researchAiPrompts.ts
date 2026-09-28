import type { Locale } from "@/lib/i18n";
import type { WatchResearchSectionKey, WatchlistStock } from "@/lib/types";

const RESPONSE_LANGUAGE: Record<Locale, string> = {
  en: "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  ja: "Japanese",
  es: "Spanish",
  fr: "French",
};

const SECTION_TITLE_EN: Record<WatchResearchSectionKey, string> = {
  company_overview: "Company overview",
  industry_moat: "Industry and moat",
  growth_financials: "Growth and financial quality",
  risks_invalidation: "Risks and invalidation",
  valuation_decision: "Valuation and decision anchors",
};

const SECTION_TITLE_ZH: Record<WatchResearchSectionKey, string> = {
  company_overview: "公司概览",
  industry_moat: "行业与护城河",
  growth_financials: "增长与财务质量",
  risks_invalidation: "风险与证伪",
  valuation_decision: "估值与决策锚点",
};

const SECTION_REQUIREMENTS_EN: Record<WatchResearchSectionKey, string> = {
  company_overview: [
    "1. In one sentence, explain how the company makes money and identify the most important profit engine.",
    "2. Give only the three business facts that matter most to an investor, using the latest figures for mix, customers, economics, or capital allocation.",
    "3. State the strongest business quality, the weakest link, and the single unresolved variable that could change the view.",
    "4. End with a short Core view: is this a high-quality business, and what evidence would change that conclusion?",
  ].join("\n"),
  industry_moat: [
    "1. State the company's position in the industry and profit pool in no more than three bullets.",
    "2. Identify the one or two real sources of moat, with evidence; explicitly test switching costs, scale, network effects, regulation, or distribution where relevant.",
    "3. Name the two most relevant competitors or substitutes and the meaningful difference, not a generic competitor list.",
    "4. Give the strongest counter-evidence against the moat and finish with a Core view on durability plus one leading indicator to monitor.",
  ].join("\n"),
  growth_financials: [
    "1. Identify the three most important growth drivers; pair each with one measurable KPI and the latest direction of travel.",
    "2. Report only the decisive recent trends in revenue, margins, free cash flow, ROIC, leverage, or dilution. Use older history only when it changes the conclusion.",
    "3. Judge whether growth is high quality or purchased, and name the main financial constraint.",
    "4. Finish with a Core view and the next two reporting checkpoints that could confirm or weaken it.",
  ].join("\n"),
  risks_invalidation: [
    "1. Rank the top three risks by decision importance; for each give the mechanism and one observable leading sign.",
    "2. Write the strongest bear case in a few sentences and distinguish temporary volatility from structural deterioration.",
    "3. State two to four explicit invalidation conditions, using thresholds or time windows when evidence supports them.",
    "4. Finish with a Core view naming the primary risk and the one thing to monitor next.",
  ].join("\n"),
  valuation_decision: [
    "1. State the latest share price and date, then use only the two valuation metrics that best fit this business.",
    "2. Compare those metrics with a relevant historical range and two relevant peers; explain any major comparability limit.",
    "3. Give compact base, upside, and downside valuation ranges with the one or two assumptions that drive each range.",
    "4. Finish with a Core view: what expectations are already priced in, what margin of safety is needed, and what evidence would make the setup more attractive or less attractive. Do not issue a deterministic buy or sell call.",
  ].join("\n"),
};

const SECTION_REQUIREMENTS_ZH: Record<WatchResearchSectionKey, string> = {
  company_overview: [
    "1. 用一句话解释公司如何赚钱，并指出最重要的利润引擎。",
    "2. 只写对投资判断最重要的三条业务事实；对业务结构、客户、经济性或资本配置使用最新数据。",
    "3. 写明业务质量最强的一点、最薄弱的一点，以及可能改变判断的唯一未知变量。",
    "4. 最后给出简短的“核心观点”：这是不是一家高质量公司，什么证据会改变结论？",
  ].join("\n"),
  industry_moat: [
    "1. 不超过三条要点，说明公司在行业和利润池中的位置。",
    "2. 找出一到两个真正的护城河来源并给出证据；只讨论与该公司相关的转换成本、规模、网络效应、监管或渠道。",
    "3. 只列出两个最相关的竞争者或替代品，并说明真正有意义的差异，不要罗列公司名单。",
    "4. 给出反对护城河成立的最强证据，最后写“核心观点”：优势能持续多久，以及要跟踪的一个领先指标。",
  ].join("\n"),
  growth_financials: [
    "1. 找出三个最重要的增长驱动；每个驱动只配一个可衡量指标，并写明最新趋势。",
    "2. 只报告收入、利润率、自由现金流、ROIC、杠杆或稀释中真正影响判断的近期变化；只有会改变结论时才补充历史数据。",
    "3. 判断增长质量是健康增长还是靠投入换来的，并指出最大的财务约束。",
    "4. 最后给出“核心观点”，并列出未来两个可能验证或削弱判断的财报检查点。",
  ].join("\n"),
  risks_invalidation: [
    "1. 按对判断的重要性排序前三项风险；每项只写传导机制和一个可观察的领先信号。",
    "2. 用几句话写出最强空头论点，并区分短期波动和结构性恶化。",
    "3. 写出两到四条明确的证伪条件；有依据时给出阈值或持续时间。",
    "4. 最后给出“核心观点”：当前最主要的风险是什么，下一步只需要盯住什么。",
  ].join("\n"),
  valuation_decision: [
    "1. 写明最新股价及日期，然后只使用最适合该公司的两个估值指标。",
    "2. 将这两个指标与历史区间及两个相关同业比较，并说明重要的不可比之处。",
    "3. 给出简洁的基准、乐观和悲观估值区间，每个区间只写一到两个决定性假设。",
    "4. 最后写“核心观点”：当前价格隐含了什么预期，需要多大安全边际，什么证据会让机会更有吸引力或更差；不要给出确定性的买卖结论。",
  ].join("\n"),
};

function compact(value: string | null | undefined, fallback: string) {
  return value?.trim().replace(/\s+/g, " ") || fallback;
}

function compactList(values: string[], fallback: string) {
  const cleaned = values.map((value) => compact(value, "")).filter(Boolean);
  return cleaned.length ? cleaned.join(", ") : fallback;
}

export function buildResearchAiPrompt(
  key: WatchResearchSectionKey,
  stock: WatchlistStock,
  locale: Locale,
) {
  const researchDate = new Date().toISOString().slice(0, 10);
  const isChinese = locale === "zh-CN" || locale === "zh-TW";

  if (isChinese) {
    const fallback = "未提供";
    return [
      "你是一名严谨、重视反证的买方公司研究员。请基于公开资料完成下列研究，不要把市场叙事当成事实。",
      "",
      "## 研究对象",
      `- 公司：${compact(stock.name, fallback)} (${compact(stock.symbol, fallback)})`,
      `- 行业：${compact(stock.sector, fallback)}`,
      `- 细分领域：${compactList(stock.industries, fallback)}`,
      `- 研究主题：${compactList(stock.concepts, fallback)}`,
      `- 研究日期：${researchDate}`,
      `- 输出语言：${RESPONSE_LANGUAGE[locale]}`,
      "",
      `## 本次模块：${SECTION_TITLE_ZH[key]}`,
      SECTION_REQUIREMENTS_ZH[key],
      "",
      "## 证据与推理标准",
      "- 优先使用公司年报、季报、电话会、投资者演示、监管文件和行业原始资料，并附可访问的来源 URL。",
      "- 所有关键数据写明对应期间和发布日期；若数据可能过期，明确标注截至日期。",
      "- 明确区分已披露事实、你的计算和你的推断；找不到可靠证据时直接写“尚未验证”，不得编造。",
      "- 主动寻找反例、竞争对手证据和会推翻结论的信息，避免只验证既有观点。",
      "- 只研究公开公司信息。不要索取、猜测或输出用户持仓、成本、计划投入、击球价、目标价或私人笔记。",
      "",
      "## 输出格式",
      "- 仅输出可直接粘贴进 SeekCost 的 Markdown 正文，不要写寒暄、背景科普或免责声明。",
      "- 先用 2–3 句话给出“核心观点”，再给关键证据、最强反例和“下一步验证”；不要复述题目。",
      "- 正文控制在一屏以内，最多 6 个短小节、12 个要点；只保留会改变投资判断的信息。",
      "- 最后列出不超过 5 个关键来源和不超过 2 个下一步验证问题。",
    ].join("\n");
  }

  const fallback = "Not provided";
  return [
    "You are a rigorous, counter-evidence-driven buy-side company researcher. Use public information and do not treat market narratives as facts.",
    "",
    "## Research target",
    `- Company: ${compact(stock.name, fallback)} (${compact(stock.symbol, fallback)})`,
    `- Sector: ${compact(stock.sector, fallback)}`,
    `- Industries: ${compactList(stock.industries, fallback)}`,
    `- Research themes: ${compactList(stock.concepts, fallback)}`,
    `- Research date: ${researchDate}`,
    `- Response language: ${RESPONSE_LANGUAGE[locale]}`,
    "",
    `## Module: ${SECTION_TITLE_EN[key]}`,
    SECTION_REQUIREMENTS_EN[key],
    "",
    "## Evidence and reasoning standards",
    "- Prefer annual and quarterly filings, earnings calls, investor presentations, regulatory filings, and primary industry sources. Include accessible source URLs.",
    "- Give the period and publication date for every material figure. Label the as-of date when information may be stale.",
    "- Clearly distinguish reported facts, your calculations, and your inferences. Write 'Not verified' instead of inventing missing information.",
    "- Actively seek counter-evidence, competitor evidence, and facts that could overturn the conclusion.",
    "- Research public company information only. Do not request, infer, or output the user's holdings, cost basis, planned capital, strike price, target price, or private notes.",
    "",
    "## Output contract",
    "- Return only paste-ready Markdown for SeekCost, without greetings, background education, or generic disclaimers.",
    "- Start with a 2–3 sentence Core view, then give key evidence, the strongest counter-evidence, and Next verification. Do not restate the prompt.",
    "- Keep the main body to roughly one screen: no more than 6 short sections and 12 bullets. Include only information that could change the investment view.",
    "- Finish with no more than 5 Key sources and no more than 2 Next verification questions.",
  ].join("\n");
}

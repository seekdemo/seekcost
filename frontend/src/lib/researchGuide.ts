export type GuideKey =
  "business" | "customers" | "financials" | "risks" | "valuation" | "judgment";
export type GuideEvidence = {
  title: string;
  url: string;
  excerpt: string;
  period: string;
};
export type GuideAnswer = {
  text: string;
  status: "thinking" | "unknown" | "answered";
  uncertainty: string;
  evidence: GuideEvidence[];
};
export type GuideDraft = {
  stock_id: number;
  version: number;
  step: number;
  mode: "guided" | "independent";
  answers: Partial<Record<GuideKey, GuideAnswer>>;
  published_version: number | null;
  note_id: number | null;
  updated_at: string | null;
};
export const blankAnswer = (): GuideAnswer => ({
  text: "",
  status: "thinking",
  uncertainty: "",
  evidence: [],
});
export const questions: {
  key: GuideKey;
  title: string;
  question: string;
  hint: string;
  explanation: string;
  counter: string;
  evidenceHint: string;
}[] = [
  {
    key: "business",
    title: "理解生意",
    question: "这家公司主要靠什么赚钱？",
    hint: "用自己的话写：它向谁提供什么，客户为什么付钱。",
    explanation:
      "先不看股价。把公司想成一家店：卖什么、卖给谁、按次收费还是持续收费？有多个业务时，先找收入贡献最大的部分。",
    counter: "行业前景好，不等于这家公司一定受益。行业增长怎样转化为它的收入？",
    evidenceHint:
      "年报的业务介绍、分部收入。记录财年及业务口径，不要混用收入占比与利润占比。",
  },
  {
    key: "customers",
    title: "竞争与客户",
    question: "客户为什么选择它，而不是别人？",
    hint: "从价格、产品、渠道、转换成本中选择你能解释的一点。",
    explanation:
      "竞争优势不是“公司很有名”。试着问：如果客户换一家供应商，会损失什么？你的答案是推测，还是有留存率、定价或市场份额等证据？",
    counter:
      "如果竞争对手降价，客户还会留下吗？有没有客户流失或优势减弱的迹象？",
    evidenceHint:
      "年报的竞争描述、客户集中度、业务指标。公司自己的宣传仍需要交叉核实。",
  },
  {
    key: "financials",
    title: "经营质量",
    question: "业务增长，有没有变成利润和现金？",
    hint: "分别观察收入、利润、经营现金流，不必一次看懂所有指标。",
    explanation:
      "收入是卖了多少，利润是扣除成本后赚了多少，经营现金流关注经营中实际流入流出的现金。利润与现金不一致不一定是坏事，但值得查原因。",
    counter:
      "收入增长时，应收账款或存货是否增长得更快？改善来自主营业务，还是一次性因素？",
    evidenceHint:
      "至少比较两个可比期间。注明币种、单位、季度或年度，以及 GAAP / 调整后口径；不要直接比较不同口径。",
  },
  {
    key: "risks",
    title: "寻找反证",
    question: "什么证据可能说明，你现在的理解不成立？",
    hint: "挑一个最重要的风险，说明它怎样影响生意，而不只是列名词。",
    explanation:
      "风险不是写一句“市场有风险”。例如大客户减少采购，会影响订单和收入。区分已经发生的事实、可能发生的情况，以及你目前不知道的事。",
    counter: "如果要向一个反对你的人解释，他最有力的反对理由是什么？",
    evidenceHint:
      "年报风险因素、债务到期安排、客户集中度、历史经营变化。风险披露不代表风险一定发生。",
  },
  {
    key: "valuation",
    title: "理解价格",
    question: "当前价格，需要哪些经营假设才能成立？",
    hint: "可以先写清“我还无法判断”，再列出需要的增长、利润率或估值依据。",
    explanation:
      "好公司也可能价格昂贵。估值不是唯一目标价，而是有条件的判断。市盈率受盈利周期影响，亏损企业也不能直接套用同一方法。",
    counter:
      "如果增长慢一些、利润率低一些，你的判断还成立吗？你的比较对象业务和风险是否相近？",
    evidenceHint:
      "记录价格日期、盈利期间、估值方法及假设。第一版不自动计算目标价，也不把示例价格当实时行情。",
  },
  {
    key: "judgment",
    title: "形成判断",
    question: "你现在如何理解它？什么会让你改变想法？",
    hint: "写下当前判断和理由。决定继续观察、暂不参与，也是一种有效结果。",
    explanation:
      "把事实、假设和观点分开。研究不是必须得到买入结论，而是知道自己理解了什么，还不理解什么，以及下次该核实什么。",
    counter:
      "如果只留下一个待验证的问题，你会选哪个？出现什么证据，你愿意改变现在的想法？",
    evidenceHint:
      "回看前面的来源。不要因为写完六个问题，就认为研究已经充分或风险已经消失。",
  },
];
export function safeSourceUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !parsed.username
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}
export function thinkingPrompt(answer: GuideAnswer, counter: string): string {
  if (answer.status === "unknown")
    return "不知道也可以。先选一个最小的问题：需要找到哪条资料，才能向前一步？";
  if (!answer.text.trim())
    return "先记录一个理解或疑问。不用追求专业，也不用急着得出结论。";
  if (!answer.evidence.length)
    return "你已经写下了想法。哪一条可查证的资料支持它？暂时没有证据，可以先保留为假设。";
  if (!answer.uncertainty.trim())
    return "已有来源不等于判断成立。试着写下一条反面理由，或一个尚未核实的问题。";
  return counter;
}

const en: Record<string, string> = {
  "ux.alerts": "Custom alerts",
  "ux.skip": "Skip to content", "ux.finance": "Personal finance",
  "ux.expandPreview": "Show all {count} previews", "ux.collapsePreview": "Show fewer",
  "ux.previewSummary": "Showing {shown} of {count} cached previews · higher severity first",
  "ux.noAssets": "Add an investment before recording a transaction",
  "ux.noAssetsHint": "Create an investment in the catalog, or import your IBKR statement. Then return here to record a buy or sell.",
  "ux.addAsset": "Open investment catalog", "ux.import": "Import IBKR statement",
  "ux.loadFailed": "Could not load investments. Please retry.", "ux.retry": "Retry",
  "ux.saving": "Submitting…",
  "ux.researchEmpty": "Your research library is ready",
  "ux.researchEmptyHint": "Start with a thesis, supporting evidence and a question to revisit.",
  "ux.researchCreate": "Create your first research note",
};
const zh: Record<string, string> = {
  "ux.alerts": "自定义提醒",
  "ux.skip": "跳到正文", "ux.finance": "个人财务",
  "ux.expandPreview": "展开全部 {count} 条预览", "ux.collapsePreview": "收起预览",
  "ux.previewSummary": "展示缓存预览 {shown} / {count} 条 · 高风险优先",
  "ux.noAssets": "先建立投资，再记录交易",
  "ux.noAssetsHint": "先在投资目录中添加标的，或导入 IBKR 报表，再回到这里记录买入与卖出。",
  "ux.addAsset": "前往投资目录", "ux.import": "导入 IBKR 报表",
  "ux.loadFailed": "投资数据加载失败，请重试。", "ux.retry": "重试",
  "ux.saving": "正在提交…",
  "ux.researchEmpty": "从第一条研究开始",
  "ux.researchEmptyHint": "记录一个判断、支持它的证据，以及下次需要验证的问题。",
  "ux.researchCreate": "创建第一条研究",
};
export function translateUx(locale: string, key: string) {
  return (locale === "zh-CN" ? zh[key] : undefined) || en[key] || "";
}

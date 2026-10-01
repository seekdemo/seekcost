const en: Record<string, string> = {
  "nav.reminderAria": "Reminder navigation", "nav.priceRules": "Price rules", "nav.notificationRecords": "Notification records",
  "nav.thinking": "Thinking", "nav.watchlist": "Watchlist", "nav.researchNotes": "Research notes", "nav.reminders": "Reminders", "nav.sectionAria": "Section navigation",
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
  "nav.reminderAria": "提醒导航", "nav.priceRules": "价格规则", "nav.notificationRecords": "通知记录",
  "nav.thinking": "思考", "nav.watchlist": "股票池", "nav.researchNotes": "研究笔记", "nav.reminders": "提醒", "nav.sectionAria": "栏目导航",
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
const navigation: Record<string, Record<string, string>> = {
  "zh-TW": { "nav.thinking": "思考", "nav.watchlist": "股票池", "nav.researchNotes": "研究筆記", "nav.reminders": "提醒", "nav.sectionAria": "欄目導覽", "nav.reminderAria": "提醒導覽", "nav.priceRules": "價格規則", "nav.notificationRecords": "通知記錄" },
  ja: { "nav.thinking": "考察", "nav.watchlist": "ウォッチリスト", "nav.researchNotes": "研究ノート", "nav.reminders": "リマインダー", "nav.sectionAria": "セクションナビゲーション", "nav.reminderAria": "リマインダーナビゲーション", "nav.priceRules": "価格ルール", "nav.notificationRecords": "通知履歴" },
  es: { "nav.thinking": "Reflexión", "nav.watchlist": "Seguimiento", "nav.researchNotes": "Notas de análisis", "nav.reminders": "Alertas", "nav.sectionAria": "Navegación de sección", "nav.reminderAria": "Navegación de alertas", "nav.priceRules": "Reglas de precio", "nav.notificationRecords": "Historial de notificaciones" },
  fr: { "nav.thinking": "Réflexion", "nav.watchlist": "Suivi", "nav.researchNotes": "Notes de recherche", "nav.reminders": "Alertes", "nav.sectionAria": "Navigation de section", "nav.reminderAria": "Navigation des alertes", "nav.priceRules": "Règles de prix", "nav.notificationRecords": "Historique des notifications" },
};
export function translateUx(locale: string, key: string) {
  return (locale === "zh-CN" ? zh[key] : navigation[locale]?.[key]) || en[key] || "";
}

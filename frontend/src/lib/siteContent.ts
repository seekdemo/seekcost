export type ContentLocale = "zh-CN" | "en";
export type AboutCopy = { title: string; intro: string; mission: string; values: string; roadmap: string };
export type ContentDraft = { draft: AboutCopy; published: AboutCopy; version: number; published_at: string | null };
export type ContentAudit = { id: number; actor_id: number | null; action: string; key: string; locale: string; version: number; created_at: string };

export const CONTENT_FIELDS: {key: keyof AboutCopy; label: string; max: number; rows: number}[] = [
  {key:"title", label:"页面标题", max:120, rows:1},
  {key:"intro", label:"一句话定位与导语", max:1000, rows:3},
  {key:"mission", label:"为什么开发 SeekCost", max:12000, rows:8},
  {key:"values", label:"平台带来的价值", max:12000, rows:8},
  {key:"roadmap", label:"未来优化方向（请明确计划与已上线的区别）", max:12000, rows:10},
];

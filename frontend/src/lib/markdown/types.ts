export type ContentFormat = "markdown" | "rich";

export interface MarkdownValue {
  source: string;
  format: ContentFormat;
}

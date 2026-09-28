function textOf(node: Node): string {
  return node.textContent?.replace(/\u00a0/g, " ") || "";
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return textOf(node);
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  const content = Array.from(element.childNodes).map(inline).join("");
  switch (element.tagName.toLowerCase()) {
    case "strong":
    case "b": return `**${content.trim()}**`;
    case "em":
    case "i": return `*${content.trim()}*`;
    case "code": return `\`${content.trim()}\``;
    case "a": {
      const href = element.getAttribute("href") || "";
      return /^https?:\/\//i.test(href) ? `[${content.trim() || href}](${href})` : content;
    }
    case "br": return "\n";
    default: return content;
  }
}

function block(node: Node, listDepth = 0): string {
  if (node.nodeType === Node.TEXT_NODE) return textOf(node).trim();
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  if (["script", "style", "iframe", "object", "embed", "img", "svg", "video", "audio", "canvas"].includes(tag)) return "";
  if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag[1]))} ${inline(element).trim()}`;
  if (tag === "blockquote") return inline(element).trim().split("\n").map((line) => `> ${line}`).join("\n");
  if (tag === "pre") return `\`\`\`\n${textOf(element).trim()}\n\`\`\``;
  if (tag === "li") {
    const parent = element.parentElement?.tagName.toLowerCase();
    const marker = parent === "ol" ? "1. " : "- ";
    return `${"  ".repeat(listDepth)}${marker}${inline(element).trim()}`;
  }
  if (tag === "ul" || tag === "ol") {
    return Array.from(element.children).map((child) => block(child, listDepth + 1)).filter(Boolean).join("\n");
  }
  if (tag === "table") {
    const rows = Array.from(element.querySelectorAll("tr")).map((row) => Array.from(row.children).map((cell) => inline(cell).trim().replace(/\|/g, "\\|")).join(" | "));
    if (!rows.length) return "";
    const columns = rows[0].split(" | ").length;
    return [rows[0], Array.from({ length: columns }, () => "---").join(" | "), ...rows.slice(1)].join("\n");
  }
  if (["p", "div", "section", "article", "header", "footer", "hr"].includes(tag)) {
    if (tag === "hr") return "---";
    return Array.from(element.childNodes).map((child) => block(child, listDepth)).filter(Boolean).join("\n");
  }
  return inline(element).trim();
}

/** Convert HTML-only clipboard payloads without preserving unsafe markup. */
export function htmlClipboardToMarkdown(html: string): string {
  if (!html.trim()) return "";
  if (typeof DOMParser === "undefined") {
    return html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<(?:iframe|object|embed|img|svg|video|audio|canvas)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|svg|video|audio|canvas)>/gi, "")
      .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_match, level: string, content: string) => `${"#".repeat(Number(level))} ${content}`)
      .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**")
      .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*")
      .replace(/<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
      .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const document = new DOMParser().parseFromString(html, "text/html");
  return Array.from(document.body.childNodes).map((node) => block(node)).filter(Boolean).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function isStoredRichText(value: string): boolean {
  return /<\/?(?:p|div|section|article|h[1-6]|ul|ol|li|blockquote|strong|b|em|i|pre|code|table|a|br)\b/i.test(value);
}

/** Convert a legacy HTML value when it is opened for explicit Markdown editing. */
export function storedTextToMarkdown(value: string): string {
  return isStoredRichText(value) ? htmlClipboardToMarkdown(value) : value;
}

export function markdownPlainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^\s*(?:#{1,6}|[-*+]|\d+\.|>)\s+/gm, "")
    .replace(/[*_~`|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

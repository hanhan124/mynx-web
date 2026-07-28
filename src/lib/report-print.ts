const INLINE_RE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;

type PrintBlock =
  | { type: "h"; level: number; text: string }
  | { type: "p" | "quote"; text: string }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "code"; text: string }
  | { type: "hr" }
  | { type: "table"; rows: string[][] };

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inlineHtml(value: string): string {
  let output = "";
  let last = 0;
  let match: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(value)) !== null) {
    output += escapeHtml(value.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("`")) {
      output += `<code>${escapeHtml(token.slice(1, -1))}</code>`;
    } else if (token.startsWith("**")) {
      output += `<strong>${escapeHtml(token.slice(2, -2))}</strong>`;
    } else {
      output += `<em>${escapeHtml(token.slice(1, -1))}</em>`;
    }
    last = match.index + token.length;
  }
  output += escapeHtml(value.slice(last));
  return output;
}

function splitTableRow(row: string): string[] {
  return row
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function parseBlocks(markdown: string): PrintBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: PrintBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trimStart().startsWith("```")) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    if (/^\s*([-*_])\1\1[-*_\s]*$/.test(line)) {
      blocks.push({ type: "hr" });
      i += 1;
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "h", level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }
    if (line.trimStart().startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", text: quote.join("\n") });
      continue;
    }
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])
    ) {
      const rows: string[][] = [splitTableRow(line)];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: "table", rows });
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\s*>)/.test(lines[i]) &&
      !(
        lines[i].includes("|") &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])
      )
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: "p", text: paragraph.join(" ") });
  }
  return blocks;
}

function blocksToHtml(blocks: PrintBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "h":
          return `<h${block.level}>${inlineHtml(block.text)}</h${block.level}>`;
        case "p":
          return `<p>${inlineHtml(block.text)}</p>`;
        case "quote":
          return `<blockquote>${inlineHtml(block.text).replace(/\n/g, "<br>")}</blockquote>`;
        case "ul":
          return `<ul>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</ul>`;
        case "ol":
          return `<ol>${block.items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</ol>`;
        case "code":
          return `<pre><code>${escapeHtml(block.text)}</code></pre>`;
        case "hr":
          return "<hr />";
        case "table": {
          const [header, ...body] = block.rows;
          const head = `<thead><tr>${header.map((cell) => `<th>${inlineHtml(cell)}</th>`).join("")}</tr></thead>`;
          const rows = body
            .map((row) => `<tr>${row.map((cell) => `<td>${inlineHtml(cell)}</td>`).join("")}</tr>`)
            .join("");
          return `<table>${head}<tbody>${rows}</tbody></table>`;
        }
      }
    })
    .join("\n");
}

/** Build a self-contained A4 HTML document for WebView2 PrintToPdf. */
export function markdownToPrintableHtml(markdown: string): string {
  const body = blocksToHtml(parseBlocks(markdown));
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>qPCR 分析报告</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { color: #171717; font-family: "Microsoft YaHei", "SimSun", Arial, sans-serif; font-size: 11pt; line-height: 1.65; }
  main { width: 100%; }
  h1, h2, h3, h4, h5, h6 { margin: 18pt 0 7pt; line-height: 1.3; page-break-after: avoid; }
  h1 { font-size: 20pt; border-bottom: 1px solid #d0d0d0; padding-bottom: 5pt; }
  h2 { font-size: 16pt; }
  h3 { font-size: 13pt; }
  h4, h5, h6 { font-size: 11pt; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 8pt; padding-left: 22pt; }
  li { margin: 2pt 0; }
  code { font-family: Consolas, "Microsoft YaHei", monospace; font-size: 9pt; background: #f3f3f3; padding: 1pt 3pt; }
  pre { margin: 0 0 10pt; padding: 8pt 10pt; background: #f3f3f3; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 8.5pt; }
  blockquote { margin: 0 0 8pt; padding: 4pt 10pt; border-left: 3pt solid #666; color: #444; background: #f7f7f7; }
  hr { border: 0; border-top: 1px solid #ccc; margin: 12pt 0; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 10pt; font-size: 9.5pt; table-layout: fixed; }
  th, td { border: 0.6pt solid #aaa; padding: 4pt 5pt; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
  th { background: #ededed; font-weight: 700; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

import { useMemo } from "react";

/**
 * 极简 Markdown 渲染器 —— 不引入 marked 等依赖，覆盖 InfiniSynapse 报告常见结构：
 * 标题(#..######)、段落、有序/无序列表、加粗/斜体/行内代码、代码块、水平线、表格、引用。
 * 输出受限于 React DOM，XSS 由 React 自动转义保证（不使用 dangerouslySetInnerHTML）。
 */

/** 渲染行内格式：`code`、**bold**、*italic*。返回 React 节点数组。 */
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // 用一个正则同时匹配 `code` | **bold** | *italic*
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-${i++}`;
    if (tok.startsWith("`")) {
      nodes.push(
        <code key={key} className="md-code-inline">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      nodes.push(<strong key={key}>{tok.slice(2, -2)}</strong>);
    } else if (tok.startsWith("*")) {
      nodes.push(<em key={key}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

interface Block {
  type: "h" | "p" | "ul" | "ol" | "code" | "hr" | "table" | "quote";
  level?: number;
  text?: string;
  items?: string[];
  lang?: string;
  rows?: string[][];
}

function parse(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // 代码块
    if (line.trimStart().startsWith("```")) {
      const lang = line.trim().replace(/^```/, "");
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }

    // 水平线
    if (/^\s*([-*_])\1\1[-*_\s]*$/.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // 标题
    const hm = line.match(/^(#{1,6})\s+(.*)$/);
    if (hm) {
      blocks.push({ type: "h", level: hm[1].length, text: hm[2].trim() });
      i++;
      continue;
    }

    // 引用
    if (line.trimStart().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      blocks.push({ type: "quote", text: buf.join("\n") });
      continue;
    }

    // 表格：连续两行，第二行是 |---|---|
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      const splitRow = (r: string) =>
        r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim());
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", rows: [header, ...rows] });
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // 空行
    if (line.trim() === "") {
      i++;
      continue;
    }

    // 段落（连续非空行合并）
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\s*>)/.test(lines[i]) &&
      !(lines[i].includes("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1]))
    ) {
      buf.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

export default function MarkdownView({ content }: { content: string }) {
  const blocks = useMemo(() => parse(content), [content]);
  return (
    <div className="md-view">
      {blocks.map((b, idx) => {
        const key = `b-${idx}`;
        switch (b.type) {
          case "h": {
            const Tag = (`h${Math.min(b.level ?? 1, 6)}` as unknown) as keyof JSX.IntrinsicElements;
            return (
              <Tag key={key} className={`md-h md-h-${b.level}`}>
                {renderInline(b.text ?? "", key)}
              </Tag>
            );
          }
          case "p":
            return (
              <p key={key} className="md-p">
                {renderInline(b.text ?? "", key)}
              </p>
            );
          case "ul":
            return (
              <ul key={key} className="md-ul">
                {b.items?.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={key} className="md-ol">
                {b.items?.map((it, j) => (
                  <li key={`${key}-${j}`}>{renderInline(it, `${key}-${j}`)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre key={key} className="md-code-block">
                <code>{b.text}</code>
              </pre>
            );
          case "hr":
            return <hr key={key} className="md-hr" />;
          case "quote":
            return (
              <blockquote key={key} className="md-quote">
                {renderInline(b.text ?? "", key)}
              </blockquote>
            );
          case "table":
            return (
              <div key={key} className="md-table-wrap">
                <table className="md-table">
                  <tbody>
                    {b.rows?.map((row, ri) => (
                      <tr key={`${key}-${ri}`}>
                        {row.map((cell, ci) =>
                          ri === 0 ? (
                            <th key={`${key}-${ri}-${ci}`}>{renderInline(cell, `${key}-${ri}-${ci}`)}</th>
                          ) : (
                            <td key={`${key}-${ri}-${ci}`}>{renderInline(cell, `${key}-${ri}-${ci}`)}</td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

import { useState, useEffect, useRef } from "react";
import Modal from "./Modal";
import { IconQuestionMark, IconX, IconChevronRight } from "@tabler/icons-react";

interface Props {
  variant?: "inline" | "icon";
}

export default function HelpButton({
  variant = "icon",
  children,
}: Props & { children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={`help-btn help-btn--${variant}`}
        onClick={() => setOpen(true)}
        title="查看使用教程"
        aria-label="查看使用教程"
      >
        <IconQuestionMark size={variant === "inline" ? 14 : 13} stroke={1.75} />
        {variant === "inline" && <span>使用教程</span>}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} wide>
        {children(() => setOpen(false))}
      </Modal>
    </>
  );
}

/* ================================================================
 * 通用教程辅助子组件
 * ================================================================ */

function Section({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section id={`tut-${id}`} className="tutorial__section">
      <h2 className="tutorial__h2">{title}</h2>
      <p className="tutorial__subtitle-inline">{subtitle}</p>
      {children}
    </section>
  );
}

function Callout({
  type,
  children,
}: {
  type: "info" | "warn" | "tip";
  children: React.ReactNode;
}) {
  return <div className={`tutorial__callout tutorial__callout--${type}`}>{children}</div>;
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="tutorial__faq"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <span>{q}</span>
        <span className={`tutorial__faq-arrow ${open ? "open" : ""}`}>›</span>
      </summary>
      <div className="tutorial__faq-body">{children}</div>
    </details>
  );
}

/* ================================================================
 * 通用滚动监听 hook — 目录高亮当前可见章节
 * ================================================================ */
function useTutorialScroll(sections: { id: string }[]) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => {
      const tops = sections
        .map((s) => {
          const el = root.querySelector(`#tut-${s.id}`) as HTMLElement | null;
          return el ? { id: s.id, top: el.getBoundingClientRect().top - root.getBoundingClientRect().top } : null;
        })
        .filter((x): x is { id: string; top: number } => x !== null);
      const current = tops.reduce(
        (acc, cur) => (cur.top <= 80 && cur.top > acc.top ? cur : acc),
        { id: sections[0]?.id ?? "", top: -Infinity }
      );
      setActiveId(current.id);
    };
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollTo = (id: string) => {
    const root = scrollRef.current;
    const el = root?.querySelector(`#tut-${id}`) as HTMLElement | null;
    if (root && el) {
      root.scrollTo({ top: el.offsetTop - root.offsetTop, behavior: "smooth" });
    }
  };

  return { activeId, scrollRef, scrollTo };
}

/* ================================================================
 * qPCR 使用教程 — 纯用户视角
 * ================================================================ */

export function QpcrTutorial({ onClose }: { onClose: () => void }) {
  const sections = [
    { id: "intro", title: "📖 简介" },
    { id: "prep", title: "📋 准备 Excel" },
    { id: "file", title: "① 选文件" },
    { id: "transform", title: "② 转数据" },
    { id: "calc", title: "③ 算表达量" },
    { id: "chart", title: "④ 出图" },
    { id: "faq", title: "❓ 常见问题" },
  ];

  const { activeId, scrollRef, scrollTo } = useTutorialScroll(sections);

  return (
    <div className="tutorial">
      <div className="tutorial__header">
        <div>
          <div className="tutorial__title">qPCR 分析使用教程</div>
          <div className="tutorial__subtitle">从原始 Ct 到图表 · 4 步走完</div>
        </div>
        <button className="tutorial__close" onClick={onClose} aria-label="关闭教程">
          <IconX size={16} stroke={1.75} />
        </button>
      </div>

      <div className="tutorial__body">
        <aside className="tutorial__nav">
          <div className="tutorial__nav-title">目录</div>
          <ul>
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  className={`tutorial__nav-item ${activeId === s.id ? "active" : ""}`}
                  onClick={() => scrollTo(s.id)}
                >
                  <IconChevronRight size={12} stroke={1.75} />
                  <span>{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="tutorial__nav-tip">💡 点目录可快速跳转</div>
        </aside>

        <div className="tutorial__content" ref={scrollRef}>
          {/* ── 简介 ── */}
          <Section id="intro" title="📖 简介" subtitle="这工具能干什么">
            <p>
              Mynx qPCR 分析模块帮你在本地完成 <strong>qPCR 相对定量</strong> 的全部计算和出图，
              不需要手写 Excel 公式，也不依赖任何在线服务。
            </p>
            <p>典型流程（2–5 分钟）：</p>
            <ol>
              <li><strong>选文件</strong> — 仪器导出的 Excel（.xlsx）</li>
              <li><strong>转数据</strong> — 宽表转成长表，统一格式</li>
              <li><strong>算表达量</strong> — 选方法 + 内参基因，自动算 RE + 均值 + 标准差</li>
              <li><strong>出图</strong> — 每个基因自动生成柱状图（带误差棒）</li>
            </ol>
            <Callout type="info">
              支持两种计算方法：<strong>相对内参</strong>（默认）和<strong>相对对照（ΔΔCt）</strong>，
              适合处理 96 / 384 孔板数据，把多个目标基因归一化到内参基因。
            </Callout>
          </Section>

          {/* ── 准备 Excel ── */}
          <Section id="prep" title="📋 准备 Excel" subtitle="你的文件长这样就 OK">
            <p>只需要 <strong>3 列</strong>核心数据，其余列会被自动忽略：</p>

            <div className="tutorial__table-wrap">
              <table className="tutorial__table">
                <thead>
                  <tr><th>列名</th><th>含义</th><th>必需</th></tr>
                </thead>
                <tbody>
                  <tr><td><code>Target</code> / <code>Gene</code> / <code>基因</code></td><td>基因名（如 GAPDH）</td><td>✓</td></tr>
                  <tr><td><code>Sample</code> / <code>Group</code> / <code>样本</code> / <code>分组</code></td><td>样本或分组名</td><td>✓</td></tr>
                  <tr><td><code>Cq</code> / <code>Ct</code></td><td>Ct 数值</td><td>✓</td></tr>
                  <tr><td><code>Well</code> / <code>Fluor</code> / <code>Content</code> 等</td><td>无关列</td><td>忽略</td></tr>
                </tbody>
              </table>
            </div>

            <p style={{ marginTop: 14 }}><strong>Excel 示例（每行一个孔）：</strong></p>
            <pre className="tutorial__code">{`Well  Fluor  Target   Sample       Cq
----- ------ -------- ------------ ----
A01   SYBR   GAPDH    Sample_A     18.06
A02   SYBR   GAPDH    Sample_A     18.15
A03   SYBR   TNF      Sample_A     25.13
B01   SYBR   GAPDH    Sample_B     18.82
B02   SYBR   TNF      Sample_B     24.87`}</pre>

            <Callout type="warn">
              ⚠️ 只支持 <code>.xlsx</code> 格式。<code>.xls</code> 旧版请先在 Excel 中另存为新格式。
            </Callout>
          </Section>

          {/* ── ① 选文件 ── */}
          <Section id="file" title="① 选文件" subtitle="在第一张卡片里选 Excel">
            <p>两种方式：</p>
            <ul>
              <li>点 <code>打开</code> 按钮，弹出文件选择框</li>
              <li>把 Excel 文件直接拖到卡片虚线框里</li>
            </ul>
            <p>
              选好后卡片会显示 <strong>文件名 + 完整路径</strong>。
              如果文件有多个 sheet，下拉框里选含 Ct 数据的那张。
            </p>
            <Callout type="tip">
              如果文件之前已经转换过，打开后会自动识别基因名，可直接跳到第 ③ 步计算。
            </Callout>
          </Section>

          {/* ── ② 转数据 ── */}
          <Section id="transform" title="② 转数据" subtitle="点「执行转换」">
            <p>
              这一步把原始宽表（每孔一行）转成 <code>Transformed Data</code> sheet：
              每行一个样本的一个重复，列为 <code>Num / Group / 基因名…</code>。
            </p>
            <p>转换过程中：</p>
            <ul>
              <li>每个技术重复保留为独立行（不合并）</li>
              <li>
                缺失的 Ct 值会自动用同一样本该基因的<strong>其他有效重复</strong>填补，并标黄底；
                如果完全没有有效值，填入 <code>50</code> 占位并标黄
              </li>
              <li>几秒内完成，自动保存到原文件</li>
            </ul>
            <p>
              如果文件<strong>已经转换过</strong>，卡片会显示绿色提示「已转换（N 个基因），可直接计算」，
              无需重复执行。
            </p>
            <Callout type="warn">
              ⚠️ 转换后只保留 <code>Num / Group / 基因名</code> 列，原始的 Well / Fluor / Content 等列会被丢弃。
            </Callout>
          </Section>

          {/* ── ③ 算表达量 ── */}
          <Section id="calc" title="③ 算表达量" subtitle="选好方法 + 参数，点「执行计算」">
            <p>先选<strong>计算方法</strong>，再设置其余参数：</p>

            <div className="tutorial__table-wrap">
              <table className="tutorial__table">
                <thead>
                  <tr><th>方法</th><th>说明</th><th>结果列名</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>相对内参</strong>（默认）</td>
                    <td>每个样本 2^-(ΔCt) = 2^-(目标 - 内参)，不做对照归一化</td>
                    <td><code>Relative Expression</code></td>
                  </tr>
                  <tr>
                    <td><strong>相对对照</strong>（ΔΔCt）</td>
                    <td>在相对内参基础上，再除以对照组平均 RE，使对照组 ≈ 1，其余组为相对倍数</td>
                    <td><code>Normalized Expression</code></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p>选定方法后，设置其余参数：</p>
            <ul>
              <li><strong>对照组</strong>（仅 ΔΔCt 方法）：从下拉框选一个组作为对照，其余组归一化到它</li>
              <li><strong>重复次数</strong>：选 1–10，跟实际技术重复数一致</li>
              <li><strong>参考基因</strong>：选 1 个（常用 GAPDH / ACTB），默认选第一个基因</li>
              <li><strong>柱状图颜色</strong>：默认蓝色，可自定义，选择会自动记住</li>
            </ul>

            <p>相对表达量计算公式：</p>
            <div className="tutorial__formula">
              <code>相对内参：RE = 2<sup>−(Ct<sub>目标</sub> − Ct<sub>内参</sub>)</sup></code>
            </div>
            <div className="tutorial__formula" style={{ marginTop: 8 }}>
              <code>相对对照：NE = RE / 对照组平均RE</code>
            </div>

            <p>算完后，每个目标基因会生成一张独立的 sheet，结构如下：</p>
            <div className="tutorial__table-wrap">
              <table className="tutorial__table">
                <thead>
                  <tr><th>列</th><th>内容</th></tr>
                </thead>
                <tbody>
                  <tr><td>A</td><td>参考基因 Ct 值</td></tr>
                  <tr><td>B</td><td>目标基因 Ct 值</td></tr>
                  <tr><td>C</td><td>Relative / Normalized Expression（取决于方法）</td></tr>
                  <tr><td>D</td><td>该组 Average（均值）</td></tr>
                  <tr><td>E</td><td>该组 Stdev（标准差）</td></tr>
                  <tr><td>F</td><td>Group_Name（组名）</td></tr>
                  <tr><td>G</td><td>Method（方法标注，含对照组名）</td></tr>
                </tbody>
              </table>
            </div>
            <p>此外还会生成一张 <code>Summary_All_Genes</code> 汇总表，包含所有基因所有组的表达量、均值和标准差，每行末尾标注 Method。</p>
            <Callout type="warn">
              ⚠️ 如果某组数据有缺失（Ct 为空），该组的均值和标准差不会计算，显示为 N/A。
              请回到原始 Excel 补上对应孔位的 Ct 值后重新转换 + 计算。
            </Callout>
            <Callout type="info">
              ΔΔCt 方法要求对照组必须有<strong>完整且有效的重复数据</strong>，
              否则会提示「未找到对照组的有效数据」。请确保对照组的 Ct 值齐全。
            </Callout>
          </Section>

          {/* ── ④ 出图 ── */}
          <Section id="chart" title="④ 出图" subtitle="计算完自动生成，打开 Excel 就能看">
            <p>
              计算完成后，图表会<strong>自动嵌入</strong>到每个基因 sheet 的底部。
              每张图是一根柱状图：
            </p>
            <ul>
              <li>横轴 = 不同样本 / 分组</li>
              <li>纵轴标题根据方法不同：
                <ul>
                  <li>相对内参：<code>Normalize to {`{内参基因}`}</code></li>
                  <li>相对对照：<code>Normalize to {`{对照组}`} ({`{内参基因}`})</code></li>
                </ul>
              </li>
              <li>柱子颜色 = 你选的颜色</li>
              <li>重复次数 ≥ 2 时自动添加<strong>误差棒</strong>（标准差，单向向上）</li>
            </ul>
            <p>
              图表是 <strong>Excel 原生图表对象</strong>，双击即可在 Excel / WPS / LibreOffice 中二次编辑
              （改颜色、改标题、调大小等）。
            </p>
            <Callout type="info">
              ✅ 不需要安装 Excel 也能生成图表——Mynx 直接修改 xlsx 文件的 XML 实现，
              生成后用任何能打开 xlsx 的软件都能看到图。
            </Callout>
          </Section>

          {/* ── FAQ ── */}
          <Section id="faq" title="❓ 常见问题" subtitle="对号入座，看怎么办">
            <Faq q="按钮一直灰着点不动？">
              <strong>「执行转换」灰：</strong>检查文件是不是 <code>.xlsx</code>，以及 sheet 下拉里选对了没。
              <br /><strong>「执行计算」灰：</strong>检查「参考基因」下拉里有没有值（需要先跑过「执行转换」）。
              如果选了「相对对照」方法，「对照组」也必须有值。
            </Faq>
            <Faq q="相对对照（ΔΔCt）提示「未找到对照组有效数据」？">
              切换到「相对对照」方法后，需要在<strong>对照组</strong>下拉里选一个组名。
              该组必须在 Transformed Data 里有<strong>完整的技术重复</strong>且 Ct 值都有效（非空）。
              如果对照组 Ct 缺失，请回原始 Excel 补齐后重新转换 + 计算。
            </Faq>
            <Faq q="表达量全是 N/A？">
              通常是参考基因那几行 Ct 缺失（原始数据有空格或 N/A）。
              打开生成的 Excel，看 Transformed Data sheet 里参考基因那列的<strong>黄格子</strong>，
              回原始 Excel 补上对应孔位的 Ct，再重新转换 + 计算。
            </Faq>
            <Faq q="想用多个内参（GAPDH + ACTB）？">
              当前版本只支持 1 个内参基因。想用多内参的话：在 Excel 里先用公式算出
              多个内参基因的<strong>几何均值</strong>，作为一个新的单一参考列导入即可。
            </Faq>
            <Faq q="想看 Control vs Treat 的 Fold Change？">
              直接选「相对对照（ΔΔCt）」方法，对照组选 Control 组即可。
              算出的 Normalized Expression 就是相对对照组的倍数变化（对照组 ≈ 1）。
            </Faq>
            <Faq q="图的颜色 / 样式想改？">
              直接在 Excel 里双击图表修改——图表是 Excel 原生对象，所有样式都能二次编辑。
              也可以在「柱状图颜色」里选一个新色，选择会自动保存，下次计算自动用新颜色。
            </Faq>
          </Section>

          <div className="tutorial__footer">
            <button className="btn btn-primary tutorial__done" onClick={onClose}>
              我看完了，开始使用 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
 * TIFF 转 JPG 使用教程
 * ================================================================ */

export function TiffTutorial({ onClose }: { onClose: () => void }) {
  const sections = [
    { id: "intro", title: "📖 简介" },
    { id: "source", title: "① 选文件夹" },
    { id: "options", title: "② 转换选项" },
    { id: "convert", title: "③ 开始转换" },
    { id: "result", title: "④ 输出结果" },
    { id: "faq", title: "❓ 常见问题" },
  ];

  const { activeId, scrollRef, scrollTo } = useTutorialScroll(sections);

  return (
    <div className="tutorial">
      <div className="tutorial__header">
        <div>
          <div className="tutorial__title">TIFF 转 JPG 使用教程</div>
          <div className="tutorial__subtitle">批量转换 + 文件名水印 · 3 步走完</div>
        </div>
        <button className="tutorial__close" onClick={onClose} aria-label="关闭教程">
          <IconX size={16} stroke={1.75} />
        </button>
      </div>

      <div className="tutorial__body">
        <aside className="tutorial__nav">
          <div className="tutorial__nav-title">目录</div>
          <ul>
            {sections.map((s) => (
              <li key={s.id}>
                <button
                  className={`tutorial__nav-item ${activeId === s.id ? "active" : ""}`}
                  onClick={() => scrollTo(s.id)}
                >
                  <IconChevronRight size={12} stroke={1.75} />
                  <span>{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="tutorial__nav-tip">💡 点目录可快速跳转</div>
        </aside>

        <div className="tutorial__content" ref={scrollRef}>
          {/* ── 简介 ── */}
          <Section id="intro" title="📖 简介" subtitle="这工具能干什么">
            <p>
              Mynx TIFF 转 JPG 模块可以<strong>批量</strong>把一个文件夹里所有 <code>.tif</code> / <code>.tiff</code>
              图片转换为 <code>.jpg</code> 格式，并可选在图片左上角添加<strong>文件名水印</strong>。
            </p>
            <p>典型流程（几秒到几十秒，取决于文件数量）：</p>
            <ol>
              <li><strong>选文件夹</strong> — 含 TIFF 文件的目录</li>
              <li><strong>设选项</strong> — 水印文字样式、输出质量</li>
              <li><strong>开始转换</strong> — 实时进度，自动输出到子文件夹</li>
            </ol>
            <Callout type="info">
              转换在本地完成，不依赖任何在线服务。Windows 使用 PowerShell + .NET System.Drawing，
              macOS / Linux 使用 sips / ImageMagick。
            </Callout>
          </Section>

          {/* ── ① 选文件夹 ── */}
          <Section id="source" title="① 选文件夹" subtitle="选含 TIFF 文件的目录">
            <p>两种方式：</p>
            <ul>
              <li>点 <code>选择文件夹</code> 按钮，弹出目录选择框</li>
              <li>把文件夹直接拖到卡片虚线框里</li>
            </ul>
            <p>
              选好后卡片会显示 <strong>文件夹名 + 完整路径</strong>。
              支持的输入格式：<code>.tif</code> 和 <code>.tiff</code>（不区分大小写）。
            </p>
            <Callout type="tip">
              只扫描所选文件夹的<strong>第一层</strong>，不会递归子文件夹。
              如果 TIFF 文件分散在子目录，请逐个文件夹转换。
            </Callout>
          </Section>

          {/* ── ② 转换选项 ── */}
          <Section id="options" title="② 转换选项" subtitle="配置水印和输出质量">
            <p>首先选择是否<strong>添加文件名水印</strong>：</p>
            <ul>
              <li><strong>是</strong> — 在每张 JPG 左上角添加原 TIFF 文件名（不含扩展名）</li>
              <li><strong>否</strong> — 纯转换，不加水印</li>
            </ul>

            <p>选「是」后可以配置水印样式：</p>
            <div className="tutorial__table-wrap">
              <table className="tutorial__table">
                <thead>
                  <tr><th>选项</th><th>说明</th></tr>
                </thead>
                <tbody>
                  <tr><td><strong>字体</strong></td><td>Arial / Calibri / Times New Roman / 微软雅黑 / 黑体 / 宋体</td></tr>
                  <tr><td><strong>字号</strong></td><td>36–120 px，默认 72</td></tr>
                  <tr><td><strong>粗体 / 斜体</strong></td><td>文字样式开关</td></tr>
                  <tr><td><strong>左边距 / 上边距</strong></td><td>水印距图片左上角的位置，0–200 px</td></tr>
                  <tr><td><strong>内边距 X / Y</strong></td><td>文字背景框的留白，0–50 px</td></tr>
                  <tr><td><strong>背景透明度</strong></td><td>水印背景色（深灰）的不透明度：不透明 / 半透明 / 较透明 / 全透明</td></tr>
                </tbody>
              </table>
            </div>

            <p>无论是否加水印，都可以设置 <strong>JPG 质量</strong>（80 / 85 / 90 / 95 / 98），默认 95。</p>
            <Callout type="warn">
              ⚠️ macOS / Linux 上水印功能需要 ImageMagick（<code>magick</code> 或 <code>convert</code> 命令）。
              如果系统未安装，转换仍会完成，但<strong>水印会被跳过</strong>，转换后会提示。
              安装方式：<code>brew install imagemagick</code>。
            </Callout>
          </Section>

          {/* ── ③ 开始转换 ── */}
          <Section id="convert" title="③ 开始转换" subtitle="点「开始转换」">
            <p>
              点 <code>开始转换</code> 后，界面会显示遮罩 + 进度条，实时显示
              <code>正在转换 (当前/总数)</code>。
            </p>
            <p>转换过程：</p>
            <ol>
              <li>在所选文件夹下创建子目录 <code>JPG_output_年月日_时分秒</code></li>
              <li>逐个读取 TIFF → 转为 JPG → 写入子目录</li>
              <li>如有水印，在每个 JPG 上绘制文件名文字 + 半透明背景框</li>
              <li>完成后弹出 Toast 提示成功 / 失败数量</li>
            </ol>
            <Callout type="info">
              文件名与原 TIFF 相同，仅扩展名改为 <code>.jpg</code>。
              例如 <code>sample.tif</code> → <code>sample.jpg</code>。
            </Callout>
          </Section>

          {/* ── ④ 输出结果 ── */}
          <Section id="result" title="④ 输出结果" subtitle="JPG 在子文件夹里">
            <p>
              所有 JPG 文件输出到源文件夹下的 <code>JPG_output_</code> 子目录中，
              目录名带时间戳，方便多次转换不覆盖。
            </p>
            <Callout type="tip">
              转换完成后可以直接打开 <code>JPG_output_</code> 文件夹查看结果。
              原始 TIFF 文件不会被修改或删除。
            </Callout>
          </Section>

          {/* ── FAQ ── */}
          <Section id="faq" title="❓ 常见问题" subtitle="对号入座，看怎么办">
            <Faq q="转换提示「未找到 TIFF 文件」？">
              检查所选文件夹的第一层目录里有没有 <code>.tif</code> 或 <code>.tiff</code> 文件。
              工具不扫描子文件夹，如果文件在子目录里，请直接选那个子目录。
            </Faq>
            <Faq q="水印没加上？">
              Windows 上不需要额外依赖。macOS / Linux 上需要 ImageMagick。
              如果没装，转换会正常完成但跳过水印，结束后会有提示。
              安装：<code>brew install imagemagick</code>（macOS）或
              <code>sudo apt install imagemagick</code>（Linux）。
            </Faq>
            <Faq q="部分文件转换失败？">
              可能是 TIFF 文件损坏或格式特殊（如多页 TIFF）。
              查看 Toast 提示的「N 个失败」数量，失败的文件不会生成 JPG。
              可以尝试用其他工具单独打开该 TIFF 确认是否正常。
            </Faq>
            <Faq q="JPG 质量怎么选？">
              <strong>95</strong>（默认）适合大多数场景，文件体积小且画质好。
              需要更高画质选 98；需要更小体积选 85 或 80。
            </Faq>
            <Faq q="边距 / 内边距填了无效值？">
              边距范围 0–200，内边距范围 0–50。如果手动输入超出范围的值或留空，
              会自动截断到合法范围或回退到默认值，不会导致转换失败。
            </Faq>
          </Section>

          <div className="tutorial__footer">
            <button className="btn btn-primary tutorial__done" onClick={onClose}>
              我看完了，开始使用 →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * chart-xml.ts — Generate chart XML strictly matching VBA reference (2.caculate.txt).
 *
 * Key VBA chart settings:
 *   ChartType = xlColumnClustered (51)
 *   PlotBy = xlColumns
 *   HasLegend = False
 *   HasTitle = True, .ChartTitle.Text = geneName, .ChartTitle.Font.Italic = True
 *   PlotArea.Format.Line.Visible = msoFalse (no border)
 *   ChartArea.Format.Line.Visible = msoFalse (no border)
 *   X axis: TickLabels.Orientation = 45, MajorTickMark = xlTickMarkNone, black, font 8pt
 *   Y axis: HasTitle = True "Normalize to {refGene}", HasMajorGridlines = False,
 *           Crosses = xlCustom / CrossesAt = .MinimumScale
 *   Series: Fill = user color (default #4F81BD), Line = black
 *   Error bars: Direction=xlY, Include=xlBoth, Type=xlCustom, Line = black
 */
import JSZip from 'jszip';

// ── Namespaces ──────────────────────────────────────────────────────────────
const NS = {
  CHART: 'http://schemas.openxmlformats.org/drawingml/2006/chart',
  DRAWING: 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing',
  A: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  R: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  RELS: 'http://schemas.openxmlformats.org/package/2006/relationships',
  CHART_REL: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart',
  DRAWING_REL: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing',
};

const CHART_CT = 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml';
const DRAWING_CT = 'application/vnd.openxmlformats-officedocument.drawing+xml';

// ── Types ───────────────────────────────────────────────────────────────────
interface DataPoint {
  name: string;
  avg: number;
  stdev: number;
}

export interface ChartSheetData {
  sheetIndex: number;
  geneName: string;
  refGene: string;
  dataPoints: DataPoint[];
  /** 1-based row number of the Group_Name header row in the sheet */
  groupHeaderRow: number;
}

interface ChartInjectionOptions {
  sheets: ChartSheetData[];
  repeatCount: number;
  colorRGB?: number;
  /** 计算方法，决定 Y 轴标题措辞。默认 'ref-normalized'。 */
  method?: 'ref-normalized' | 'control-relative';
  /** method 为 'control-relative' 时的对照组名，用于 Y 轴标题。 */
  controlGroup?: string;
}

/**
 * Build the rich-text runs for the Y-axis title.
 *  - ref-normalized:   "Normalize to <i>{refGene}</i>"
 *  - control-relative: "Normalize to {controlGroup} (<i>{refGene}</i>)"
 * Gene names are rendered italic (i="1"); group names are not.
 */
function buildValAxisTitleRuns(
  refGene: string,
  method: 'ref-normalized' | 'control-relative',
  controlGroup: string
): string {
  const run = (text: string, italic: boolean) =>
    `<a:r>
      <a:rPr lang="en-US" sz="900" i="${italic ? 1 : 0}">
        <a:latin typeface="Calibri"/>
      </a:rPr>
      <a:t>${esc(text)}</a:t>
    </a:r>`;

  if (method === 'control-relative') {
    return (
      run('Normalize to ' + controlGroup + ' (', false) +
      run(refGene, true) +
      run(')', false)
    );
  }
  return run('Normalize to ', false) + run(refGene, true);
}

// ── XML Helpers ─────────────────────────────────────────────────────────────
function esc(s: string | number): string {
  const str = String(s);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeGeneName(name: string): string {
  return name.length > 31 ? name.substring(0, 31) : name;
}

// ── Chart XML Builder ───────────────────────────────────────────────────────
function buildChartXml(
  sheet: ChartSheetData,
  chartTableStart: number,
  chartTableEnd: number,
  colorRGB: number,
  repeatCount: number,
  method: 'ref-normalized' | 'control-relative' = 'ref-normalized',
  controlGroup = ''
): string {
  const data = sheet.dataPoints;
  const n = data.length;
  const hasErrorBars = repeatCount > 1;
  const gene = esc(safeGeneName(sheet.geneName));
  const sheetName = esc(sheet.geneName);
  const colA = `'${sheetName}'!$A$${chartTableStart}:$A$${chartTableEnd}`;
  const colB = `'${sheetName}'!$B$${chartTableStart}:$B$${chartTableEnd}`;
  const colC = hasErrorBars
    ? `'${sheetName}'!$C$${chartTableStart}:$C$${chartTableEnd}`
    : '';
  const colorHex = colorRGB.toString(16).padStart(6, '0').toUpperCase();

  // Series: solid fill + black outline
  const serFill = `<c:spPr>
      <a:solidFill><a:srgbClr val="${colorHex}"/></a:solidFill>
      <a:ln><a:solidFill><a:srgbClr val="000000"/></a:solidFill></a:ln>
    </c:spPr>`;

  // Category (X axis): Group names — these are strings, use strRef
  const catXml = `<c:cat>
      <c:strRef>
        <c:f>${colA}</c:f>
      </c:strRef>
    </c:cat>`;

  // Value (Y axis): Average values
  const valXml = `<c:val>
      <c:numRef>
        <c:f>${colB}</c:f>
        <c:numCache>
          <c:formatCode>General</c:formatCode>
          <c:ptCount val="${n}"/>
          ${data.map((dp, i) => `<c:pt idx="${i}"><c:v>${dp.avg}</c:v></c:pt>`).join('')}
        </c:numCache>
      </c:numRef>
    </c:val>`;

  // Error bars — VBA: Include:=xlBoth (both directions)
  // But user wants only upper half (plus only), so use errBarType="plus"
  let errBarsXml = '';
  if (hasErrorBars) {
    errBarsXml = `<c:errBars>
      <c:errDir val="y"/>
      <c:errBarType val="plus"/>
      <c:errValType val="cust"/>
      <c:noEndCap val="0"/>
      <c:spPr>
        <a:ln>
          <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
        </a:ln>
      </c:spPr>
      <c:plus>
        <c:numRef>
          <c:f>${colC}</c:f>
          <c:numCache>
            <c:formatCode>General</c:formatCode>
            <c:ptCount val="${n}"/>
            ${data.map((dp, i) => `<c:pt idx="${i}"><c:v>${dp.stdev}</c:v></c:pt>`).join('')}
          </c:numCache>
        </c:numRef>
      </c:plus>
      <c:minus>
        <c:numRef>
          <c:f>${colC}</c:f>
          <c:numCache>
            <c:formatCode>General</c:formatCode>
            <c:ptCount val="${n}"/>
            ${data.map((dp, i) => `<c:pt idx="${i}"><c:v>${dp.stdev}</c:v></c:pt>`).join('')}
          </c:numCache>
        </c:numRef>
      </c:minus>
    </c:errBars>`;
  }

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace
  xmlns:c="${NS.CHART}"
  xmlns:a="${NS.A}"
  xmlns:r="${NS.R}">
  <c:chart>
    <c:title>
      <c:tx>
        <c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:r>
              <a:rPr lang="en-US" sz="1500" b="1" i="1">
                <a:latin typeface="Calibri"/>
              </a:rPr>
              <a:t>${gene}</a:t>
            </a:r>
          </a:p>
        </c:rich>
      </c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      <c:barChart>
        <c:barDir val="col"/>
        <c:grouping val="clustered"/>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          ${serFill}
          ${catXml}
          ${valXml}
          ${errBarsXml}
        </c:ser>
        <c:axId val="1"/>
        <c:axId val="2"/>
      </c:barChart>
      <c:catAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:crossAx val="2"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
        <c:majorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:txPr>
          <a:bodyPr rot="-2700000"/>
          <a:lstStyle/>
          <a:p>
            <a:pPr>
              <a:defRPr sz="800">
                <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
                <a:latin typeface="Calibri"/>
              </a:defRPr>
            </a:pPr>
            <a:endParaRPr/>
          </a:p>
        </c:txPr>
      </c:catAx>
      <c:valAx>
        <c:axId val="2"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:crossAx val="1"/>
        <c:crosses val="min"/>
        <c:crossBetween val="between"/>
        <c:title>
        <c:tx>
          <c:rich>
            <a:bodyPr/>
            <a:lstStyle/>
            <a:p>
              ${buildValAxisTitleRuns(sheet.refGene, method, controlGroup)}
              </a:p>
            </c:rich>
          </c:tx>
          <c:overlay val="0"/>
        </c:title>
        <c:txPr>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p>
            <a:pPr>
              <a:defRPr sz="800">
                <a:solidFill><a:srgbClr val="000000"/></a:solidFill>
                <a:latin typeface="Calibri"/>
              </a:defRPr>
            </a:pPr>
            <a:endParaRPr/>
          </a:p>
        </c:txPr>
      </c:valAx>
    </c:plotArea>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

// ── Drawing XML Builder ─────────────────────────────────────────────────────
function buildDrawingXml(chartRId: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr
  xmlns:xdr="${NS.DRAWING}"
  xmlns:a="${NS.A}"
  xmlns:r="${NS.R}"
  xmlns:c="${NS.CHART}">
  <xdr:twoCellAnchor editAs="oneCell">
    <xdr:from>
      <xdr:col>0</xdr:col>
      <xdr:colOff>95250</xdr:colOff>
      <xdr:row>0</xdr:row>
      <xdr:rowOff>190500</xdr:rowOff>
    </xdr:from>
    <xdr:to>
      <xdr:col>6</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>14</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Chart 1"/>
        <xdr:cNvGraphicFramePr>
          <a:graphicFrameLocks noGrp="1"/>
        </xdr:cNvGraphicFramePr>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm>
        <a:off x="95250" y="190500"/>
        <a:ext cx="3810000" cy="2857500"/>
      </xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="${NS.CHART}">
          <c:chart r:id="${chartRId}"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

// ── Relationships Helpers ────────────────────────────────────────────────────
function buildRelsXml(rels: Array<{ Id: string; Type: string; Target: string }>): string {
  const items = rels.map(
    (r) => `    <Relationship Id="${r.Id}" Type="${r.Type}" Target="${r.Target}"/>`
  );
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS.RELS}">
${items.join('\n')}
</Relationships>`;
}

function buildChartRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${NS.RELS}">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/package" Target="../theme/theme1.xml"/>
</Relationships>`;
}

function chartContentTypeOverride(partName: string): string {
  return `<Override PartName="${partName}" ContentType="${CHART_CT}"/>`;
}

function drawingContentTypeOverride(partName: string): string {
  return `<Override PartName="${partName}" ContentType="${DRAWING_CT}"/>`;
}

// ── Sheet Name → Sheet ID Lookup ───────────────────────────────────────────
async function buildSheetNameMap(zip: JSZip): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const wbXml = await zip.file('xl/workbook.xml')?.async('string');
  if (!wbXml) return map;

  const sheetRe = /<sheet[^>]*?\bname\s*=\s*"([^"]*)"[^>]*?\bsheetId\s*=\s*"(\d+)"|<sheet[^>]*?\bsheetId\s*=\s*"(\d+)"[^>]*?\bname\s*=\s*"([^"]*)"/gi;
  let m: RegExpExecArray | null;
  while ((m = sheetRe.exec(wbXml)) !== null) {
    const name = m[1] || m[4];
    const sheetId = parseInt(m[2] || m[3], 10);
    if (name && !isNaN(sheetId)) {
      map.set(name, sheetId);
    }
  }
  return map;
}

function maxRId(relsXml: string): number {
  const re = /Id="rId(\d+)"/g;
  let max = 0;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(relsXml)) !== null) {
    const n = parseInt(mm[1], 10);
    if (n > max) max = n;
  }
  return max;
}

// ── Main Injection Function ────────────────────────────────────────────────
export async function injectChartsIntoWorkbook(
  buffer: Uint8Array,
  options: ChartInjectionOptions
): Promise<Uint8Array> {
  const { sheets, repeatCount, colorRGB = 0x4f81bd, method = 'ref-normalized', controlGroup = '' } = options;

  if (sheets.length === 0) return buffer;

  const zip = await JSZip.loadAsync(buffer);
  const sheetNameMap = await buildSheetNameMap(zip);

  let chartIndex = 0;

  for (const sheet of sheets) {
    chartIndex++;

    const sheetId = sheetNameMap.get(sheet.geneName);
    if (!sheetId) continue;

    const sheetPath = `xl/worksheets/sheet${sheetId}.xml`;
    const sheetRelsPath = `xl/worksheets/_rels/sheet${sheetId}.xml.rels`;

    // Chart table rows — use actual Group_Name header position
    // data starts at groupHeaderRow + 1, ends at groupHeaderRow + dataPoints.length
    const chartTableStart = sheet.groupHeaderRow + 1;
    const chartTableEnd = sheet.groupHeaderRow + sheet.dataPoints.length;

    const chartXml = buildChartXml(sheet, chartTableStart, chartTableEnd, colorRGB, repeatCount, method, controlGroup);
    zip.file(`xl/charts/chart${chartIndex}.xml`, chartXml);

    const chartRelsXml = buildChartRelsXml();
    zip.file(`xl/charts/_rels/chart${chartIndex}.xml.rels`, chartRelsXml);

    const drawingRId = `rId${chartIndex}`;
    const drawingXml = buildDrawingXml(drawingRId);
    zip.file(`xl/drawings/drawing${chartIndex}.xml`, drawingXml);

    const drawingRelsXml = buildRelsXml([
      { Id: drawingRId, Type: NS.CHART_REL, Target: `../charts/chart${chartIndex}.xml` },
    ]);
    zip.file(`xl/drawings/_rels/drawing${chartIndex}.xml.rels`, drawingRelsXml);

    const sheetXmlEntry = zip.file(sheetPath);
    if (!sheetXmlEntry) continue;
    const sheetXml = await sheetXmlEntry.async('string');

    let updatedSheetXml = sheetXml;
    if (!sheetXml.includes('<drawing')) {
      const drawingRelId = `rId${chartIndex + 100}`;
      updatedSheetXml = sheetXml.replace(
        '</worksheet>',
        `  <drawing r:id="${drawingRelId}"/>\n</worksheet>`
      );

      const sheetRelsEntry = zip.file(sheetRelsPath);
      if (sheetRelsEntry) {
        let relsXml = await sheetRelsEntry.async('string');
        if (!relsXml.includes(NS.DRAWING_REL)) {
          const nextRId = maxRId(relsXml) + 1;
          const newRId = `rId${nextRId}`;
          relsXml = relsXml.replace(
            '</Relationships>',
            `  <Relationship Id="${newRId}" Type="${NS.DRAWING_REL}" Target="../drawings/drawing${chartIndex}.xml"/>\n</Relationships>`
          );
          zip.file(sheetRelsPath, relsXml);
        }
      } else {
        const relsXml = buildRelsXml([
          { Id: drawingRelId, Type: NS.DRAWING_REL, Target: `../drawings/drawing${chartIndex}.xml` },
        ]);
        zip.file(sheetRelsPath, relsXml);
      }
    }

    zip.file(sheetPath, updatedSheetXml);
  }

  // Update [Content_Types].xml
  const ctEntry = zip.file('[Content_Types].xml');
  if (ctEntry) {
    let ctXml = await ctEntry.async('string');
    for (let i = 1; i <= chartIndex; i++) {
      const chartOverride = chartContentTypeOverride(`/xl/charts/chart${i}.xml`);
      const drawingOverride = drawingContentTypeOverride(`/xl/drawings/drawing${i}.xml`);
      if (!ctXml.includes(`chart${i}.xml`)) {
        ctXml = ctXml.replace('</Types>', `  ${chartOverride}\n  ${drawingOverride}\n</Types>`);
      }
    }
    zip.file('[Content_Types].xml', ctXml);
  }

  const newBuffer = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return newBuffer;
}

import { useState, useMemo, useEffect } from 'react';
import { IconCircleCheckFilled, IconCircleXFilled } from '@tabler/icons-react';
import type ExcelJS from 'exceljs';
import { calculateQpcr, CALC_METHOD_LABELS, type CalcMethod } from '@/lib/qpcr-calculate';
import { detectTransformedGenes, detectTransformedGroups } from '@/lib/qpcr-transform';
import { loadChartColor, saveChartColor } from '@/lib/config';
import { DEFAULT_CHART_COLOR } from '@/lib/chart-gen';

interface CalculateProps {
  workbook: ExcelJS.Workbook | null;
  geneNames: string[];
  onComplete: (
    repeatCount: number,
    chartColor: string,
    methodOptions: { method: CalcMethod; controlGroup?: string }
  ) => void;
  onProgress?: (current: number, total: number, text?: string) => void;
}

type Status = 'ready' | 'processing' | 'success' | 'error';

export default function Calculate({ workbook, geneNames, onComplete, onProgress }: CalculateProps) {
  const [repeatCount, setRepeatCount] = useState(2);
  const [method, setMethod] = useState<CalcMethod>('ref-normalized');
  const [controlGroup, setControlGroup] = useState('');
  const [refGene, setRefGene] = useState('');
  const [chartColor, setChartColor] = useState(DEFAULT_CHART_COLOR);
  const [status, setStatus] = useState<Status>('ready');
  const [errorMsg, setErrorMsg] = useState('');
  const [resultMsg, setResultMsg] = useState('');

  // Restore saved chart color on mount
  useEffect(() => {
    let cancelled = false;
    loadChartColor().then((c) => {
      if (!cancelled) setChartColor(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear execution feedback when the selected workbook changes or is cleared.
  useEffect(() => {
    // Reset feedback when a different workbook is selected.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('ready');
    setErrorMsg('');
    setResultMsg('');
  }, [workbook]);

  // Auto-detect gene names from workbook's Transformed Data sheet
  // if not already provided (e.g. file was already transformed)
  const effectiveGeneNames = useMemo(() => {
    if (geneNames.length > 0) return geneNames;
    if (!workbook) return [];
    return detectTransformedGenes(workbook);
  }, [geneNames, workbook]);

  // Distinct group names for the control-group selector (相对对照 method).
  // Depends on geneNames as well: the workbook is mutated in place during
  // transform (same object reference), so a workbook-only dependency would
  // never re-run. geneNames changes when the parent finishes transforming,
  // which is the signal that the "Transformed Data" sheet now exists.
  const groupNames = useMemo(() => {
    if (!workbook) return [];
    return detectTransformedGroups(workbook);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workbook, geneNames]);

  const selectedRefGene = refGene || effectiveGeneNames[0] || '';
  const selectedControlGroup = controlGroup || groupNames[0] || '';
  const needsControl = method === 'control-relative';

  // Button is enabled whenever a workbook is loaded and a ref gene is selected.
  // For 相对对照, a control group must also be available.
  const canExecute =
    workbook !== null &&
    selectedRefGene !== '' &&
    status !== 'processing' &&
    (!needsControl || selectedControlGroup !== '');

  async function handleExecute() {
    if (!workbook || !selectedRefGene) return;
    if (needsControl && !selectedControlGroup) return;
    try {
      setStatus('processing');
      setErrorMsg('');
      onProgress?.(0, 2, '正在计算相对表达量...');

      // Yield two animation frames so the browser actually paints the
      // "processing" overlay BEFORE we start the synchronous, CPU-heavy
      // ExcelJS row iteration below. Without this, the overlay never
      // appears (or flashes for a single frame) because the sync work
      // blocks the main thread in the same microtask. calculateQpcr is
      // intentionally synchronous (it mutates the shared workbook in
      // place), so we cannot `await` inside it — but we CAN yield first.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );

      calculateQpcr(workbook, repeatCount, selectedRefGene, {
        method,
        controlGroup: needsControl ? selectedControlGroup : undefined,
      });
      onProgress?.(2, 2, '计算完成');
      setStatus('success');
      setResultMsg(`计算完成（${CALC_METHOD_LABELS[method]}），${effectiveGeneNames.length} 个基因`);
      onComplete(repeatCount, chartColor, {
        method,
        controlGroup: needsControl ? selectedControlGroup : undefined,
      });
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : '计算出错');
    }
  }

  if (!workbook) {
    return (
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0' }}>
        请先选择数据文件
      </div>
    );
  }

  const hasGenes = effectiveGeneNames.length > 0;

  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label>计算方法</label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as CalcMethod)}
            disabled={status === 'processing'}
          >
            <option value="ref-normalized">{CALC_METHOD_LABELS['ref-normalized']}（默认）</option>
            <option value="control-relative">{CALC_METHOD_LABELS['control-relative']}（ΔΔCt）</option>
          </select>
        </div>
        {needsControl && (
          <div className="form-group">
            <label>对照组</label>
            <select
              value={selectedControlGroup}
              onChange={(e) => setControlGroup(e.target.value)}
              disabled={status === 'processing' || groupNames.length === 0}
            >
              {groupNames.length > 0 ? (
                groupNames.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))
              ) : (
                <option value="">请先转换数据</option>
              )}
            </select>
          </div>
        )}
      </div>

      <div className="form-row form-row--three">
        <div className="form-group">
          <label>重复次数</label>
          <select value={repeatCount} onChange={(e) => setRepeatCount(Number(e.target.value))} disabled={status === 'processing'}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>参考基因</label>
          <select
            value={selectedRefGene}
            onChange={(e) => setRefGene(e.target.value)}
            disabled={status === 'processing' || !hasGenes}
          >
            {hasGenes ? (
              effectiveGeneNames.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))
            ) : (
              <option value="">请先转换数据</option>
            )}
          </select>
        </div>
        <div className="form-group">
          <label>柱状图颜色</label>
          <div className="color-picker-row">
            <input
              type="color"
              value={chartColor}
              disabled={status === 'processing'}
              onChange={(e) => {
                const next = e.target.value;
                setChartColor(next);
                // Persist on every change so the user's choice survives reloads
                saveChartColor(next).catch(() => undefined);
              }}
              aria-label="柱状图颜色"
            />
            <span className="color-hex">{chartColor.toUpperCase()}</span>
          </div>
        </div>
      </div>

      <button
        className="btn btn-primary btn-full"
        onClick={handleExecute}
        disabled={!canExecute}
      >
        {status === 'processing' ? '正在计算...' : '执行计算'}
      </button>

      {status === 'success' && resultMsg && (
        <div className="result-success">
          <IconCircleCheckFilled size={14} stroke={1.75} />
          <div>{resultMsg}</div>
        </div>
      )}

      {status === 'error' && (
        <div className="result-success" style={{ color: '#ff453a', background: 'rgba(255,69,58,0.08)' }}>
          <IconCircleXFilled size={14} stroke={1.75} />
          <div>{errorMsg}</div>
        </div>
      )}
    </>
  );
}

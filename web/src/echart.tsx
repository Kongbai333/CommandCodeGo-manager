// ECharts 实际载体:按需注册(bar/line + grid/legend/tooltip + canvas),
// 经 ui.tsx 的 <EChart> 以 React.lazy 异步加载 —— 首屏主包不含 echarts,
// 图表在数据就绪前本就不可见,异步换取更快的首帧。
import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { ChartOption } from './ui';

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

export default function EChartReal({ option, className = 'h-64' }: { option: ChartOption; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const c = echarts.init(ref.current);
    chart.current = c;
    const ro = new ResizeObserver(() => c.resize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); c.dispose(); chart.current = null; };
  }, []);
  useEffect(() => { chart.current?.setOption(option, true); }, [option]);
  return <div ref={ref} className={className} />;
}

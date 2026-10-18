import { monthLabel } from '../../core/format/datetime';
import { CategoryRow } from '../models/api.models';
import { ChartOption, ChartPalette } from './chart.component';

const FALLBACK = ['#7c8cff', '#34d399', '#fbbf24', '#fb7185', '#38bdf8', '#a78bfa', '#f97316', '#2dd4bf', '#f472b6', '#94a3b8'];

type Fmt = (minor: number) => string;
export const colorFor = (row: Pick<CategoryRow, 'color' | 'categoryId'>, i: number, useColors = true) =>
  (useColors && row.color) || FALLBACK[i % FALLBACK.length];

/** Grouped income/expense bars per month with a net line. Values are minor units; axis shows major units. */
export function trendOption(
  points: Array<{ month: string; income: number; expense: number; net: number }>,
  money: Fmt, compact: Fmt, showNet = true,
): (p: ChartPalette) => ChartOption {
  return (p) => ({
    animationDuration: 500,
    grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: p.muted }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
    tooltip: {
      trigger: 'axis', backgroundColor: p.surface, borderColor: p.line, textStyle: { color: p.text },
      axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(124,140,255,0.06)' } },
      valueFormatter: (v: number) => money(v),
    },
    xAxis: {
      type: 'category', data: points.map((x) => monthLabel(x.month, true)),
      axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false }, axisLabel: { color: p.muted },
    },
    yAxis: {
      type: 'value', splitLine: { lineStyle: { color: p.line, opacity: 0.6 } },
      axisLabel: { color: p.muted, formatter: (v: number) => compact(v) },
    },
    series: [
      { name: 'Income', type: 'bar', data: points.map((x) => x.income), itemStyle: { color: p.income, borderRadius: [5, 5, 0, 0] }, barMaxWidth: 22 },
      { name: 'Expenses', type: 'bar', data: points.map((x) => x.expense), itemStyle: { color: p.expense, borderRadius: [5, 5, 0, 0] }, barMaxWidth: 22 },
      ...(showNet
        ? [{ name: 'Net', type: 'line', data: points.map((x) => x.net), smooth: true, symbol: 'circle', symbolSize: 6, lineStyle: { width: 2, color: p.balance }, itemStyle: { color: p.balance } }]
        : []),
    ],
  });
}

export function lineOption(
  labels: string[], values: number[], name: string, money: Fmt, compact: Fmt,
): (p: ChartPalette) => ChartOption {
  return (p) => ({
    animationDuration: 500,
    grid: { left: 8, right: 12, top: 16, bottom: 4, containLabel: true },
    tooltip: { trigger: 'axis', backgroundColor: p.surface, borderColor: p.line, textStyle: { color: p.text }, valueFormatter: (v: number) => money(v) },
    xAxis: { type: 'category', data: labels, boundaryGap: false, axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false }, axisLabel: { color: p.muted } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: p.line, opacity: 0.6 } }, axisLabel: { color: p.muted, formatter: (v: number) => compact(v) } },
    series: [{
      name, type: 'line', data: values, smooth: true, symbol: 'circle', symbolSize: 6,
      lineStyle: { width: 3, color: p.balance }, itemStyle: { color: p.balance },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: p.balance + '55' }, { offset: 1, color: p.balance + '00' }] } },
    }],
  });
}

export function donutOption(rows: CategoryRow[], money: Fmt, useColors = true): (p: ChartPalette) => ChartOption {
  return (p) => ({
    animationDuration: 500,
    tooltip: { trigger: 'item', backgroundColor: p.surface, borderColor: p.line, textStyle: { color: p.text }, valueFormatter: (v: number) => money(v) },
    series: [{
      type: 'pie', radius: ['58%', '84%'], avoidLabelOverlap: true, minAngle: 3,
      label: { show: false }, labelLine: { show: false },
      itemStyle: { borderColor: p.surface, borderWidth: 2, borderRadius: 4 },
      data: rows.map((r, i) => ({ name: r.name, value: r.total, itemStyle: { color: colorFor(r, i, useColors) } })),
    }],
  });
}

export function compareOption(
  cats: Array<{ name: string; current: number; previous: number }>, labels: [string, string], money: Fmt, compact: Fmt,
): (p: ChartPalette) => ChartOption {
  return (p) => ({
    animationDuration: 500,
    grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
    legend: { top: 0, right: 0, textStyle: { color: p.muted }, icon: 'roundRect', itemWidth: 10, itemHeight: 10 },
    tooltip: { trigger: 'axis', backgroundColor: p.surface, borderColor: p.line, textStyle: { color: p.text }, valueFormatter: (v: number) => money(v) },
    xAxis: { type: 'category', data: cats.map((c) => c.name), axisLabel: { color: p.muted, interval: 0, rotate: cats.length > 5 ? 30 : 0 }, axisLine: { lineStyle: { color: p.line } }, axisTick: { show: false } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: p.line, opacity: 0.6 } }, axisLabel: { color: p.muted, formatter: (v: number) => compact(v) } },
    series: [
      { name: labels[1], type: 'bar', data: cats.map((c) => c.previous), itemStyle: { color: p.line, borderRadius: [5, 5, 0, 0] }, barMaxWidth: 20 },
      { name: labels[0], type: 'bar', data: cats.map((c) => c.current), itemStyle: { color: p.expense, borderRadius: [5, 5, 0, 0] }, barMaxWidth: 20 },
    ],
  });
}

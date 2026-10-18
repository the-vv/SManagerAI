import {
  ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, effect, inject, input, viewChild,
} from '@angular/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { SettingsStore } from '../../core/services/settings.store';

echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

export type ChartOption = echarts.EChartsCoreOption;

export interface ChartPalette {
  text: string; muted: string; line: string; surface: string; income: string; expense: string; balance: string; accent: string;
}

export function readPalette(): ChartPalette {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string) => cs.getPropertyValue(n).trim();
  return {
    text: v('--text'), muted: v('--text-muted'), line: v('--border'), surface: v('--surface-2'),
    income: v('--income'), expense: v('--expense'), balance: v('--balance'), accent: v('--accent'),
  };
}

/** Thin, theme-aware wrapper around Apache ECharts. Parent passes an option *factory* so colours follow the theme. */
@Component({
  selector: 'sm-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="w-full" [style.height]="height()" role="img" [attr.aria-label]="label()"></div>`,
  host: { class: 'block' },
})
export class ChartComponent implements OnDestroy {
  readonly build = input.required<(p: ChartPalette) => ChartOption>();
  readonly height = input('260px');
  readonly label = input('Chart');

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly settings = inject(SettingsStore);
  private chart?: echarts.ECharts;
  private ro?: ResizeObserver;
  private ready = false;

  constructor() {
    afterNextRender(() => {
      this.chart = echarts.init(this.host().nativeElement, undefined, { renderer: 'canvas' });
      this.ro = new ResizeObserver(() => this.chart?.resize());
      this.ro.observe(this.host().nativeElement);
      this.ready = true;
      this.render();
    });
    effect(() => {
      this.build();
      this.settings.theme();
      this.settings.settings();
      if (this.ready) queueMicrotask(() => this.render());
    });
  }

  private render(): void {
    this.chart?.setOption({ backgroundColor: 'transparent', ...this.build()(readPalette()) }, true);
  }

  ngOnDestroy(): void {
    this.ro?.disconnect();
    this.chart?.dispose();
  }
}

import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';

@Component({
  selector: 'sm-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- title + actions share one row on every width; the subtitle sits underneath -->
    <header class="mb-5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
      <h1 class="m-0 min-w-0 truncate text-2xl font-semibold tracking-tight">{{ title() }}</h1>
      <div class="flex items-center justify-end gap-2 empty:hidden"><ng-content /></div>
      @if (subtitle()) { <p class="m-0 col-span-2 text-sm text-muted">{{ subtitle() }}</p> }
    </header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}

@Component({
  selector: 'sm-empty-state',
  imports: [TuiIcon, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div class="grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent">
        <tui-icon [icon]="icon()" [style.font-size.px]="26" />
      </div>
      <h3 class="m-0 text-base font-semibold">{{ title() }}</h3>
      @if (hint()) { <p class="m-0 max-w-sm text-sm text-muted">{{ hint() }}</p> }
      @if (actionLabel()) {
        @if (actionLink()) {
          <a class="btn btn-primary mt-1 no-underline" [routerLink]="actionLink()">{{ actionLabel() }}</a>
        } @else {
          <button type="button" class="btn btn-primary mt-1" (click)="action.emit()">{{ actionLabel() }}</button>
        }
      }
    </div>
  `,
})
export class EmptyStateComponent {
  readonly icon = input('@tui.circle-alert');
  readonly title = input.required<string>();
  readonly hint = input('');
  readonly actionLabel = input('');
  readonly actionLink = input<string | null>(null);
  readonly action = output<void>();
}

@Component({
  selector: 'sm-error-state',
  imports: [TuiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card card-pad flex flex-col items-center gap-3 text-center" role="alert">
      <tui-icon icon="@tui.cloud-off" class="text-expense" [style.font-size.px]="28" />
      <p class="m-0 text-sm text-muted">{{ message() }}</p>
      <button type="button" class="btn btn-sm" (click)="retry.emit()">
        <tui-icon icon="@tui.refresh-cw" /> Try again
      </button>
    </div>
  `,
})
export class ErrorStateComponent {
  readonly message = input('Could not load data.');
  readonly retry = output<void>();
}

@Component({
  selector: 'sm-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="skeleton" [style.height]="height()" [style.width]="width()" aria-hidden="true"></div>`,
})
export class SkeletonComponent {
  readonly height = input('20px');
  readonly width = input('100%');
}

/** Coloured dot for categories / accounts. */
@Component({
  selector: 'sm-dot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="inline-block shrink-0 rounded-full" [style.background]="color() ?? 'var(--text-faint)'" [style.width.px]="size()" [style.height.px]="size()"></span>`,
})
export class DotComponent {
  readonly color = input<string | null>(null);
  readonly size = input(10);
}

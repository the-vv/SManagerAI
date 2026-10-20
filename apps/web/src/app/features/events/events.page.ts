import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { EmptyStateComponent, PageHeaderComponent } from '../../shared/components/ui.components';
import { MoneyPipe } from '../../shared/pipes/format.pipes';

@Component({
  selector: 'sm-events-page',
  imports: [PageHeaderComponent, EmptyStateComponent, TuiIcon, RouterLink, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sm-page-header title="Events" subtitle="Group transactions under a trip or occasion and see what it cost.">
      <button type="button" class="btn btn-primary" (click)="dialogs.event()"><tui-icon icon="@tui.plus" /> New event</button>
    </sm-page-header>

    @if (ref.events().length === 0) {
      <div class="card"><sm-empty-state icon="@tui.map-pin" title="No events yet" hint="Create one, e.g. “Ooty trip”, then pick it when adding transactions." actionLabel="New event" (action)="dialogs.event()" /></div>
    } @else {
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        @for (e of ref.events(); track e.id) {
          <a [routerLink]="['/events', e.id]" class="card card-pad rise block text-fg no-underline transition-colors hover:bg-surface-2" [class.opacity-60]="!e.isActive">
            <div class="flex items-center gap-2">
              <tui-icon icon="@tui.map-pin" />
              <span class="min-w-0 flex-1 truncate font-semibold">{{ e.name }}</span>
              @if (!e.isActive) { <span class="chip">Closed</span> }
            </div>
            <div class="num mt-3 text-2xl font-semibold text-expense">{{ e.expense | money }}</div>
            <div class="text-xs text-muted">spent · {{ e.count }} transaction{{ e.count === 1 ? '' : 's' }}@if (e.income > 0) { · {{ e.income | money }} income }</div>
            @if (e.budget) {
              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" [attr.aria-valuenow]="pct(e.expense, e.budget)" aria-valuemin="0" aria-valuemax="100" aria-label="Budget used">
                <div class="h-full rounded-full" [style.width.%]="pct(e.expense, e.budget)" [style.background]="e.expense > e.budget ? 'var(--expense)' : 'var(--accent)'"></div>
              </div>
              <div class="mt-1 text-xs" [class.text-expense]="e.expense > e.budget" [class.text-muted]="e.expense <= e.budget">
                {{ e.expense > e.budget ? (e.expense - e.budget | money) + ' over budget' : (e.budget - e.expense | money) + ' left of ' + (e.budget | money) }}
              </div>
            }
          </a>
        }
      </div>
    }
  `,
})
export class EventsPage {
  protected readonly ref = inject(RefData);
  protected readonly dialogs = inject(Dialogs);
  protected pct(spent: number, budget: number): number { return Math.min(100, Math.round((spent / budget) * 100)); }
}

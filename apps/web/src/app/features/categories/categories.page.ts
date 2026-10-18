import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { Toast } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { EmptyStateComponent, PageHeaderComponent } from '../../shared/components/ui.components';
import { Category } from '../../shared/models/api.models';
import { CategoriesApi } from './categories.api';

@Component({
  selector: 'sm-categories-page',
  imports: [PageHeaderComponent, EmptyStateComponent, TuiIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sm-page-header title="Categories" subtitle="Group income and spending. Everything here is editable.">
      <button type="button" class="btn btn-primary" (click)="dialogs.category({ type: tab() })"><tui-icon icon="@tui.plus" /> New category</button>
    </sm-page-header>

    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div class="seg" role="tablist">
        <button type="button" role="tab" [attr.aria-pressed]="tab() === 'EXPENSE'" (click)="tab.set('EXPENSE')">Expense</button>
        <button type="button" role="tab" [attr.aria-pressed]="tab() === 'INCOME'" (click)="tab.set('INCOME')">Income</button>
      </div>
      <label class="flex cursor-pointer items-center gap-2 text-sm text-muted">
        <input type="checkbox" [checked]="showInactive()" (change)="showInactive.set($any($event.target).checked)" /> Show inactive
      </label>
    </div>

    <div class="card overflow-hidden">
      @if (list().length === 0) {
        <sm-empty-state icon="@tui.tags" title="No categories" hint="Create a category to organise your transactions." actionLabel="New category" (action)="dialogs.category({ type: tab() })" />
      } @else {
        <ul class="m-0 list-none p-0">
          @for (c of list(); track c.id) {
            <li class="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0" [class.opacity-55]="!c.isActive">
              <span class="grid size-10 shrink-0 place-items-center rounded-xl"
                [style.background]="c.color ? 'color-mix(in srgb,' + c.color + ' 20%, transparent)' : 'var(--surface-2)'"
                [style.color]="c.color ?? 'var(--text-muted)'">
                <tui-icon [icon]="'@tui.' + (c.icon ?? 'tags')" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium">{{ c.name }}</div>
                @if (!c.isActive) { <div class="text-xs text-muted">Inactive</div> }
              </div>
              <button type="button" class="btn btn-sm" (click)="dialogs.category({ category: c })">Edit</button>
              <button type="button" class="btn btn-sm" (click)="toggle(c)">{{ c.isActive ? 'Deactivate' : 'Activate' }}</button>
              <button type="button" class="btn-ghost" [attr.aria-label]="'Delete ' + c.name" (click)="remove(c)"><tui-icon icon="@tui.trash" /></button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class CategoriesPage {
  protected readonly ref = inject(RefData);
  protected readonly dialogs = inject(Dialogs);
  private readonly api = inject(CategoriesApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(ConfirmService);

  protected readonly tab = signal<'EXPENSE' | 'INCOME'>('EXPENSE');
  protected readonly showInactive = signal(false);
  protected readonly list = computed(() =>
    this.ref.categories().filter((c) => c.type === this.tab() && (this.showInactive() || c.isActive)));

  protected toggle(c: Category): void {
    this.api.update(c.id, { isActive: !c.isActive }).subscribe({
      next: () => this.ref.refreshCategories().subscribe(), error: (e) => this.toast.error(e),
    });
  }
  protected async remove(c: Category): Promise<void> {
    if (!(await this.confirm.ask({
      title: `Delete “${c.name}”?`,
      message: 'Existing transactions keep their amounts but become uncategorized. Consider deactivating instead.',
      confirmLabel: 'Delete', danger: true,
    }))) return;
    this.api.remove(c.id).subscribe({
      next: () => { this.toast.success('Category deleted'); this.ref.refreshCategories().subscribe(); },
      error: (e) => this.toast.error(e),
    });
  }
}

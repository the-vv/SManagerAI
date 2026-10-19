import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiDialogContext, tuiDialog } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { ApiClient } from '../../core/api/api.client';
import { Toast } from '../../core/services/toast.service';
import { AiLimits, AiLimitUser } from '../../shared/models/api.models';

/** The popup: one row per user (admins included) with an editable daily AI limit. */
@Component({
  selector: 'sm-ai-limits-dialog',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <div>
        <h2 class="m-0 text-lg font-semibold">AI credits per user</h2>
        <p class="m-0 mt-1 text-sm text-muted">Entries per day. Leave empty to use the default ({{ data()?.defaultLimit ?? '…' }}).</p>
      </div>
      <ul class="m-0 flex max-h-96 list-none flex-col gap-2 overflow-auto p-0">
        @for (u of data()?.users ?? []; track u.id) {
          <li class="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
            <div class="min-w-0 flex-1">
              <div class="truncate text-sm font-medium">{{ u.name }}@if (u.isAdmin) { <span class="chip ml-2">Admin</span> }</div>
              <div class="truncate text-xs text-muted">{{ u.email }} · used {{ u.used }} today</div>
            </div>
            <input class="input !min-h-10 w-24" type="number" min="0" max="100000" inputmode="numeric" [attr.aria-label]="'Daily limit for ' + u.email"
              [placeholder]="'' + data()!.defaultLimit" [ngModel]="draft()[u.id] ?? u.customLimit" (ngModelChange)="edit(u, $event)" />
            <button type="button" class="btn btn-sm" [disabled]="busy() || !changed(u)" (click)="save(u)">Save</button>
          </li>
        }
      </ul>
      <div class="dialog-actions justify-end"><button type="button" class="btn" (click)="context.completeWith(true)">Done</button></div>
    </div>
  `,
})
export class AiLimitsDialog {
  readonly context = injectContext<TuiDialogContext<boolean, void>>();
  private readonly api = inject(ApiClient);
  private readonly toast = inject(Toast);
  protected readonly data = signal<AiLimits | null>(null);
  protected readonly draft = signal<Record<string, number | null | ''>>({});
  protected readonly busy = signal(false);

  constructor() {
    this.api.get<AiLimits>('/ai/limits').subscribe({ next: (d) => this.data.set(d), error: (e) => this.toast.error(e) });
  }

  protected edit(u: AiLimitUser, v: number | null | ''): void { this.draft.update((d) => ({ ...d, [u.id]: v })); }

  private value(u: AiLimitUser): number | null {
    const v = this.draft()[u.id];
    return v === undefined ? u.customLimit : v === '' || v === null ? null : Math.max(0, Math.floor(Number(v)));
  }

  protected changed(u: AiLimitUser): boolean { return this.value(u) !== u.customLimit; }

  protected save(u: AiLimitUser): void {
    this.busy.set(true);
    this.api.patch<AiLimits>(`/ai/limits/${u.id}`, { dailyLimit: this.value(u) }).subscribe({
      next: (d) => {
        this.busy.set(false); this.data.set(d);
        this.draft.update(({ [u.id]: _x, ...rest }) => rest);
        this.toast.success('Limit saved');
      },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}

/** Admin only: the settings card that opens the popup. */
@Component({
  selector: 'sm-ai-limits-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card card-pad rise" aria-label="AI credits">
      <h2 class="m-0 mb-1 text-base font-semibold">AI credits</h2>
      <p class="m-0 mb-3 text-sm text-muted">Everyone gets the default daily allowance. Set a custom limit for any user, including yourself.</p>
      <button type="button" class="btn" (click)="open()">Manage per-user credits</button>
    </section>
  `,
})
export class AiLimitsSection {
  private readonly dialog = tuiDialog(AiLimitsDialog, { size: 'm', closable: true, dismissible: true });
  protected open(): void { this.dialog().subscribe(); }
}

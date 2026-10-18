import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';
import { Dialogs } from '../../core/services/dialogs.service';
import { RefData } from '../../core/services/ref-data.store';
import { MoneyPipe } from '../../shared/pipes/format.pipes';
import { AiQueueItem } from './ai.api';
import { AiQueueStore } from './ai-queue.store';

/** The user's AI queue: what is waiting, what was added automatically, and what needs a look. */
@Component({
  selector: 'sm-ai-queue',
  imports: [TuiIcon, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block max-w-full min-w-0' },
  template: `
    @if (store.items().length > 0) {
      <section class="card mb-3 max-w-full min-w-0 p-3" aria-label="AI queue">
        <div class="mb-1 flex items-center justify-between gap-2">
          <h2 class="m-0 text-xs font-semibold tracking-wider text-muted uppercase">AI queue
            @if (store.active().length) { · {{ store.active().length }} in progress }</h2>
          @if (hasDone()) { <button type="button" class="link-btn text-xs" (click)="store.clearDone()">Clear done</button> }
        </div>
        <ul class="m-0 flex list-none flex-col divide-y divide-line p-0">
          @for (i of store.items(); track i.jobId) {
            <li class="flex items-center gap-2 py-2 text-sm">
              @switch (i.state) {
                @case ('QUEUED') { <tui-icon icon="@tui.clock" class="shrink-0 text-muted" /> }
                @case ('PROCESSING') { <tui-icon icon="@tui.refresh-cw" class="shrink-0 animate-spin text-accent" /> }
                @case ('SAVED') { <tui-icon icon="@tui.circle-check" class="shrink-0 text-income" /> }
                @default { <tui-icon icon="@tui.triangle-alert" class="shrink-0 text-expense" /> }
              }
              <div class="min-w-0 flex-1">
                @if (i.state === 'SAVED' && i.transaction; as t) {
                  <div class="truncate"><b>{{ t.title }}</b> · <span class="num" [class.text-income]="t.kind === 'INCOME'" [class.text-expense]="t.kind === 'EXPENSE'">{{ t.amount | money }}</span></div>
                  <div class="truncate text-xs text-muted">Added to {{ t.accountName }} · {{ t.categoryName ?? 'Uncategorized' }}</div>
                } @else {
                  <div class="truncate">{{ i.inputText }}</div>
                  <div class="truncate text-xs" [class.text-muted]="i.state === 'QUEUED' || i.state === 'PROCESSING'" [class.text-expense]="i.state === 'FAILED' || i.state === 'NEEDS_REVIEW'">{{ detail(i) }}</div>
                }
              </div>
              @switch (i.state) {
                @case ('SAVED') { <button type="button" class="btn btn-ghost btn-sm" (click)="edit(i)">Edit</button> }
                @case ('NEEDS_REVIEW') { <button type="button" class="btn btn-sm" (click)="complete(i)">Add details</button> }
                @case ('FAILED') { <button type="button" class="btn btn-sm" (click)="complete(i)">Add manually</button> }
              }
              <button type="button" class="btn btn-ghost btn-sm !px-2 shrink-0"
                [attr.aria-label]="i.state === 'SAVED' ? 'Hide from queue' : 'Remove from queue'"
                [title]="i.state === 'SAVED' ? 'Hide (the transaction stays)' : 'Remove – I no longer need this'"
                (click)="store.remove(i.jobId)"><tui-icon icon="@tui.x" /></button>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class AiQueueComponent implements OnInit, OnDestroy {
  protected readonly store = inject(AiQueueStore);
  private readonly dialogs = inject(Dialogs);
  private readonly ref = inject(RefData);

  ngOnInit(): void { this.store.start(); }
  ngOnDestroy(): void { this.store.stop(); } // polling never outlives the page

  protected hasDone(): boolean { return this.store.items().some((i) => i.state === 'SAVED' || i.state === 'FAILED'); }

  protected detail(i: AiQueueItem): string {
    switch (i.state) {
      case 'QUEUED': return i.queuePosition && i.queuePosition > 1 ? `Waiting in queue · ${i.queuePosition - 1} ahead` : 'Waiting in queue';
      case 'PROCESSING': return 'AI is identifying your transaction…';
      case 'NEEDS_REVIEW': return i.error ?? 'Needs your attention.';
      default: return i.error ?? 'Unable to identify transaction. Please enter it manually.';
    }
  }

  /** Opens the normal transaction form, filled in with what the AI found. */
  protected async complete(i: AiQueueItem): Promise<void> {
    const r = i.result;
    const saved = await this.dialogs.transaction({
      prefill: { title: r?.title ?? i.inputText.slice(0, 120), amount: r?.amount ?? null, kind: r?.type, categoryId: r?.categoryId ?? null, aiJobId: r ? i.jobId : undefined },
    });
    if (saved) this.store.refresh();
  }

  protected async edit(i: AiQueueItem): Promise<void> {
    const id = i.transaction?.id;
    if (!id) return;
    this.ref.refreshAccounts().subscribe();
    await this.dialogs.editTransactionById(id);
    this.store.refresh();
  }
}

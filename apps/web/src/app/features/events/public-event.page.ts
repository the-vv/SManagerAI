import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiClient } from '../../core/api/api.client';
import { Toast } from '../../core/services/toast.service';
import { AmountInputComponent } from '../../shared/components/amount-input.component';
import { PublicEvent } from '../../shared/models/api.models';
import { MoneyPipe } from '../../shared/pipes/format.pipes';

const NAME_KEY = 'sm-guest-name';

/** Opened from a shared link, no sign-in: the event's shares, and (if the owner allows) a form to add your own expense. */
@Component({
  selector: 'sm-public-event-page',
  imports: [ReactiveFormsModule, AmountInputComponent, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 py-8">
      @if (error()) {
        <div class="card card-pad text-center"><h1 class="m-0 text-lg font-semibold">Link not available</h1><p class="m-0 mt-1 text-sm text-muted">The owner may have switched sharing off.</p></div>
      } @else if (ev(); as e) {
        <header>
          <h1 class="m-0 text-2xl font-semibold tracking-tight">{{ e.name }}</h1>
          <p class="m-0 mt-1 text-sm text-muted">Shared by {{ e.ownerName }}@if (e.startDate) { · {{ e.startDate }}@if (e.endDate) { → {{ e.endDate }} } }@if (!e.isActive) { · Closed }</p>
          @if (e.notes) { <p class="m-0 mt-1 text-sm">{{ e.notes }}</p> }
        </header>

        <section class="card card-pad" aria-label="Shares">
          <p class="m-0 mb-3 text-sm text-muted">Total cost <span class="num font-medium text-fg">{{ e.totalCost | money }}</span>, split equally between {{ e.members.length }}.</p>
          <ul class="m-0 flex list-none flex-col gap-2 p-0">
            @for (m of e.members; track m.name) {
              <li class="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm font-medium">{{ m.name }}</div>
                  <div class="num text-xs text-muted">Spent {{ m.spent | money }} · Share {{ m.share | money }}</div>
                </div>
                <div class="num text-right text-sm font-semibold" [class.text-income]="m.balance > 0" [class.text-expense]="m.balance < 0">
                  {{ m.balance > 0 ? 'Gets back ' + (m.balance | money) : m.balance < 0 ? 'Owes ' + (-m.balance | money) : 'Settled' }}
                </div>
              </li>
            }
          </ul>
        </section>

        @if (e.canAddExpenses) {
          <form class="card card-pad flex flex-col gap-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <h2 class="m-0 text-base font-semibold">Add what you paid</h2>
            <div>
              <label class="field-label" for="g-name">Your name *</label>
              <input id="g-name" class="input" formControlName="name" maxlength="60" autocomplete="name" [class.invalid]="submitted() && form.controls.name.invalid" />
            </div>
            <div>
              <label class="field-label" for="g-title">What for? *</label>
              <input id="g-title" class="input" formControlName="title" maxlength="120" placeholder="e.g. Dinner" [class.invalid]="submitted() && form.controls.title.invalid" />
            </div>
            <div>
              <label class="field-label" for="g-amount">Amount *</label>
              <sm-amount-input inputId="g-amount" formControlName="amount" [invalid]="submitted() && form.controls.amount.invalid" />
            </div>
            @if (submitted() && form.invalid) { <div class="error-text">Fill in all fields.</div> }
            <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Adding…' : 'Add expense' }}</button>
          </form>
        }

        @if (e.expenses.length > 0) {
          <section class="card card-pad" aria-label="Expenses">
            <h2 class="m-0 mb-2 text-base font-semibold">Expenses by others</h2>
            <ul class="m-0 flex list-none flex-col p-0">
              @for (x of e.expenses; track $index) {
                <li class="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
                  <span class="min-w-0 flex-1"><span class="block truncate text-sm font-medium">{{ x.title }}</span><span class="text-xs text-muted">{{ x.personName }}</span></span>
                  <span class="num text-sm font-semibold">{{ x.amount | money }}</span>
                </li>
              }
            </ul>
          </section>
        }
      }
    </main>
  `,
})
export class PublicEventPage {
  readonly token = input.required<string>();
  private readonly api = inject(ApiClient);
  private readonly toast = inject(Toast);
  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly ev = signal<PublicEvent | null>(null);
  protected readonly error = signal(false);
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly form = this.fb.group({
    name: this.fb.control(this.savedName(), [Validators.required, Validators.pattern(/\S/)]),
    title: this.fb.control('', [Validators.required, Validators.pattern(/\S/)]),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
  });

  constructor() { effect(() => this.load()); }

  private savedName(): string { try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; } }

  private load(): void {
    this.api.get<PublicEvent>(`/public/events/${encodeURIComponent(this.token())}`).subscribe({
      next: (e) => this.ev.set(e), error: () => this.error.set(true),
    });
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.busy()) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.api.post(`/public/events/${encodeURIComponent(this.token())}/expenses`, { name: v.name.trim(), title: v.title.trim(), amount: v.amount! }).subscribe({
      next: () => {
        try { localStorage.setItem(NAME_KEY, v.name.trim()); } catch { /* private mode */ }
        this.busy.set(false); this.submitted.set(false);
        this.form.patchValue({ title: '', amount: null });
        this.toast.success('Expense added');
        this.load();
      },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
}

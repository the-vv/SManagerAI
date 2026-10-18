import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiIcon } from '@taiga-ui/core';
import { ApiClient } from '../../core/api/api.client';
import { AuthService } from '../../core/auth/auth.service';
import { Toast } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm.service';
import { SelectComponent } from '../../shared/components/select.component';
import { Invite, NewInvite } from '../../shared/models/api.models';
import { SmDatePipe } from '../../shared/pipes/format.pipes';

/** Admin only: create single-use sign-up invites and see / revoke them. */
@Component({
  selector: 'sm-invites-section',
  imports: [FormsModule, TuiIcon, SelectComponent, SmDatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card card-pad rise" aria-label="Invites">
      <h2 class="m-0 mb-1 text-base font-semibold">Invite people</h2>
      <p class="m-0 mb-3 text-sm text-muted">Sign-up is by invitation. Each invite works once and expires. Share the link or the code.</p>

      <form class="flex flex-col gap-2 sm:flex-row sm:items-end" (submit)="$event.preventDefault(); create()">
        <div class="min-w-0 flex-1">
          <label class="field-label" for="inv-note">Who is it for? (optional)</label>
          <input id="inv-note" class="input" name="note" maxlength="100" placeholder="e.g. Sam" [ngModel]="note()" (ngModelChange)="note.set($event)" />
        </div>
        <div class="sm:w-40">
          <label class="field-label" for="inv-exp">Expires in</label>
          <sm-select inputId="inv-exp" [options]="expiryOpts" [(value)]="days" />
        </div>
        <button type="submit" class="btn btn-primary" [disabled]="busy()"><tui-icon icon="@tui.plus" /> Create invite</button>
      </form>

      @if (fresh(); as f) {
        <div class="mt-3 rounded-xl border border-accent/40 bg-accent-soft p-3" role="status">
          <div class="text-sm font-medium">Invite created{{ f.note ? ' for ' + f.note : '' }} – copy it now, it is shown only once.</div>
          @if (link(f); as l) {
            <div class="mt-2 flex items-center gap-2">
              <input class="input !min-h-10 min-w-0 flex-1 !text-xs" readonly aria-label="Invite link" [value]="l" (focus)="$any($event.target).select()" />
              <button type="button" class="btn btn-sm" (click)="copy(l, 'Link copied')"><tui-icon icon="@tui.copy" /> Link</button>
            </div>
          }
          <div class="mt-2 flex items-center gap-2">
            <code class="num min-w-0 flex-1 rounded-lg bg-surface-2 px-3 py-2 text-sm tracking-wider break-all">{{ f.code }}</code>
            <button type="button" class="btn btn-sm" (click)="copy(f.code, 'Code copied')"><tui-icon icon="@tui.copy" /> Code</button>
          </div>
          <div class="mt-2 text-xs text-muted">Valid until {{ f.expiresAt | smDate: true }}.</div>
        </div>
      }

      @if (invites().length > 0) {
        <ul class="m-0 mt-4 flex list-none flex-col gap-2 p-0">
          @for (i of invites(); track i.id) {
            <li class="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span class="truncate">{{ i.note || 'Invite' }}</span>
                  <span class="chip" [class.text-income]="i.status === 'ACTIVE'" [class.text-accent]="i.status === 'USED'" [class.text-muted]="i.status === 'EXPIRED' || i.status === 'REVOKED'">{{ label(i.status) }}</span>
                </div>
                <div class="text-xs text-muted">
                  @if (i.status === 'USED' && i.usedBy) { Used by {{ i.usedBy.email }} · {{ i.usedAt | smDate: true }} }
                  @else if (i.status === 'ACTIVE') { Expires {{ i.expiresAt | smDate: true }} }
                  @else { Created {{ i.createdAt | smDate }} }
                </div>
              </div>
              @if (i.status === 'ACTIVE') { <button type="button" class="btn btn-sm" (click)="revoke(i)">Revoke</button> }
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class InvitesSection {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(ConfirmService);

  protected readonly invites = signal<Invite[]>([]);
  protected readonly fresh = signal<NewInvite | null>(null);
  protected readonly busy = signal(false);
  protected readonly note = signal('');
  protected readonly days = signal<number | null>(7);
  protected readonly expiryOpts = [1, 3, 7, 14, 30].map((d) => ({ value: d as number | null, label: d === 1 ? '1 day' : `${d} days` }));

  constructor() { this.load(); }

  private load(): void {
    this.api.get<Invite[]>('/invites').subscribe({ next: (l) => this.invites.set(l), error: (e) => this.toast.error(e) });
  }

  protected create(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.post<NewInvite>('/invites', { note: this.note().trim() || undefined, expiresInDays: this.days() ?? 7 }).subscribe({
      next: (inv) => { this.busy.set(false); this.fresh.set(inv); this.note.set(''); this.load(); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }

  /** The Android app has no public web address, so it only shows the code. */
  protected link(i: NewInvite): string | null {
    return this.auth.isNative ? null : `${window.location.origin}/login?invite=${encodeURIComponent(i.code)}`;
  }

  protected label(s: Invite['status']): string {
    return { ACTIVE: 'Active', USED: 'Used', EXPIRED: 'Expired', REVOKED: 'Revoked' }[s];
  }

  protected async copy(text: string, done: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); this.toast.success(done); }
    catch { this.toast.info('Select the text and copy it manually.'); }
  }

  protected async revoke(i: Invite): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Revoke invite?', message: 'The code will stop working immediately.', confirmLabel: 'Revoke', danger: true }))) return;
    this.api.delete(`/invites/${i.id}`).subscribe({ next: () => { this.toast.success('Invite revoked'); this.load(); }, error: (e) => this.toast.error(e) });
  }
}

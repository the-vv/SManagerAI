import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth.service';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { AuthConfig } from '../../shared/models/api.models';

declare const google: {
  accounts: { id: { initialize(o: unknown): void; renderButton(el: HTMLElement, o: unknown): void } };
} | undefined;

@Component({
  selector: 'sm-auth-page',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="grid min-h-dvh place-items-center px-4 py-10" style="background: radial-gradient(900px 500px at 15% -10%, var(--accent-soft), transparent), radial-gradient(700px 400px at 100% 110%, var(--income-soft), transparent), var(--bg)">
      <div class="rise w-full max-w-sm">
        <div class="mb-6 flex items-center gap-3">
          <img src="assets/logo-256.png" alt="SManager AI logo" width="44" height="44" class="size-11 rounded-2xl shadow-lg" />
          <div><div class="text-xl font-semibold tracking-tight">SManager AI</div><div class="text-xs text-muted">Personal finance, simply</div></div>
        </div>

        <form class="card card-pad flex flex-col gap-4" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <h1 class="m-0 text-lg font-semibold">{{ mode() === 'login' ? 'Welcome back' : 'Create your account' }}</h1>

          @if (mode() === 'register') {
            <div>
              <label class="field-label" for="a-name">Name</label>
              <input id="a-name" class="input" formControlName="name" autocomplete="name" />
              @if (submitted() && form.controls.name.invalid) { <div class="error-text">Name is required.</div> }
            </div>
          }
          @if (mode() === 'register' && config()?.inviteRequired) {
            <div>
              <label class="field-label" for="a-invite">Invite code</label>
              <input id="a-invite" class="input uppercase" formControlName="inviteCode" autocomplete="off" autocapitalize="characters" spellcheck="false"
                placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="40" [class.invalid]="submitted() && form.controls.inviteCode.invalid" />
              @if (submitted() && form.controls.inviteCode.invalid) { <div class="error-text">Enter the invite code you were given.</div> }
              @else { <div class="mt-1 text-xs text-muted">Sign-up is by invitation only. Open your invite link, or paste the code here.</div> }
            </div>
          }
          <div>
            <label class="field-label" for="a-email">Email</label>
            <input id="a-email" class="input" type="email" formControlName="email" autocomplete="username" inputmode="email" />
            @if (submitted() && form.controls.email.invalid) { <div class="error-text">Enter a valid email address.</div> }
          </div>
          <div>
            <label class="field-label" for="a-pass">Password</label>
            <input id="a-pass" class="input" type="password" formControlName="password" [autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'" />
            @if (submitted() && form.controls.password.invalid) { <div class="error-text">{{ mode() === 'register' ? 'Use at least 10 characters.' : 'Password is required.' }}</div> }
          </div>

          @if (error()) { <div class="rounded-xl bg-expense-soft px-3 py-2 text-sm text-expense" role="alert">{{ error() }}</div> }

          <button type="submit" class="btn btn-primary" [disabled]="busy()">{{ busy() ? 'Please wait…' : mode() === 'login' ? 'Sign in' : 'Create account' }}</button>

          @if (config()?.googleClientId) {
            <div class="flex items-center gap-3 text-xs text-muted"><span class="h-px flex-1 bg-line"></span>or<span class="h-px flex-1 bg-line"></span></div>
            <div #googleBtn class="flex justify-center" style="color-scheme: light;"></div>
          }
        </form>

        @if (config()?.registrationOpen || config()?.inviteRequired) {
          <p class="mt-4 text-center text-sm text-muted">
            {{ mode() === 'login' ? (config()?.inviteRequired ? 'Have an invite?' : 'New here?') : 'Already have an account?' }}
            <button type="button" class="cursor-pointer border-0 bg-transparent p-0 font-semibold text-accent" (click)="toggle()">
              {{ mode() === 'login' ? 'Create an account' : 'Sign in' }}</button>
          </p>
        }
      </div>
    </main>
  `,
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly ref = inject(RefData);
  private readonly settings = inject(SettingsStore);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly googleBtn = viewChild<ElementRef<HTMLElement>>('googleBtn');

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly config = signal<AuthConfig | null>(null);

  protected readonly form = this.fb.group({
    name: this.fb.control(''),
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', [Validators.required]),
    inviteCode: this.fb.control(''),
  });

  constructor() {
    this.auth.config().subscribe({
      next: (c) => {
        this.config.set(c);
        // an invite link (/login?invite=CODE) opens the sign-up form with the code filled in
        const invite = this.route.snapshot.queryParamMap.get('invite');
        if (invite && c.inviteRequired) { this.form.controls.inviteCode.setValue(invite.trim()); this.setMode('register'); }
        else if (!c.registrationOpen && !c.inviteRequired) this.mode.set('login');
        if (c.googleClientId) setTimeout(() => this.initGoogle(c.googleClientId!), 0);
      },
      error: () => this.error.set('Cannot reach the server.'),
    });
  }

  protected toggle(): void { this.setMode(this.mode() === 'login' ? 'register' : 'login'); }

  private setMode(m: 'login' | 'register'): void {
    this.mode.set(m);
    this.error.set(null); this.submitted.set(false);
    const reg = m === 'register';
    const pw = this.form.controls.password;
    pw.setValidators(reg ? [Validators.required, Validators.minLength(10)] : [Validators.required]);
    pw.updateValueAndValidity();
    this.form.controls.name.setValidators(reg ? [Validators.required] : []);
    this.form.controls.name.updateValueAndValidity();
    this.form.controls.inviteCode.setValidators(reg && this.config()?.inviteRequired ? [Validators.required, Validators.pattern(/\S/)] : []);
    this.form.controls.inviteCode.updateValueAndValidity();
  }

  protected submit(): void {
    this.submitted.set(true); this.error.set(null);
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    const req = this.mode() === 'login' ? this.auth.login(v.email, v.password) : this.auth.register(v.name, v.email, v.password, this.inviteCode());
    req.subscribe({ next: () => this.done(), error: (e) => { this.busy.set(false); this.error.set(e.message); } });
  }

  /** the code to send with a sign-up (only while the server is invite-only) */
  private inviteCode(): string | undefined {
    return this.config()?.inviteRequired ? this.form.controls.inviteCode.value.trim() || undefined : undefined;
  }

  private done(): void {
    this.settings.load().subscribe({ error: () => undefined });
    this.ref.loadAll().subscribe({ complete: () => void this.router.navigateByUrl('/dashboard'), error: () => void this.router.navigateByUrl('/dashboard') });
  }

  /** Google Identity Services: the ID token is verified by the API (audience = your client ID). */
  private initGoogle(clientId: string): void {
    const start = () => {
      if (typeof google === 'undefined' || !this.googleBtn()) return;
      google.accounts.id.initialize({
        client_id: clientId,
        callback: (r: { credential: string }) => {
          this.busy.set(true);
          this.auth.google(r.credential, this.inviteCode()).subscribe({ next: () => this.done(), error: (e) => { this.busy.set(false); this.error.set(e.message); } });
        },
      });
      google.accounts.id.renderButton(this.googleBtn()!.nativeElement, { theme: 'outline', size: 'large', width: 300 });
    };
    if (typeof google !== 'undefined') return start();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = start;
    document.head.appendChild(s);
  }
}

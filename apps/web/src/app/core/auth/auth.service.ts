import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Observable, firstValueFrom, tap } from 'rxjs';
import { ApiClient } from '../api/api.client';
import { AuthConfig, AuthResult, SessionInfo, User } from '../../shared/models/api.models';

const TOKEN_KEY = 'sm_token';

/**
 * Web: the session lives in an httpOnly cookie - JavaScript never sees the token.
 * Android (Capacitor): cookies are unreliable cross-origin in a WebView, so the server also
 * returns the session token (only when X-Client: native) and it is kept in Capacitor Preferences
 * (Android SharedPreferences, app-private) and sent as a Bearer token.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);

  readonly isNative = Capacitor.isNativePlatform();
  private readonly _user = signal<User | null>(null);
  private readonly _ready = signal(false);
  private _token: string | null = null;

  readonly user = this._user.asReadonly();
  readonly ready = this._ready.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  get token(): string | null { return this._token; }

  /** Called once at startup: restore the native token, then ask the server who we are. */
  async init(): Promise<void> {
    try {
      if (this.isNative) this._token = (await Preferences.get({ key: TOKEN_KEY })).value;
      this._user.set(await firstValueFrom(this.api.get<User>('/auth/me')));
    } catch {
      this._user.set(null);
    } finally {
      this._ready.set(true);
    }
  }

  config(): Observable<AuthConfig> { return this.api.get<AuthConfig>('/auth/config'); }

  login(email: string, password: string): Observable<AuthResult> {
    return this.api.post<AuthResult>('/auth/login', { email, password }).pipe(tap((r) => this.accept(r)));
  }
  register(name: string, email: string, password: string): Observable<AuthResult> {
    return this.api.post<AuthResult>('/auth/register', { name, email, password }).pipe(tap((r) => this.accept(r)));
  }
  google(idToken: string): Observable<AuthResult> {
    return this.api.post<AuthResult>('/auth/google', { idToken }).pipe(tap((r) => this.accept(r)));
  }

  private accept(r: AuthResult): void {
    this._user.set(r.user);
    if (this.isNative && r.token) {
      this._token = r.token;
      void Preferences.set({ key: TOKEN_KEY, value: r.token });
    }
  }

  async logout(): Promise<void> {
    try { await firstValueFrom(this.api.post<void>('/auth/logout')); } catch { /* already invalid */ }
    await this.clear();
    await this.router.navigateByUrl('/login');
  }

  /** The server rejected our session (expired/revoked). */
  async handleUnauthorized(): Promise<void> {
    if (!this._user()) return;
    await this.clear();
    await this.router.navigateByUrl('/login');
  }

  private async clear(): Promise<void> {
    this._user.set(null);
    this._token = null;
    if (this.isNative) await Preferences.remove({ key: TOKEN_KEY });
  }

  sessions(): Observable<SessionInfo[]> { return this.api.get<SessionInfo[]>('/auth/sessions'); }
  revokeSession(id: string): Observable<void> { return this.api.delete(`/auth/sessions/${id}`); }
  revokeOthers(): Observable<void> { return this.api.post<void>('/auth/sessions/revoke-others'); }
  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.api.post<void>('/auth/change-password', { currentPassword, newPassword });
  }
}

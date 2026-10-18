import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { provideTaiga } from '@taiga-ui/core';
import { of } from 'rxjs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { RefData } from '../../core/services/ref-data.store';
import { SettingsStore } from '../../core/services/settings.store';
import { AuthConfig } from '../../shared/models/api.models';
import { AuthPage } from './auth.page';

const CODE = 'ABCD-EFGH-JKMN-PQRS';

describe('AuthPage invite sign-up', () => {
  beforeAll(() => {
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() })) as never;
  });

  const setup = async (cfg: AuthConfig, invite: string | null) => {
    const register = vi.fn(() => of({ user: { id: '1', email: 'a@b.co', name: 'A' }, expiresAt: '' }));
    TestBed.configureTestingModule({
      providers: [
        provideTaiga(),
        { provide: AuthService, useValue: { config: () => of(cfg), register, login: vi.fn(), google: vi.fn() } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(invite ? { invite } : {}) } } },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
        { provide: RefData, useValue: { loadAll: () => of(null) } },
        { provide: SettingsStore, useValue: { load: () => of(null) } },
      ],
    });
    const f = TestBed.createComponent(AuthPage);
    f.detectChanges(); await f.whenStable(); f.detectChanges();
    return { f, el: f.nativeElement as HTMLElement, register };
  };
  const type = (el: HTMLElement, id: string, value: string) => {
    const input = el.querySelector(`#${id}`) as HTMLInputElement;
    input.value = value; input.dispatchEvent(new Event('input'));
  };
  const submit = (el: HTMLElement) => (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
  const invitesOnly: AuthConfig = { registrationOpen: false, inviteRequired: true, googleClientId: null };

  it('opens the sign-up form with the code from the invite link filled in, and sends it', async () => {
    const { f, el, register } = await setup(invitesOnly, CODE);
    expect(el.querySelector('h1')!.textContent).toContain('Create your account');
    expect((el.querySelector('#a-invite') as HTMLInputElement).value).toBe(CODE);
    type(el, 'a-name', 'Sam'); type(el, 'a-email', 'sam@example.com'); type(el, 'a-pass', 'correct horse battery');
    submit(el); f.detectChanges();
    expect(register).toHaveBeenCalledWith('Sam', 'sam@example.com', 'correct horse battery', CODE);
  });

  it('lets the code be typed manually, and will not submit without one', async () => {
    const { f, el, register } = await setup(invitesOnly, null);
    expect(el.querySelector('h1')!.textContent).toContain('Welcome back'); // no link: normal sign-in
    expect(el.querySelector('#a-invite')).toBeNull();
    (Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.includes('Create an account')) as HTMLButtonElement).click();
    f.detectChanges();
    expect(el.querySelector('#a-invite')).toBeTruthy();

    type(el, 'a-name', 'Sam'); type(el, 'a-email', 'sam@example.com'); type(el, 'a-pass', 'correct horse battery');
    submit(el); f.detectChanges();
    expect(register).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Enter the invite code');

    type(el, 'a-invite', ` ${CODE.toLowerCase()} `);
    submit(el); f.detectChanges();
    expect(register).toHaveBeenCalledWith('Sam', 'sam@example.com', 'correct horse battery', CODE.toLowerCase());
  });

  it('shows no invite field when sign-up is open, and ignores a stray invite parameter', async () => {
    const { el, register } = await setup({ registrationOpen: true, inviteRequired: false, googleClientId: null }, CODE);
    expect(el.querySelector('#a-invite')).toBeNull();
    expect(el.querySelector('h1')!.textContent).toContain('Welcome back');
    expect(register).not.toHaveBeenCalled();
  });
});

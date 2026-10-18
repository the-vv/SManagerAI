import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { provideTaiga, TuiRoot, tuiDateFormatProvider } from '@taiga-ui/core';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { DateInputComponent } from './date-input.component';
import { MonthNavComponent } from './month-nav.component';
import { TimeInputComponent } from './time-input.component';
import { SelectComponent } from './select.component';

@Component({
  imports: [TuiRoot, SelectComponent, MonthNavComponent],
  template: `<tui-root><sm-select ariaLabel="Account filter" [options]="opts" [(value)]="acc" /><sm-month-nav [month]="month()" (monthChange)="month.set($event)" /></tui-root>`,
})
class Host {
  opts = [{ value: '', label: 'All accounts' }, { value: 'a1', label: 'HDFC' }];
  acc = signal('a1');
  month = signal('2026-10');
}

describe('Taiga inputs', () => {
  beforeAll(() => { // jsdom lacks these browser APIs, which Taiga reads
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() })) as never;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  });

  const setup = async () => {
    TestBed.configureTestingModule({ providers: [provideTaiga()] });
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return f;
  };

  it('shows the selected account label and an accessible name', async () => {
    const f = await setup();
    const input = f.nativeElement.querySelector('input[aria-label="Account filter"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('HDFC');
  });

  it('shows the month in the Taiga month input and steps with the arrows', async () => {
    const f = await setup();
    const month = f.nativeElement.querySelector('input[aria-label="Choose month"]') as HTMLInputElement;
    expect(month).toBeTruthy();
    expect(month.value).toMatch(/2026/);
    expect(month.value).toMatch(/10|Oct/);
    (f.nativeElement.querySelector('button[aria-label="Next month"]') as HTMLButtonElement).click();
    expect(f.componentInstance.month()).toBe('2026-11');
    (f.nativeElement.querySelector('button[aria-label="Previous month"]') as HTMLButtonElement).click();
    (f.nativeElement.querySelector('button[aria-label="Previous month"]') as HTMLButtonElement).click();
    expect(f.componentInstance.month()).toBe('2026-09');
  });
});

@Component({
  imports: [TuiRoot, ReactiveFormsModule, SelectComponent, DateInputComponent, TimeInputComponent],
  template: `<tui-root>
    <sm-select inputId="s" [formControl]="cat" [options]="opts" />
    <sm-date inputId="d" [formControl]="date" />
    <sm-time inputId="t" [formControl]="time" />
  </tui-root>`,
})
class FormHost {
  opts = [{ value: null as string | null, label: 'Uncategorized' }, { value: 'c1', label: 'Food' }];
  cat = new FormControl<string | null>('c1');
  date = new FormControl('2026-10-18', { nonNullable: true });
  time = new FormControl('14:30', { nonNullable: true });
}

describe('Taiga inputs in reactive forms', () => {
  beforeAll(() => {
    window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn() })) as never;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  });

  it('writes control values into the fields (select label, date, time) with ids for external labels', async () => {
    TestBed.configureTestingModule({ providers: [provideTaiga(), tuiDateFormatProvider({ mode: 'dd/mm/yyyy', separator: '/' })] });
    const f = TestBed.createComponent(FormHost);
    f.detectChanges(); await f.whenStable(); f.detectChanges(); await f.whenStable(); f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    expect((el.querySelector('#s') as HTMLInputElement).value).toBe('Food');
    expect((el.querySelector('#d') as HTMLInputElement).value).toBe('18/10/2026');
    expect((el.querySelector('#t') as HTMLInputElement).value).toBe('14:30');
    f.componentInstance.cat.setValue(null);
    f.detectChanges(); await f.whenStable(); f.detectChanges();
    expect((el.querySelector('#s') as HTMLInputElement).value).toBe('Uncategorized');
  });
});

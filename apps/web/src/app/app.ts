import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { TuiRoot } from '@taiga-ui/core';
import { LoadingToastComponent } from './shared/components/loading-toast.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TuiRoot, LoadingToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<tui-root><router-outlet /><sm-loading-toast /></tui-root>`,
})
export class App {
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  constructor() {
    if (!Capacitor.isNativePlatform()) return;
    // Android back button: from any top-level tab leave the app instead of stepping back through
    // previously visited tabs. Detail pages (e.g. /accounts/:id) still go back one step.
    void CapacitorApp.addListener('backButton', () => {
      const path = this.router.url.split(/[?#]/)[0].split('/').filter(Boolean);
      if (path.length <= 1) void CapacitorApp.exitApp();
      else this.location.back();
    });
  }
}

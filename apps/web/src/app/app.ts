import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TuiRoot } from '@taiga-ui/core';
import { LoadingToastComponent } from './shared/components/loading-toast.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TuiRoot, LoadingToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<tui-root><router-outlet /><sm-loading-toast /></tui-root>`,
})
export class App {}

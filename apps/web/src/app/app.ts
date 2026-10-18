import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TuiRoot } from '@taiga-ui/core';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TuiRoot],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<tui-root><router-outlet /></tui-root>`,
})
export class App {}

import { ChangeDetectionStrategy, Component, Injectable } from '@angular/core';
import { TuiDialogContext, tuiDialog } from '@taiga-ui/core';
import { injectContext } from '@taiga-ui/polymorpheus';
import { firstValueFrom } from 'rxjs';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

@Component({
  selector: 'sm-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <h2 class="m-0 text-lg font-semibold">{{ data.title }}</h2>
      <p class="m-0 text-sm text-muted">{{ data.message }}</p>
      <div class="flex justify-end gap-2">
        <button type="button" class="btn" (click)="context.completeWith(false)">Cancel</button>
        <button type="button" class="btn" [class.btn-danger]="data.danger" [class.btn-primary]="!data.danger"
          (click)="context.completeWith(true)">{{ data.confirmLabel ?? 'Confirm' }}</button>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent {
  readonly context = injectContext<TuiDialogContext<boolean, ConfirmOptions>>();
  protected readonly data = this.context.data;
}

/** Confirmation for destructive actions: `if (await confirm.ask({...})) ...` */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = tuiDialog(ConfirmDialogComponent, { size: 's', closable: false, dismissible: true });

  ask(options: ConfirmOptions): Promise<boolean> {
    return firstValueFrom(this.dialog(options), { defaultValue: false });
  }
}

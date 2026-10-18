import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoadingService } from '../../core/services/loading.service';

/** Small spinner pill, top-centre, shown while the app waits on the server for more than a moment. */
@Component({
  selector: 'sm-loading-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (loading.visible()) {
      <div class="pointer-events-none fixed inset-x-0 top-20 z-[70] flex justify-center px-4" role="status" aria-live="polite">
        <div class="card flex items-center gap-2.5 rounded-full px-4 py-2 text-sm shadow-lg">
          <span class="size-4 shrink-0 animate-spin rounded-full border-2 border-accent/30 border-t-accent" aria-hidden="true"></span>
          <span>{{ loading.slow() ? 'Still working… this is taking longer than usual' : 'Loading…' }}</span>
        </div>
      </div>
    }
  `,
})
export class LoadingToastComponent {
  protected readonly loading = inject(LoadingService);
}

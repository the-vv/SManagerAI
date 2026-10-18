import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, signal, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideTaiga, tuiDateFormatProvider, tuiTextfieldOptionsProvider } from '@taiga-ui/core';
import { AuthService } from './core/auth/auth.service';
import { apiInterceptor } from './core/interceptors/api.interceptor';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([apiInterceptor])),
    provideTaiga({ mode: 'dark' }),
    // no clear (×) button inside filters/selects: it only eats space and values are never "empty"
    tuiTextfieldOptionsProvider({ cleaner: signal(false) }),
    tuiDateFormatProvider({ mode: 'dd/mm/yyyy', separator: '/' }),
    // restore the session (cookie on web, stored token on Android) before the first route renders
    provideAppInitializer(() => inject(AuthService).init()),
  ],
};

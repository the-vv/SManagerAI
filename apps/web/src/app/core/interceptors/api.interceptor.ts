import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

/** Adds credentials (cookie on web, Bearer on Android) and reacts to expired sessions. */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);
  const auth = inject(AuthService);
  let headers = req.headers;
  if (auth.isNative) {
    headers = headers.set('X-Client', 'native');
    if (auth.token) headers = headers.set('Authorization', `Bearer ${auth.token}`);
  }
  const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/register') || req.url.includes('/auth/google');
  return next(req.clone({ headers, withCredentials: true })).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && e.status === 401 && !isAuthCall && !req.url.endsWith('/auth/me')) {
        void auth.handleUnauthorized();
      }
      return throwError(() => e);
    }),
  );
};

import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiErrorBody } from '../../shared/models/api.models';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: string[] = [],
  ) {
    super(message);
  }
  get isNetwork(): boolean { return this.status === 0; }
}

export type Query = Record<string, string | number | boolean | null | undefined>;

function toParams(q?: Query): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q ?? {})) {
    if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** The single place that talks to the backend: base URL, query building, error normalisation. */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  readonly baseUrl = environment.apiUrl;

  private url(path: string): string { return `${this.baseUrl}${path}`; }

  get<T>(path: string, query?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: toParams(query) }).pipe(catchError(this.fail));
  }
  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? {}).pipe(catchError(this.fail));
  }
  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body).pipe(catchError(this.fail));
  }
  delete<T = void>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path)).pipe(catchError(this.fail));
  }
  text(path: string, query?: Query): Observable<Blob> {
    return this.http.get(this.url(path), { params: toParams(query), responseType: 'blob' }).pipe(catchError(this.fail));
  }

  private fail = (e: unknown) => {
    if (e instanceof HttpErrorResponse) {
      if (e.status === 0) {
        return throwError(() => new ApiError('Cannot reach the server. Check your connection and try again.', 0));
      }
      const body = e.error as Partial<ApiErrorBody> | null;
      return throwError(() => new ApiError(body?.message ?? e.statusText ?? 'Request failed', e.status, body?.details ?? []));
    }
    return throwError(() => e);
  };
}

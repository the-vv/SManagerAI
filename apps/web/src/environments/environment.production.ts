/** Production web build: served by the same origin as the API (Caddy routes /api to NestJS). */
export const environment = {
  production: true,
  apiUrl: '/api',
};

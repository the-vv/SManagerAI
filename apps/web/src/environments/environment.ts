/** Development: the dev server proxies /api to the NestJS API on :3000 (see proxy.conf.json). */
export const environment = {
  production: false,
  apiUrl: '/api',
};

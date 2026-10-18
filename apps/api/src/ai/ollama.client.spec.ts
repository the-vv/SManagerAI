import { jest } from '@jest/globals';
import { loadConfig } from '../common/config.js';
import { AiUnavailableError, OllamaClient } from './ollama.client.js';

const client = (env: Record<string, string> = {}) =>
  new OllamaClient(loadConfig({ OLLAMA_BASE_URL: 'https://ai.example/', OLLAMA_MODEL: 'tiny', OLLAMA_API_KEY: 'k', ...env }));
const ok = (text: string) => new Response(JSON.stringify({ choices: [{ text }] }), { status: 200 });

describe('OllamaClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the configured model/key to the completions endpoint with bounded, deterministic settings', async () => {
    const f = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok('{"results":[]}'));
    expect(await client().complete('p', 120)).toBe('{"results":[]}');
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://ai.example/api/v1/completions');
    expect((init.headers as Record<string, string>)['X-API-Key']).toBe('k');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'tiny', max_tokens: 120, temperature: 0, stream: false });
  });

  it('maps HTTP errors, network errors and timeouts to AiUnavailableError', async () => {
    const f = jest.spyOn(globalThis, 'fetch');
    f.mockResolvedValueOnce(new Response('x', { status: 500 }));
    await expect(client().complete('p', 1)).rejects.toBeInstanceOf(AiUnavailableError);
    f.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client().complete('p', 1)).rejects.toThrow(/unreachable/);
    f.mockRejectedValueOnce(Object.assign(new Error('t'), { name: 'TimeoutError' }));
    await expect(client().complete('p', 1)).rejects.toThrow(/timed out/);
  });

  it('never runs more concurrent requests than AI_MAX_CONCURRENT_REQUESTS', async () => {
    let active = 0, peak = 0;
    jest.spyOn(globalThis, 'fetch').mockImplementation((async () => {
      peak = Math.max(peak, ++active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
      return ok('x');
    }) as never);
    const c = client({ AI_MAX_CONCURRENT_REQUESTS: '1' });
    await Promise.all([c.complete('a', 1), c.complete('b', 1), c.complete('c', 1)]);
    expect(peak).toBe(1);
  });
});

import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../common/config.js';

export class AiUnavailableError extends Error {}

/**
 * The only code that talks to the AI server. Uses the OpenAI-style `/api/v1/completions`
 * endpoint of the configured Ollama gateway (X-API-Key auth). Concurrent calls are capped by
 * AI_MAX_CONCURRENT_REQUESTS so a small model on a small VPS is never overloaded.
 */
@Injectable()
export class OllamaClient {
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async complete(prompt: string, maxTokens: number): Promise<string> {
    const ai = this.config.ai;
    await this.acquire();
    try {
      const res = await fetch(`${ai.baseUrl}/api/v1/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(ai.apiKey ? { 'X-API-Key': ai.apiKey } : {}) },
        body: JSON.stringify({ model: ai.model, prompt, stream: false, max_tokens: maxTokens, temperature: 0 }),
        signal: AbortSignal.timeout(ai.requestTimeoutMs),
      });
      if (!res.ok) throw new AiUnavailableError(`AI server responded with HTTP ${res.status}`);
      const body = (await res.json()) as { choices?: { text?: unknown }[]; response?: unknown };
      const text = body.choices?.[0]?.text ?? body.response;
      if (typeof text !== 'string') throw new AiUnavailableError('AI server returned an unexpected response');
      return text;
    } catch (e) {
      if (e instanceof AiUnavailableError) throw e;
      const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      throw new AiUnavailableError(timedOut ? 'AI request timed out' : 'AI server is unreachable');
    } finally {
      this.release();
    }
  }

  private acquire(): Promise<void> {
    if (this.active < this.config.ai.maxConcurrentRequests) { this.active++; return Promise.resolve(); }
    return new Promise((resolve) => this.waiters.push(() => { this.active++; resolve(); }));
  }
  private release(): void {
    this.active--;
    this.waiters.shift()?.();
  }
}

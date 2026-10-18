import { Injectable } from '@nestjs/common';
import { buildPrompt, parseModelOutput, prepareJobs, validateResults } from './classification.js';
import type { ClassificationInput, JobOutcome } from './interfaces/ai.interfaces.js';
import { OllamaClient } from './ollama.client.js';

/** Turns a chunk of independent jobs into ONE model call and maps the answers back per job. */
@Injectable()
export class AiClassificationService {
  constructor(private readonly ollama: OllamaClient) {}

  /**
   * @throws AiUnavailableError when the server cannot be reached / times out (every job in the chunk should retry).
   * Malformed or partial answers are reported per job instead of throwing.
   */
  async classify(inputs: ClassificationInput[]): Promise<Map<string, JobOutcome>> {
    const jobs = prepareJobs(inputs);
    const prompt = buildPrompt(jobs);
    const maxTokens = Math.min(1024, 60 + 80 * jobs.length); // bounded output
    const raw = await this.ollama.complete(prompt, maxTokens);
    const entries = parseModelOutput(raw);
    if (!entries) return new Map(jobs.map((j) => [j.jobId, { ok: false, reason: 'malformed response' } as JobOutcome]));
    return validateResults(entries, jobs);
  }
}

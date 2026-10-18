import { jest } from '@jest/globals';
import { AiQueueService } from '../src/ai/ai-queue.service.js';
import { AiSchedulerService } from '../src/ai/ai-scheduler.service.js';
import { AiService } from '../src/ai/ai.service.js';
import { AiUnavailableError, OllamaClient } from '../src/ai/ollama.client.js';
import { Agent, TestCtx, categoryId, createApp, dashboard, makeAccount, rs, signUp } from './utils.js';

/** Fake model: reads the "Note jN" blocks of the prompt and answers (one JSON line per note) with keyword rules. */
function fakeModel(prompt: string): string {
  const body = prompt.split('"category":"Transport"}\n')[1].split('Answers:\n')[0]; // skip the few-shot examples
  const notes = [...body.matchAll(/Note (j\d+): ("(?:[^"\\]|\\.)*")\nExpense categories: (.*)\nIncome categories: (.*)/g)]
    .map((m) => ({ id: m[1], text: JSON.parse(m[2]) as string, exp: m[3].split(', '), inc: m[4].split(', ') }));
  const lines = notes.map((n) => {
    const income = /salary|got|received/i.test(n.text);
    const want = /lunch|food/i.test(n.text) ? 'Food' : /salary/i.test(n.text) ? 'Salary' : /freelance/i.test(n.text) ? 'Freelance' : /amazon/i.test(n.text) ? 'Shopping' : '';
    const category = (income ? n.inc : n.exp).includes(want) ? want : null;
    const amount = Number((n.text.match(/\d[\d,]*/) ?? ['0'])[0].replace(/,/g, '')) || null;
    return JSON.stringify({ id: n.id, title: n.text.replace(/[\d,]+/g, '').trim(), amount, type: income ? 'INCOME' : 'EXPENSE', category });
  });
  return lines.join('\n');
}

describe('AI smart entry', () => {
  let ctx: TestCtx;
  let ai: AiService, queue: AiQueueService, ollama: OllamaClient;
  let calls: string[];
  let model: (p: string) => string | Promise<string>;
  let a: Agent, b: Agent;

  beforeAll(async () => {
    ctx = await createApp({ OLLAMA_BASE_URL: 'http://ollama.invalid', AI_BATCH_SIZE: '3', AI_MAX_RETRIES: '2', AI_MAX_PENDING_PER_USER: '6', AI_DAILY_LIMIT: '100' });
    ai = ctx.app.get(AiService); queue = ctx.app.get(AiQueueService); ollama = ctx.app.get(OllamaClient);
    jest.spyOn(ollama, 'complete').mockImplementation((async (prompt: string) => { calls.push(prompt); return model(prompt); }) as never);
  });
  afterAll(async () => { await ctx.close(); });
  beforeEach(async () => {
    calls = []; model = fakeModel;
    await ctx.prisma.aiJob.deleteMany();
    a = await signUp(ctx.app, 'ai-a'); b = await signUp(ctx.app, 'ai-b');
  });

  const submit = async (agent: Agent, text: string) => {
    const r = await agent.post('/api/ai/transactions/classify').send({ text });
    expect(r.status).toBe(202);
    return r.body.jobId as string;
  };
  const job = async (agent: Agent, id: string) => (await agent.get(`/api/ai/jobs/${id}`)).body;
  const runAll = async () => { for (let i = 0; i < 6; i++) await ai.processBatch(); };

  it('queues immediately without calling the model, and requires auth', async () => {
    const id = await submit(a, 'Lunch 250');
    expect(calls).toHaveLength(0);
    expect(await job(a, id)).toMatchObject({ status: 'PENDING', result: null, queuePosition: 1 });
    expect((await ctx.prisma.aiJob.findUnique({ where: { id } }))?.status).toBe('PENDING');
    const anon = await (await import('supertest')).default(ctx.app.getHttpServer()).post('/api/ai/transactions/classify').send({ text: 'x 1' });
    expect(anon.status).toBe(401);
  });

  it('validates input length and emptiness', async () => {
    expect((await a.post('/api/ai/transactions/classify').send({ text: '   ' })).status).toBe(400);
    expect((await a.post('/api/ai/transactions/classify').send({ text: 'x'.repeat(250) })).status).toBe(400);
    expect((await a.post('/api/ai/transactions/classify').send({})).status).toBe(400);
  });

  it('batches several users into ONE model call, honouring the batch size, and keeps categories per user', async () => {
    const ids = [await submit(a, 'Lunch 250'), await submit(b, 'Salary 85000'), await submit(a, 'Got 5000 from freelance work'), await submit(b, 'Amazon shopping 2500')];
    await ai.processBatch();
    expect(calls).toHaveLength(1); // 3 of the 4 jobs, one inference
    expect(await ctx.prisma.aiJob.count({ where: { status: 'COMPLETED' } })).toBe(3);
    await ai.processBatch();
    expect(calls).toHaveLength(2);

    const lunch = await job(a, ids[0]);
    expect(lunch).toMatchObject({ status: 'COMPLETED', result: { type: 'EXPENSE', amount: rs(250), categoryId: await categoryId(a, 'Food') } });
    const salary = await job(b, ids[1]);
    expect(salary.result).toMatchObject({ type: 'INCOME', amount: rs(85000), categoryId: await categoryId(b, 'Salary') });
    expect((await job(a, ids[2])).result).toMatchObject({ type: 'INCOME', categoryId: await categoryId(a, 'Freelance') });
    // user A's category ids never appear in a prompt that also names user B's note, and vice versa
    expect(calls.join('\n')).not.toContain(await categoryId(a, 'Food'));
  });

  it('enforces a single active inference', async () => {
    await submit(a, 'Lunch 250');
    let release!: () => void;
    model = (p) => new Promise((r) => { release = () => r(fakeModel(p)); });
    const first = ai.processBatch();
    await new Promise((r) => setTimeout(r, 50));
    expect(await ai.processBatch()).toMatchObject({ skipped: true });
    release(); await first;
    expect(calls).toHaveLength(1);
  });

  it('the scheduler tick delegates to the batch processor and never throws', async () => {
    await submit(a, 'Lunch 250');
    await ctx.app.get(AiSchedulerService).tick();
    expect(calls).toHaveLength(1);
    model = () => { throw new Error('boom'); };
    await submit(a, 'Lunch 100');
    await expect(ctx.app.get(AiSchedulerService).tick()).resolves.toBeUndefined();
  });

  it('retries with backoff on AI downtime, then FAILs with a safe message', async () => {
    const id = await submit(a, 'Lunch 250');
    model = () => { throw new AiUnavailableError('AI server is unreachable'); };
    await ai.processBatch();
    let row = await ctx.prisma.aiJob.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ status: 'PENDING', retryCount: 1 });
    expect(row.nextRetryAt!.getTime()).toBeGreaterThan(Date.now());
    await ai.processBatch(); // not eligible yet: backoff
    expect(calls).toHaveLength(1);

    for (let i = 0; i < 2; i++) { // retries exhausted after AI_MAX_RETRIES (2) more attempts
      await ctx.prisma.aiJob.update({ where: { id }, data: { nextRetryAt: new Date(Date.now() - 1000) } });
      await ai.processBatch();
    }
    row = await ctx.prisma.aiJob.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('FAILED');
    const view = await job(a, id);
    expect(view.error).toMatch(/enter it manually/i);
    expect(JSON.stringify(view)).not.toMatch(/unreachable|invalid/);
  });

  it('handles malformed JSON and partial batch failures without duplicating successes', async () => {
    const [x, y] = [await submit(a, 'Lunch 250'), await submit(a, 'Petrol 1200')];
    model = () => 'definitely not json';
    await ai.processBatch();
    expect((await ctx.prisma.aiJob.findMany({ where: { id: { in: [x, y] } } })).every((j) => j.status === 'PENDING' && j.retryCount === 1)).toBe(true);

    await ctx.prisma.aiJob.updateMany({ data: { nextRetryAt: null } });
    model = (p) => fakeModel(p).split('\n').slice(0, 1).join('\n');
    await ai.processBatch();
    const rows = await ctx.prisma.aiJob.findMany({ where: { id: { in: [x, y] } }, orderBy: { createdAt: 'asc' } });
    expect(rows.map((r) => r.status)).toEqual(['COMPLETED', 'PENDING']);
    const done = rows[0].result;
    await ctx.prisma.aiJob.update({ where: { id: y }, data: { nextRetryAt: null } });
    await ai.processBatch();
    expect((await ctx.prisma.aiJob.findUniqueOrThrow({ where: { id: x } })).result).toBe(done); // untouched
  });

  it('returns an editable result with no amount instead of inventing one', async () => {
    const id = await submit(a, 'Lunch at restaurant');
    await ai.processBatch();
    const v = await job(a, id);
    expect(v.status).toBe('COMPLETED');
    expect(v.result.amount).toBeNull();
    expect(v.result.warnings).toContain('AMOUNT_MISSING');
  });

  it('recovers jobs stuck in PROCESSING after a restart (and after lease expiry)', async () => {
    const id = await submit(a, 'Lunch 250');
    await ctx.prisma.aiJob.update({ where: { id }, data: { status: 'PROCESSING', claimToken: 'dead', leaseExpiresAt: new Date(Date.now() + 60_000) } });
    expect(await queue.recoverStale()).toBe(0); // lease still valid
    await ai.recoverAfterRestart();
    expect(await ctx.prisma.aiJob.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'PENDING', claimToken: null, retryCount: 1 });

    await ctx.prisma.aiJob.update({ where: { id }, data: { status: 'PROCESSING', claimToken: 'dead', leaseExpiresAt: new Date(Date.now() - 1000) } });
    await runAll();
    expect((await ctx.prisma.aiJob.findUniqueOrThrow({ where: { id } })).status).toBe('COMPLETED');
  });

  it('a recovered job is not overwritten by a late result of the old worker', async () => {
    const id = await submit(a, 'Lunch 250');
    const [claimed] = await queue.claimBatch(5);
    await ctx.prisma.aiJob.update({ where: { id }, data: { status: 'PENDING', claimToken: null } });
    const ok = await queue.complete(claimed, { title: 'x', amount: 1, type: 'EXPENSE', categoryId: null, confidence: 1, warnings: [] });
    expect(ok).toBe(false);
  });

  it('never exposes another user\'s job', async () => {
    const id = await submit(a, 'Lunch 250');
    await ai.processBatch();
    expect((await b.get(`/api/ai/jobs/${id}`)).status).toBe(404);
    expect((await b.get('/api/ai/jobs')).body).toEqual([]);
    expect((await a.get('/api/ai/jobs').query({ status: 'COMPLETED' })).body).toHaveLength(1);
  });

  it('caps queued jobs per user', async () => {
    for (let i = 0; i < 6; i++) await submit(a, `Lunch ${i + 1}`);
    expect((await a.post('/api/ai/transactions/classify').send({ text: 'Lunch 9' })).status).toBe(429);
    expect(await submit(b, 'Lunch 9')).toBeTruthy();
  });

  it('CSV export accepts the same sort the transactions list sends and honours it', async () => {
    await makeAccount(a, { isDefault: true });
    await a.post('/api/transactions').send({ title: 'Small', amount: rs(1), kind: 'EXPENSE' });
    await a.post('/api/transactions').send({ title: 'Big', amount: rs(900), kind: 'EXPENSE' });
    const month = new Date().toISOString().slice(0, 7);
    const csv = async (q: Record<string, string>) => (await a.get('/api/transactions/export.csv').query({ month, ...q })).text.trim().split('\n').slice(1);
    const byAmount = await csv({ sort: 'amount', dir: 'desc' });
    expect(byAmount[0]).toContain('Big');
    expect((await csv({ sort: 'amount', dir: 'asc' }))[0]).toContain('Small');
    expect((await a.get('/api/transactions/export.csv').query({ month, sort: 'date', dir: 'desc' })).status).toBe(200);
  });

  describe('automatic saving', () => {
    const queueOf = async (agent: Agent) => (await agent.get('/api/ai/queue')).body as { jobId: string; state: string; error: string | null; transaction: { accountName: string } | null }[];
    const txs = async (agent: Agent) => (await agent.get('/api/transactions')).body;
    const balance = async (agent: Agent, id: string) => (await agent.get('/api/accounts')).body.items.find((x: { id: string }) => x.id === id).balance;

    it('adds the classified transaction to the default account by itself, dated when it was entered, exactly once', async () => {
      const def = await makeAccount(a, { openingBalance: rs(1000), isDefault: true });
      const other = await makeAccount(a, { openingBalance: rs(1000) });
      const id = await submit(a, 'Lunch 250');
      const enteredAt = (await ctx.prisma.aiJob.findUniqueOrThrow({ where: { id } })).createdAt;
      expect((await txs(a)).total).toBe(0); // nothing until the scheduler runs - the user can already leave the app
      await ai.processBatch();
      await runAll(); // further ticks never duplicate

      const list = await txs(a);
      expect(list.total).toBe(1);
      expect(list.items[0]).toMatchObject({ title: 'Lunch', amount: rs(250), kind: 'EXPENSE', account: { id: def.id }, category: { name: 'Food' }, source: 'MANUAL' });
      expect(new Date(list.items[0].occurredAt).getTime()).toBe(enteredAt.getTime());
      expect(await balance(a, def.id)).toBe(rs(750));
      expect(await balance(a, other.id)).toBe(rs(1000));
      expect((await queueOf(a))[0]).toMatchObject({ jobId: id, state: 'SAVED', transaction: { accountName: def.name } });
      expect(list.items[0].aiGenerated).toBe(true);
      const manual = await a.post('/api/transactions').send({ title: 'Manual', amount: rs(5), kind: 'EXPENSE' });
      expect(manual.body.aiGenerated).toBe(false);
      expect((await a.get(`/api/transactions/${list.items[0].id}`)).body.aiGenerated).toBe(true);
    });

    it('saves to the account picked at submit time (not the default), and rejects accounts that are not yours', async () => {
      const def = await makeAccount(a, { openingBalance: rs(1000), isDefault: true });
      const other = await makeAccount(a, { openingBalance: rs(1000) });
      const theirs = await makeAccount(b, { isDefault: true });
      const bad = await a.post('/api/ai/transactions/classify').send({ text: 'Lunch 250', accountId: theirs.id });
      expect(bad.status).toBe(400);
      expect((await a.post('/api/ai/transactions/classify').send({ text: 'Lunch 250', accountId: 'nope' })).status).toBe(400);
      expect(await ctx.prisma.aiJob.count({ where: { inputText: 'Lunch 250' } })).toBe(0);

      const r = await a.post('/api/ai/transactions/classify').send({ text: 'Petrol 100', accountId: other.id });
      expect(r.status).toBe(202);
      await submit(a, 'Lunch 250'); // no account: default
      await runAll();
      const items = (await txs(a)).items as { title: string; account: { id: string } }[];
      expect(items.find((t) => t.title.startsWith('Petrol'))!.account.id).toBe(other.id);
      expect(items.find((t) => t.title.startsWith('Lunch'))!.account.id).toBe(def.id);
      expect(await balance(a, other.id)).toBe(rs(900));
      expect((await a.get('/api/accounts')).body.items.find((x: { id: string }) => x.id === def.id).isDefault).toBe(true);
    });

    it('the queue survives a restart: pending entries are still processed and saved by a fresh app instance', async () => {
      await makeAccount(a, { isDefault: true });
      const id = await submit(a, 'Petrol 1200');
      const second = await createApp({ OLLAMA_BASE_URL: 'http://ollama.invalid' });
      try {
        jest.spyOn(second.app.get(OllamaClient), 'complete').mockImplementation((async (p: string) => fakeModel(p)) as never);
        await second.app.get(AiService).processBatch();
      } finally { await second.close(); }
      expect((await queueOf(a))[0]).toMatchObject({ jobId: id, state: 'SAVED' });
      expect((await txs(a)).total).toBe(1);
    });

    it('saves a classified entry that was never turned into a transaction (crash between classify and save)', async () => {
      await makeAccount(a, { isDefault: true });
      const id = await submit(a, 'Lunch 250');
      await ai.processBatch();
      await ctx.prisma.transaction.deleteMany({ where: { aiJobId: id } }); // simulate the lost save
      await ai.processBatch();
      await ai.processBatch();
      expect((await txs(a)).total).toBe(1);
    });

    it('keeps entries it cannot save in the queue for review (no amount), and the user can finish them on any account', async () => {
      const def = await makeAccount(a, { openingBalance: rs(1000), isDefault: true });
      const other = await makeAccount(a, { openingBalance: rs(1000) });
      const id = await submit(a, 'Lunch at restaurant');
      await ai.processBatch();
      expect((await txs(a)).total).toBe(0);
      expect((await queueOf(a))[0]).toMatchObject({ jobId: id, state: 'NEEDS_REVIEW', error: expect.stringMatching(/amount/i) });

      const save = () => a.post('/api/transactions').send({ title: 'Lunch', amount: rs(300), kind: 'EXPENSE', aiJobId: id, accountId: other.id });
      const [r1, r2] = await Promise.all([save(), save()]); // double click
      expect(r1.body.id).toBe(r2.body.id);
      expect((await save()).body.id).toBe(r1.body.id);
      expect((await txs(a)).total).toBe(1);
      expect(await balance(a, other.id)).toBe(rs(700));
      expect((await a.get('/api/accounts')).body.items.find((x: { id: string }) => x.id === def.id)).toMatchObject({ isDefault: true, balance: rs(1000) });
      expect((await queueOf(a))[0].state).toBe('SAVED');
    });

    it('needs review (not lost) when the user has no account yet', async () => {
      const id = await submit(a, 'Lunch 250');
      await ai.processBatch();
      expect((await queueOf(a))[0]).toMatchObject({ jobId: id, state: 'NEEDS_REVIEW' });
      expect((await txs(a)).total).toBe(0);
    });

    it('shows waiting/failed entries, and lets the user dismiss or clear finished ones - only their own', async () => {
      await makeAccount(a, { isDefault: true });
      const done = await submit(a, 'Lunch 250');
      await ai.processBatch();
      const waiting = await submit(a, 'Petrol 100');
      expect((await queueOf(a)).map((q) => q.state).sort()).toEqual(['QUEUED', 'SAVED']);
      expect((await b.delete(`/api/ai/jobs/${done}`)).status).toBe(404); // not someone else's
      expect((await b.get('/api/ai/queue')).body).toEqual([]);

      expect((await a.post('/api/ai/queue/clear')).body).toEqual({ cleared: 1 });
      expect((await queueOf(a)).map((q) => q.jobId)).toEqual([waiting]);
      await ai.processBatch();
      expect((await a.delete(`/api/ai/jobs/${waiting}`)).status).toBe(204);
      expect(await queueOf(a)).toEqual([]);
      expect((await txs(a)).total).toBe(2); // dismissing never removes the transaction
    });

    it('removing a waiting entry deletes it: nothing is classified or saved, and the credit is returned', async () => {
      await makeAccount(a, { isDefault: true });
      const id = await submit(a, 'Lunch 250');
      expect((await a.get('/api/ai/status')).body.used).toBe(1);
      expect((await a.delete(`/api/ai/jobs/${id}`)).status).toBe(204);
      expect(await ctx.prisma.aiJob.count({ where: { id } })).toBe(0);
      expect((await a.get('/api/ai/status')).body.used).toBe(0);
      await ai.processBatch();
      expect(calls).toHaveLength(0);
      expect((await txs(a)).total).toBe(0);
      expect((await a.delete(`/api/ai/jobs/${id}`)).status).toBe(404);
    });

    it('removing an entry while the AI is working on it creates no transaction', async () => {
      await makeAccount(a, { isDefault: true });
      const id = await submit(a, 'Lunch 250');
      let release!: () => void;
      model = (p) => new Promise((r) => { release = () => r(fakeModel(p)); });
      const running = ai.processBatch();
      await new Promise((r) => setTimeout(r, 50));
      expect((await a.delete(`/api/ai/jobs/${id}`)).status).toBe(204);
      release(); await running;
      await ai.processBatch();
      expect((await txs(a)).total).toBe(0);
      expect(await queueOf(a)).toEqual([]);
    });

    it('removing a saved entry only hides it - the transaction stays', async () => {
      await makeAccount(a, { isDefault: true });
      const id = await submit(a, 'Lunch 250');
      await ai.processBatch();
      expect((await a.delete(`/api/ai/jobs/${id}`)).status).toBe(204);
      expect(await queueOf(a)).toEqual([]);
      expect((await txs(a)).total).toBe(1);
      await ai.processBatch();
      expect((await txs(a)).total).toBe(1);
    });

    it('refuses to save from jobs that are not completed or belong to someone else', async () => {
      await makeAccount(a); await makeAccount(b);
      const pending = await submit(a, 'Lunch 250');
      const body = { title: 'Lunch', amount: rs(250), kind: 'EXPENSE', aiJobId: pending };
      expect((await a.post('/api/transactions').send(body)).status).toBe(400);
      await ai.processBatch();
      expect((await b.post('/api/transactions').send(body)).status).toBe(400);
    });
  });

  it('shows the remaining daily allowance, refunds failed entries and refuses once it is used up', async () => {
    const saved = ctx.app.get(AiService)['config'].ai.dailyLimit;
    ctx.app.get(AiService)['config'].ai.dailyLimit = 3;
    try {
      expect((await a.get('/api/ai/status')).body).toEqual({ enabled: true, dailyLimit: 3, used: 0, remaining: 3 });
      const first = await submit(a, 'Lunch 1');
      await submit(a, 'Lunch 2');
      expect((await a.get('/api/ai/status')).body).toMatchObject({ used: 2, remaining: 1 });
      await ctx.prisma.aiJob.update({ where: { id: first }, data: { status: 'FAILED' } });
      expect((await a.get('/api/ai/status')).body).toMatchObject({ used: 1, remaining: 2 });
      await submit(a, 'Lunch 3'); await submit(a, 'Lunch 4');
      const r = await a.post('/api/ai/transactions/classify').send({ text: 'Lunch 5' });
      expect(r.status).toBe(429);
      expect(r.body.message).toMatch(/daily AI limit/i);
      expect((await b.get('/api/ai/status')).body.remaining).toBe(3); // per user
    } finally { ctx.app.get(AiService)['config'].ai.dailyLimit = saved; }
  });

  describe('AI unavailable / not configured', () => {
    it('manual entry keeps working while the AI server is down', async () => {
      model = () => { throw new AiUnavailableError('down'); };
      await makeAccount(a);
      await submit(a, 'Lunch 250');
      await ai.processBatch();
      const r = await a.post('/api/transactions').send({ title: 'Manual', amount: rs(10), kind: 'EXPENSE' });
      expect(r.status).toBe(201);
    });

    it('reports disabled and refuses submissions when OLLAMA_BASE_URL is unset', async () => {
      const saved = process.env.OLLAMA_BASE_URL;
      delete process.env.OLLAMA_BASE_URL;
      const off = await createApp();
      try {
        const u = await signUp(off.app, 'off');
        expect((await u.get('/api/ai/status')).body).toMatchObject({ enabled: false });
        expect((await u.post('/api/ai/transactions/classify').send({ text: 'Lunch 250' })).status).toBe(503);
      } finally { await off.close(); process.env.OLLAMA_BASE_URL = saved; }
    });
  });
});

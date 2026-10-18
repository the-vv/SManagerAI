import { AutomationsService } from '../src/automations/automations.service';
import { Agent, TestCtx, addTx, categoryId, createApp, makeAccount, rs, signUp } from './utils';

const at = (iso: string) => () => new Date(iso);

describe('automations', () => {
  let ctx: TestCtx;
  let svc: AutomationsService;
  let a: Agent;
  let accountId: string;

  beforeAll(async () => {
    ctx = await createApp();
    svc = ctx.app.get(AutomationsService);
  });
  afterAll(async () => { await ctx.close(); });
  beforeEach(async () => {
    svc.clock = at('2026-04-15T12:00:00+05:30');
    a = await signUp(ctx.app, 'auto');
    accountId = (await makeAccount(a, { openingBalance: rs(100000), openingDate: '2025-12-01' })).id;
  });

  const create = (body: Record<string, unknown>) =>
    a.post('/api/automations').send({
      title: 'Rent', kind: 'EXPENSE', amount: rs(1000), accountId, frequency: 'MONTHLY',
      startDate: '2026-01-31', mode: 'AUTO', backfill: true, ...body,
    });
  const txs = async (q: Record<string, string> = {}) => (await a.get('/api/transactions').query({ pageSize: 100, sort: 'date', dir: 'asc', ...q })).body;

  it('records every due occurrence once, handling short months, and labels them as automatic', async () => {
    const res = await create({});
    expect(res.status).toBe(201);
    const list = await txs();
    expect(list.items.map((t: { occurredAt: string }) => t.occurredAt.slice(0, 10))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    expect(list.items.every((t: { source: string; automationId: string }) => t.source === 'AUTOMATION_AUTO' && t.automationId === res.body.id)).toBe(true);
    expect(res.body.nextRunDate).toBe('2026-04-30');

    const ex = await a.get(`/api/automations/${res.body.id}/executions`);
    expect(ex.body).toHaveLength(3);
    expect(ex.body.every((e: { status: string }) => e.status === 'SUCCESS')).toBe(true);
    expect((await txs({ origin: 'AUTOMATION' })).total).toBe(3);
    expect((await txs({ origin: 'MANUAL' })).total).toBe(0);
  });

  it('is idempotent: repeated runs, parallel runs and a restart never duplicate', async () => {
    await create({});
    await Promise.all([svc.processAllDue(), svc.processAllDue(), svc.processAllDue()]);
    await svc.processAllDue();
    expect((await txs()).total).toBe(3);

    // "restart": a brand-new application instance on the same database
    const second = await createApp();
    try {
      const svc2 = second.app.get(AutomationsService);
      svc2.clock = svc.clock;
      await svc2.processAllDue();
    } finally {
      await second.close();
    }
    expect((await txs()).total).toBe(3);
  });

  it('the database itself rejects a duplicate occurrence', async () => {
    const auto = (await create({})).body;
    const owner = (await ctx.prisma.automation.findUnique({ where: { id: auto.id } }))!.ownerId;
    await expect(
      ctx.prisma.automationExecution.create({
        data: { ownerId: owner, automationId: auto.id, scheduledFor: '2026-01-31', occurrenceKey: `${auto.id}:2026-01-31`, status: 'SUCCESS', amount: 1n },
      }),
    ).rejects.toThrow();
    await expect(
      ctx.prisma.transaction.create({
        data: { ownerId: owner, accountId, kind: 'EXPENSE', amount: 1n, title: 'dup', occurredAt: new Date(), automationId: auto.id, occurrenceDate: '2026-01-31' },
      }),
    ).rejects.toThrow();
  });

  it('recovers missed occurrences after downtime', async () => {
    await create({});
    svc.clock = at('2026-07-01T09:00:00+05:30'); // app "was down" for ~2.5 months
    await svc.processAllDue();
    const dates = (await txs()).items.map((t: { occurredAt: string }) => t.occurredAt.slice(0, 10));
    expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
  });

  it('does not start in the past unless backfill is requested', async () => {
    const r = await create({ backfill: false, startDate: '2026-01-10', frequency: 'WEEKLY' });
    expect(r.body.nextRunDate >= '2026-04-15').toBe(true);
    expect((await txs()).total).toBe(r.body.nextRunDate === '2026-04-15' ? 1 : 0);
  });

  it('reminder mode waits for confirmation, allows overriding the amount, and cannot be confirmed twice', async () => {
    const bills = await categoryId(a, 'Bills');
    const auto = (await create({ mode: 'REMINDER', title: 'Electricity', startDate: '2026-04-10', categoryId: bills })).body;
    expect((await txs()).total).toBe(0); // nothing recorded automatically

    const pending = (await a.get('/api/automations/pending')).body;
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ title: 'Electricity', scheduledFor: '2026-04-10', status: 'PENDING', amount: rs(1000) });
    expect((await a.get('/api/automations/notifications')).body.pending).toHaveLength(1);

    await a.post(`/api/automations/executions/${pending[0].id}/confirm`).send({ amount: rs(1234) }).expect(204);
    const list = await txs();
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ amount: rs(1234), source: 'AUTOMATION_CONFIRMED', title: 'Electricity' });
    expect((await a.post(`/api/automations/executions/${pending[0].id}/confirm`).send({})).status).toBe(400);
    expect((await a.get('/api/automations/pending')).body).toHaveLength(0);

    // next month's reminder, which the user skips
    svc.clock = at('2026-05-11T09:00:00+05:30');
    await svc.processAllDue();
    const p2 = (await a.get('/api/automations/pending')).body;
    expect(p2).toHaveLength(1);
    await a.post(`/api/automations/executions/${p2[0].id}/skip`).expect(204);
    expect((await txs()).total).toBe(1);
    const hist = (await a.get(`/api/automations/${auto.id}/executions`)).body.map((e: { status: string }) => e.status);
    expect(hist).toEqual(['SKIPPED', 'SUCCESS']);
  });

  it('pausing stops recording; resuming does not back-fill the paused period', async () => {
    const auto = (await create({ startDate: '2026-04-01', backfill: true })).body;
    expect((await txs()).total).toBe(1);
    await a.patch(`/api/automations/${auto.id}`).send({ isEnabled: false }).expect(200);
    svc.clock = at('2026-07-20T09:00:00+05:30');
    await svc.processAllDue();
    expect((await txs()).total).toBe(1);
    const resumed = await a.patch(`/api/automations/${auto.id}`).send({ isEnabled: true });
    expect(resumed.body.nextRunDate).toBe('2026-08-01');
    await svc.processAllDue();
    expect((await txs()).total).toBe(1);
    svc.clock = at('2026-08-01T09:00:00+05:30');
    await svc.processAllDue();
    expect((await txs()).total).toBe(2);
  });

  it('records failures without blocking later occurrences, and failed runs can be retried', async () => {
    const other = await makeAccount(a, { name: 'Other', openingDate: '2025-12-01' });
    const auto = (await create({ accountId: other.id, startDate: '2026-04-01', backfill: true })).body;
    expect((await txs()).total).toBe(1);
    await a.patch(`/api/accounts/${other.id}`).send({ isActive: false }).expect(200);
    svc.clock = at('2026-06-15T09:00:00+05:30');
    await svc.processAllDue();
    const failed = (await a.get('/api/automations/pending')).body;
    expect(failed.map((f: { status: string }) => f.status)).toEqual(['FAILED', 'FAILED']); // 1 May, 1 Jun
    expect(failed[0].error).toMatch(/inactive/i);
    expect((await a.get(`/api/automations/${auto.id}`)).body.nextRunDate).toBe('2026-07-01'); // schedule kept moving

    await a.patch(`/api/accounts/${other.id}`).send({ isActive: true }).expect(200);
    await a.post(`/api/automations/executions/${failed[0].id}/confirm`).send({}).expect(204);
    expect((await txs()).total).toBe(2);
  });

  it('"make this recurring" on a transaction does not record the first occurrence twice', async () => {
    const res = await a.post('/api/transactions').send({
      title: 'Netflix', amount: rs(649), kind: 'EXPENSE', accountId, occurredAt: '2026-04-05T10:00:00+05:30',
      automation: { frequency: 'MONTHLY', mode: 'AUTO' },
    });
    expect(res.status).toBe(201);
    const autos = (await a.get('/api/automations')).body;
    expect(autos).toHaveLength(1);
    expect(autos[0]).toMatchObject({ title: 'Netflix', nextRunDate: '2026-05-05', frequency: 'MONTHLY', dayOfMonth: 5 });
    await svc.processAllDue();
    expect((await txs()).total).toBe(1);
    svc.clock = at('2026-05-05T10:00:00+05:30');
    await svc.processAllDue();
    expect((await txs()).total).toBe(2);
    expect((await a.get(`/api/automations/${autos[0].id}/executions`)).body).toHaveLength(2);
  });

  it('respects end dates, lists upcoming occurrences and validates schedules', async () => {
    const auto = (await create({ frequency: 'CUSTOM', customEvery: 10, customUnit: 'DAY', startDate: '2026-04-10', endDate: '2026-05-05', backfill: true })).body;
    // 10 Apr (past) recorded now; 20 Apr and 30 Apr later; ends before 10 May
    expect((await txs()).total).toBe(1);
    svc.clock = at('2026-05-30T09:00:00+05:30');
    await svc.processAllDue();
    expect((await txs()).total).toBe(3);
    expect((await a.get(`/api/automations/${auto.id}`)).body).toMatchObject({ nextRunDate: null, finished: true });

    const m = (await create({ title: 'SIP', startDate: '2026-06-05', backfill: false })).body;
    const up = (await a.get('/api/automations/upcoming').query({ days: 90 })).body;
    expect(up.filter((u: { automationId: string }) => u.automationId === m.id).map((u: { date: string }) => u.date)).toEqual(['2026-06-05', '2026-07-05', '2026-08-05']);
    const bad = (b: object) => a.post('/api/automations').send({ title: 'x', kind: 'EXPENSE', amount: 1, accountId, frequency: 'MONTHLY', startDate: '2026-02-01', ...b });
    expect((await bad({ frequency: 'CUSTOM' })).status).toBe(400);
    expect((await bad({ startDate: '2026-02-30' })).status).toBe(400);
    expect((await bad({ endDate: '2026-01-01' })).status).toBe(400);
  });

  it('recurring income stays consistent between dashboard and reports', async () => {
    await create({ title: 'Salary', kind: 'INCOME', amount: rs(50000), startDate: '2026-04-01' });
    await addTx(a, { title: 'Snack', amount: rs(100), kind: 'EXPENSE', occurredAt: '2026-04-03T10:00:00+05:30', accountId });
    const d = (await a.get('/api/dashboard').query({ month: '2026-04' })).body;
    expect(d.summary).toMatchObject({ income: rs(50000), expense: rs(100) });
    const rep = (await a.get('/api/reports').query({ from: '2026-04-01', to: '2026-04-30' })).body;
    expect(rep.summary.income).toBe(d.summary.income);
    expect(rep.recurring.monthlyIncome).toBe(rs(50000));
  });
});

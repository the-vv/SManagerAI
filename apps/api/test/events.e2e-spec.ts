import { Agent, TestCtx, createApp, makeAccount, rs, signUp } from './utils.js';

describe('events (trip tracking)', () => {
  let ctx: TestCtx;
  let a: Agent;
  let b: Agent;
  let accountId: string;

  beforeAll(async () => {
    ctx = await createApp();
    a = await signUp(ctx.app, 'ea'); b = await signUp(ctx.app, 'eb');
    accountId = (await makeAccount(a)).id;
  });
  afterAll(async () => { await ctx.close(); });

  const tx = (body: Record<string, unknown>) =>
    a.post('/api/transactions').send({ kind: 'EXPENSE', occurredAt: '2026-03-10T10:00:00Z', accountId, ...body });

  it('tracks spending per event, filters by it and keeps transactions when the event is deleted', async () => {
    const ev = (await a.post('/api/events').send({ name: 'Ooty trip', budget: rs(5000) })).body;
    expect((await a.post('/api/events').send({ name: 'Ooty trip' })).status).toBe(409);

    expect((await tx({ title: 'Hotel', amount: rs(2000), eventId: ev.id })).status).toBe(201);
    expect((await tx({ title: 'Fuel', amount: rs(500), eventId: ev.id })).status).toBe(201);
    const outside = (await tx({ title: 'Groceries', amount: rs(300) })).body;
    expect(outside.event).toBeNull();

    const list = (await a.get('/api/events')).body;
    expect(list[0]).toMatchObject({ name: 'Ooty trip', expense: rs(2500), income: 0, count: 2, budget: rs(5000) });
    const detail = (await a.get(`/api/events/${ev.id}`)).body;
    expect(detail).toMatchObject({ expense: rs(2500), count: 2 });
    expect(detail.categories[0]).toMatchObject({ name: 'Uncategorized', total: rs(2500) });

    const filtered = (await a.get('/api/transactions').query({ eventId: ev.id })).body;
    expect(filtered.total).toBe(2);
    expect(filtered.summary.expense).toBe(rs(2500));
    expect(filtered.items[0].event).toMatchObject({ id: ev.id, name: 'Ooty trip' });

    // tag / untag an existing transaction
    const tagged = await a.patch(`/api/transactions/${outside.id}`).send({ eventId: ev.id });
    expect(tagged.body.event.id).toBe(ev.id);
    expect((await a.patch(`/api/transactions/${outside.id}`).send({ eventId: null })).body.event).toBeNull();

    expect((await a.delete(`/api/events/${ev.id}`)).status).toBe(204);
    expect((await a.get('/api/transactions')).body.total).toBe(3);
  });

  it('keeps events private to their owner', async () => {
    const ev = (await a.post('/api/events').send({ name: 'Private' })).body;
    expect((await b.get(`/api/events/${ev.id}`)).status).toBe(404);
    expect((await b.get('/api/events')).body).toEqual([]);
    const bAcc = (await makeAccount(b)).id;
    const r = await b.post('/api/transactions').send({ title: 'x', amount: 100, kind: 'EXPENSE', accountId: bAcc, eventId: ev.id });
    expect(r.status).toBe(404);
  });
});

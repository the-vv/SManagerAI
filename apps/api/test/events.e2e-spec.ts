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

describe('event people and shared expenses', () => {
  let ctx: TestCtx;
  let a: Agent;
  let other: Agent;
  let accountId: string;

  beforeAll(async () => {
    ctx = await createApp();
    a = await signUp(ctx.app, 'pa'); other = await signUp(ctx.app, 'pb');
    accountId = (await makeAccount(a, { openingBalance: rs(10000) })).id;
  });
  afterAll(async () => { await ctx.close(); });

  it("records other people's expenses without touching accounts, and splits the total equally", async () => {
    const ev = (await a.post('/api/events').send({ name: 'Goa' })).body;
    await a.post('/api/transactions').send({ title: 'Hotel', amount: rs(900), kind: 'EXPENSE', accountId, eventId: ev.id, occurredAt: '2026-03-10T10:00:00Z' });
    const before = (await a.get(`/api/accounts/${accountId}`)).body.balance;

    // inline: a new person is created by name; the same name later is reused
    expect((await a.post(`/api/events/${ev.id}/expenses`).send({ title: 'Dinner', amount: rs(600), personName: 'Ravi' })).status).toBe(201);
    expect((await a.post(`/api/events/${ev.id}/expenses`).send({ title: 'Taxi', amount: rs(300), personName: 'Ravi' })).status).toBe(201);
    const meera = (await a.post(`/api/events/${ev.id}/people`).send({ name: 'Meera' })).body;
    expect((await a.get('/api/people')).body.map((p: { name: string }) => p.name)).toEqual(['Meera', 'Ravi']);

    expect((await a.get(`/api/accounts/${accountId}`)).body.balance).toBe(before); // untouched
    expect((await a.get('/api/transactions')).body.total).toBe(1);

    const d = (await a.get(`/api/events/${ev.id}`)).body;
    expect(d).toMatchObject({ expense: rs(900), othersExpense: rs(900), totalCost: rs(1800) });
    expect(d.members.map((m: { name: string }) => m.name)).toEqual(['You', 'Meera', 'Ravi']);
    const by = Object.fromEntries(d.members.map((m: { name: string }) => [m.name, m]));
    expect(by.You).toMatchObject({ spent: rs(900), share: rs(600), balance: rs(300) });
    expect(by.Meera).toMatchObject({ spent: 0, share: rs(600), balance: -rs(600) });
    expect(by.Ravi).toMatchObject({ spent: rs(900), share: rs(600), balance: rs(300) });
    expect(d.expenses).toHaveLength(2);

    // reuse in a second event
    const ev2 = (await a.post('/api/events').send({ name: 'Ooty' })).body;
    await a.post(`/api/events/${ev2.id}/expenses`).send({ title: 'Lunch', amount: rs(100), personId: meera.id });
    expect((await a.get('/api/people')).body).toHaveLength(2);
    expect((await a.get('/api/events')).body.find((e: { id: string }) => e.id === ev2.id).othersExpense).toBe(rs(100));

    // edit / delete; a person with expenses cannot be removed
    expect((await a.delete(`/api/events/${ev2.id}/people/${meera.id}`)).status).toBe(409);
    const x = d.expenses[0];
    expect((await a.patch(`/api/events/${ev.id}/expenses/${x.id}`).send({ amount: rs(1) })).status).toBe(204);
    expect((await a.delete(`/api/events/${ev.id}/expenses/${x.id}`)).status).toBe(204);
    expect((await a.get(`/api/events/${ev.id}`)).body.expenses).toHaveLength(1);
  });

  it('keeps shares exact when the total does not divide evenly and rejects other users people', async () => {
    const ev = (await a.post('/api/events').send({ name: 'Odd' })).body;
    await a.post(`/api/events/${ev.id}/expenses`).send({ title: 'x', amount: 100, personName: 'P1' });
    await a.post(`/api/events/${ev.id}/people`).send({ name: 'P2' });
    const d = (await a.get(`/api/events/${ev.id}`)).body;
    expect(d.members.reduce((s: number, m: { share: number }) => s + m.share, 0)).toBe(100);
    const oe = (await other.post('/api/events').send({ name: 'Theirs' })).body;
    const personId = (await a.get('/api/people')).body[0].id;
    const bad = await other.post(`/api/events/${oe.id}/expenses`).send({ title: 'x', amount: 100, personId });
    expect(bad.status).toBe(404);
  });
});

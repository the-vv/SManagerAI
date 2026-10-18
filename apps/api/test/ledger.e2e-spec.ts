import request from 'supertest';
import { Agent, TestCtx, addTx, categoryId, createApp, dashboard, makeAccount, rs, signUp } from './utils.js';

describe('ledger: balances, carry-forward, transfers, adjustments', () => {
  let ctx: TestCtx;
  let a: Agent;

  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.close(); });
  beforeEach(async () => { a = await signUp(ctx.app, 'ledger'); });

  it('carries the closing balance forward into the next month (spec example)', async () => {
    const acc = await makeAccount(a, { openingBalance: rs(25000), openingDate: '2026-08-01' });
    await addTx(a, { title: 'Salary', amount: rs(10000), kind: 'INCOME', occurredAt: '2026-09-03T10:00:00+05:30', accountId: acc.id });
    await addTx(a, { title: 'Rent', amount: rs(5000), kind: 'EXPENSE', occurredAt: '2026-09-05T10:00:00+05:30', accountId: acc.id });

    const aug = await dashboard(a, '2026-08');
    expect(aug.period).toMatchObject({ opening: rs(25000), closing: rs(25000), income: 0, expense: 0 });

    const sep = await dashboard(a, '2026-09');
    expect(sep.period.opening).toBe(rs(25000));
    expect(sep.summary).toMatchObject({ income: rs(10000), expense: rs(5000), net: rs(5000) });
    expect(sep.period.closing).toBe(rs(30000));

    // a month with no activity neither resets nor duplicates anything
    const oct = await dashboard(a, '2026-10');
    expect(oct.period).toMatchObject({ opening: rs(30000), closing: rs(30000) });
    // no carry-forward transactions exist
    const list = await a.get('/api/transactions').query({ accountId: acc.id });
    expect(list.body.total).toBe(2);
  });

  it('recalculates when backdated transactions are added, edited and deleted', async () => {
    const acc = await makeAccount(a, { openingBalance: rs(1000), openingDate: '2026-01-01' });
    await addTx(a, { title: 'Pay', amount: rs(500), kind: 'INCOME', occurredAt: '2026-03-10T10:00:00+05:30', accountId: acc.id });
    expect((await dashboard(a, '2026-04')).period.opening).toBe(rs(1500));

    const back = await addTx(a, { title: 'Backdated', amount: rs(200), kind: 'EXPENSE', occurredAt: '2026-02-01T10:00:00+05:30', accountId: acc.id });
    expect((await dashboard(a, '2026-04')).period.opening).toBe(rs(1300));
    expect((await dashboard(a, '2026-02')).period.closing).toBe(rs(800));

    const edit = await a.patch(`/api/transactions/${back.id}`).send({ amount: rs(300) });
    expect(edit.status).toBe(200);
    expect((await dashboard(a, '2026-04')).period.opening).toBe(rs(1200));

    // move it to a later month: earlier months change, later ones are unaffected overall
    await a.patch(`/api/transactions/${back.id}`).send({ occurredAt: '2026-04-02T10:00:00+05:30' });
    expect((await dashboard(a, '2026-02')).period.closing).toBe(rs(1000));
    expect((await dashboard(a, '2026-04')).period.opening).toBe(rs(1500));
    expect((await dashboard(a, '2026-04')).period.closing).toBe(rs(1200));

    await a.delete(`/api/transactions/${back.id}`).expect(204);
    expect((await dashboard(a, '2026-04')).period.closing).toBe(rs(1500));
  });

  it('exact money: 0.10 + 0.20 style sums do not drift', async () => {
    const acc = await makeAccount(a);
    for (let i = 0; i < 30; i++) {
      await addTx(a, { title: `t${i}`, amount: 10, kind: 'INCOME', occurredAt: '2026-05-10T10:00:00+05:30', accountId: acc.id });
    }
    await addTx(a, { title: 'x', amount: 20, kind: 'EXPENSE', occurredAt: '2026-05-11T10:00:00+05:30', accountId: acc.id });
    const d = await dashboard(a, '2026-05');
    expect(d.summary).toMatchObject({ income: 300, expense: 20, net: 280 });
  });

  it('validates amounts and dates', async () => {
    const acc = await makeAccount(a, { openingDate: '2026-06-01' });
    const post = (b: object) => a.post('/api/transactions').send({ title: 'x', kind: 'EXPENSE', accountId: acc.id, ...b });
    expect((await post({ amount: 0 })).status).toBe(400);
    expect((await post({ amount: -5 })).status).toBe(400);
    expect((await post({ amount: 12.5 })).status).toBe(400);
    expect((await post({ amount: 100, occurredAt: 'not-a-date' })).status).toBe(400);
    expect((await post({ amount: 100, occurredAt: '2026-05-31T10:00:00+05:30' })).status).toBe(400); // before opening
    expect((await a.post('/api/transactions').send({ amount: 100, kind: 'EXPENSE', accountId: acc.id })).status).toBe(400); // no title
    expect((await post({ amount: 100 })).status).toBe(201);
  });

  it('uses the default account when none is given and supports uncategorized transactions', async () => {
    const one = await makeAccount(a);
    expect(one.isDefault).toBe(true);
    const two = await makeAccount(a, { isDefault: true });
    expect((await a.get(`/api/accounts/${one.id}`)).body.isDefault).toBe(false);
    const t = await a.post('/api/transactions').send({ title: 'Coffee', amount: 15000, kind: 'EXPENSE' });
    expect(t.status).toBe(201);
    expect(t.body.account.id).toBe(two.id);
    expect(t.body.category).toBeNull();
  });

  it('transfers are linked, atomic, and never counted as income or expense', async () => {
    const bank = await makeAccount(a, { name: 'Bank', openingBalance: rs(10000) });
    const cash = await makeAccount(a, { name: 'Wallet', type: 'CASH', openingBalance: 0 });
    await addTx(a, { title: 'Salary', amount: rs(2000), kind: 'INCOME', occurredAt: '2026-05-02T10:00:00+05:30', accountId: bank.id });

    const tr = await a.post('/api/transfers').send({
      fromAccountId: bank.id, toAccountId: cash.id, amount: rs(3000), occurredAt: '2026-05-04T10:00:00+05:30',
    });
    expect(tr.status).toBe(201);

    const all = await dashboard(a, '2026-05');
    expect(all.summary).toMatchObject({ income: rs(2000), expense: 0, net: rs(2000) });
    expect(all.period.closing).toBe(rs(12000)); // money only moved between accounts
    expect(all.period.transfersNet).toBe(0);

    const bankD = await dashboard(a, '2026-05', bank.id);
    expect(bankD.summary).toMatchObject({ income: rs(2000), expense: 0 });
    expect(bankD.period).toMatchObject({ opening: rs(10000), transfersNet: -rs(3000), closing: rs(9000) });
    const cashD = await dashboard(a, '2026-05', cash.id);
    expect(cashD.summary).toMatchObject({ income: 0, expense: 0 });
    expect(cashD.period.closing).toBe(rs(3000));

    // listing: once in "all", per-leg when filtering by account
    const listAll = await a.get('/api/transactions').query({ month: '2026-05' });
    expect(listAll.body.items.filter((i: { transfer: unknown }) => i.transfer)).toHaveLength(1);
    expect(listAll.body.summary).toMatchObject({ income: rs(2000), expense: 0 });

    // edit transfer amount: both legs follow
    await a.patch(`/api/transfers/${tr.body.id}`).send({ amount: rs(1000) }).expect(200);
    expect((await dashboard(a, '2026-05', cash.id)).period.closing).toBe(rs(1000));
    // legs cannot be edited/deleted as plain transactions
    const leg = (await a.get('/api/transactions').query({ accountId: cash.id })).body.items[0];
    expect((await a.delete(`/api/transactions/${leg.id}`)).status).toBe(400);
    // delete transfer removes both legs
    await a.delete(`/api/transfers/${tr.body.id}`).expect(204);
    expect((await dashboard(a, '2026-05', cash.id)).period.closing).toBe(0);
    expect((await dashboard(a, '2026-05', bank.id)).period.closing).toBe(rs(12000));

    expect((await a.post('/api/transfers').send({ fromAccountId: bank.id, toAccountId: bank.id, amount: 100 })).status).toBe(400);
  });

  it('credit card debt is never added to available cash; paying the card is a transfer', async () => {
    const bank = await makeAccount(a, { name: 'Bank', openingBalance: rs(50000) });
    const card = await makeAccount(a, { name: 'Card', type: 'CREDIT_CARD', openingBalance: 0 });
    await addTx(a, { title: 'Laptop', amount: rs(20000), kind: 'EXPENSE', occurredAt: '2026-05-05T10:00:00+05:30', accountId: card.id });

    let acc = (await a.get('/api/accounts')).body;
    expect(acc.items.find((i: { id: string }) => i.id === card.id).balance).toBe(-rs(20000));
    expect(acc.totals).toEqual({ available: rs(50000), creditDue: rs(20000), netWorth: rs(30000) });
    expect((await dashboard(a, '2026-05')).summary.expense).toBe(rs(20000)); // counted once, when spent

    await a.post('/api/transfers').send({ fromAccountId: bank.id, toAccountId: card.id, amount: rs(20000), occurredAt: '2026-05-20T10:00:00+05:30' }).expect(201);
    acc = (await a.get('/api/accounts')).body;
    expect(acc.totals).toEqual({ available: rs(30000), creditDue: 0, netWorth: rs(30000) });
    expect((await dashboard(a, '2026-05')).summary.expense).toBe(rs(20000)); // payment did not double count
  });

  it('balance adjustments are separate from transactions and support target balances', async () => {
    const acc = await makeAccount(a, { openingBalance: rs(1000) });
    await addTx(a, { title: 'Lunch', amount: rs(100), kind: 'EXPENSE', occurredAt: '2026-05-05T10:00:00+05:30', accountId: acc.id });

    const adj = await a.post(`/api/accounts/${acc.id}/adjustments`).send({
      date: '2026-05-31', targetBalance: rs(950), reason: 'Reconciled with bank statement',
    });
    expect(adj.status).toBe(201);
    expect(adj.body.amount).toBe(rs(50));

    const d = await dashboard(a, '2026-05', acc.id);
    expect(d.summary).toMatchObject({ income: 0, expense: rs(100) }); // adjustment is not income
    expect(d.period).toMatchObject({ adjustments: rs(50), closing: rs(950) });
    expect((await a.get('/api/accounts').query({ date: '2026-05-20' })).body.items.find((i: { id: string }) => i.id === acc.id).balance).toBe(rs(900));
    expect((await a.post(`/api/accounts/${acc.id}/adjustments`).send({ reason: '', amount: 5 })).status).toBe(400);
    expect((await a.post(`/api/accounts/${acc.id}/adjustments`).send({ reason: 'x', amount: 5, targetBalance: 5 })).status).toBe(400);

    await a.delete(`/api/accounts/${acc.id}/adjustments/${adj.body.id}`).expect(204);
    expect((await dashboard(a, '2026-05', acc.id)).period.closing).toBe(rs(900));
  });

  it('deactivating an account preserves history and moves the default', async () => {
    const one = await makeAccount(a, { name: 'One', openingBalance: rs(100) });
    const two = await makeAccount(a, { name: 'Two' });
    await addTx(a, { title: 'x', amount: 500, kind: 'EXPENSE', occurredAt: '2026-05-05T10:00:00+05:30', accountId: one.id });
    await a.patch(`/api/accounts/${one.id}`).send({ isActive: false }).expect(200);
    expect((await a.get(`/api/accounts/${two.id}`)).body.isDefault).toBe(true);
    expect((await a.get('/api/transactions').query({ accountId: one.id })).body.total).toBe(1);
    expect((await a.post('/api/transactions').send({ title: 'n', amount: 5, kind: 'EXPENSE', accountId: one.id })).status).toBe(409);
    expect((await a.delete(`/api/accounts/${one.id}`)).status).toBe(409); // has history
    expect((await a.post(`/api/accounts/${one.id}/default`)).status).toBe(400);
    expect((await a.get('/api/accounts').query({ date: '2026-12-31' })).body.totals.available).toBe(0); // inactive excluded
  });

  it('dashboard, transaction list and report agree on totals; filters by account and category work', async () => {
    const bank = await makeAccount(a, { name: 'B1', openingBalance: rs(100) });
    const cash = await makeAccount(a, { name: 'C1', type: 'CASH' });
    const food = await categoryId(a, 'Food');
    const rent = await categoryId(a, 'Rent');
    const salary = await categoryId(a, 'Salary');
    await addTx(a, { title: 'Salary', amount: rs(5000), kind: 'INCOME', occurredAt: '2026-07-01T10:00:00+05:30', accountId: bank.id, categoryId: salary });
    await addTx(a, { title: 'Pizza', amount: rs(400), kind: 'EXPENSE', occurredAt: '2026-07-10T10:00:00+05:30', accountId: cash.id, categoryId: food });
    await addTx(a, { title: 'Rent', amount: rs(2000), kind: 'EXPENSE', occurredAt: '2026-07-11T10:00:00+05:30', accountId: bank.id, categoryId: rent });
    await addTx(a, { title: 'Misc', amount: rs(50), kind: 'EXPENSE', occurredAt: '2026-07-31T23:30:00+05:30', accountId: bank.id }); // month boundary, uncategorized
    await addTx(a, { title: 'Next month', amount: rs(9), kind: 'EXPENSE', occurredAt: '2026-08-01T00:10:00+05:30', accountId: bank.id });

    const dash = await dashboard(a, '2026-07');
    const list = (await a.get('/api/transactions').query({ month: '2026-07' })).body;
    const rep = (await a.get('/api/reports').query({ from: '2026-07-01', to: '2026-07-31' })).body;
    expect(dash.summary).toMatchObject({ income: rs(5000), expense: rs(2450) });
    expect(list.summary).toMatchObject({ income: rs(5000), expense: rs(2450), net: rs(2550) });
    expect(rep.summary).toMatchObject({ income: rs(5000), expense: rs(2450), netMovement: rs(2550) });
    expect(rep.monthly).toHaveLength(1);
    expect(rep.monthly[0]).toMatchObject({ income: rs(5000), expense: rs(2450), closingBalance: rs(2650) });
    expect(dash.expenseByCategory.total).toBe(rs(2450));
    expect(rep.expenseByCategory.items.map((i: { name: string }) => i.name)).toEqual(['Rent', 'Food', 'Uncategorized']);
    expect(rep.expenseByCategory.items.reduce((s: number, i: { shareBp: number }) => s + i.shareBp, 0)).toBeGreaterThanOrEqual(9999);

    // per-account scoping
    const cashDash = await dashboard(a, '2026-07', cash.id);
    expect(cashDash.summary).toMatchObject({ income: 0, expense: rs(400) });
    const cashList = (await a.get('/api/transactions').query({ month: '2026-07', accountId: cash.id })).body;
    expect(cashList.summary.expense).toBe(rs(400));
    const cashRep = (await a.get('/api/reports').query({ from: '2026-07-01', to: '2026-07-31', accountId: cash.id })).body;
    expect(cashRep.summary.expense).toBe(rs(400));

    // category & text filters
    expect((await a.get('/api/transactions').query({ month: '2026-07', categoryId: food })).body.total).toBe(1);
    expect((await a.get('/api/transactions').query({ month: '2026-07', categoryId: 'none' })).body.total).toBe(1);
    expect((await a.get('/api/transactions').query({ month: '2026-07', q: 'pizz' })).body.total).toBe(1);
    expect((await a.get('/api/transactions').query({ month: '2026-07', kind: 'INCOME' })).body.total).toBe(1);
    expect((await a.get('/api/transactions').query({ month: '2026-07', pageSize: 2, page: 2 })).body.items).toHaveLength(2);
    expect((await a.get('/api/transactions').query({ month: '2026-07', sort: 'amount', dir: 'desc' })).body.items[0].title).toBe('Salary');
    // daily totals are present and match
    expect(list.dailyTotals['2026-07-10']).toEqual({ income: 0, expense: rs(400) });

    // month-over-month
    expect(rep.monthOverMonth).toMatchObject({ month: '2026-07', previousMonth: '2026-06', totalCurrent: rs(2450), totalPrevious: 0 });
    // CSV export honours the filter and escapes formulas
    await addTx(a, { title: '=HYPERLINK("x")', amount: 100, kind: 'EXPENSE', occurredAt: '2026-07-12T10:00:00+05:30', accountId: bank.id });
    const csv = await a.get('/api/transactions/export.csv').query({ month: '2026-07', q: 'HYPERLINK' });
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv.text).toContain('-1.00');
  });

  it('month boundaries follow the configured timezone', async () => {
    const acc = await makeAccount(a);
    // 2026-06-30 19:00 UTC == 2026-07-01 00:30 IST -> belongs to July in Asia/Kolkata
    await addTx(a, { title: 'edge', amount: 100, kind: 'EXPENSE', occurredAt: '2026-06-30T19:00:00Z', accountId: acc.id });
    expect((await dashboard(a, '2026-07')).summary.expense).toBe(100);
    expect((await dashboard(a, '2026-06')).summary.expense).toBe(0);
    await a.patch('/api/settings').send({ timezone: 'UTC' }).expect(200);
    expect((await dashboard(a, '2026-06')).summary.expense).toBe(100);
    expect((await a.patch('/api/settings').send({ timezone: 'Mars/Base' })).status).toBe(400);
  });

  it('settings and categories CRUD', async () => {
    const s = await a.get('/api/settings');
    expect(s.body).toMatchObject({ currency: 'INR', theme: 'dark', timezone: 'Asia/Kolkata' });
    expect((await a.patch('/api/settings').send({ theme: 'light' })).body.theme).toBe('light');
    const cat = await a.post('/api/categories').send({ name: 'Pets', type: 'EXPENSE' });
    expect(cat.status).toBe(201);
    expect(cat.body.color).toBeNull();
    expect((await a.post('/api/categories').send({ name: 'Pets', type: 'EXPENSE' })).status).toBe(409);
    expect((await a.post('/api/categories').send({ name: 'Bad', type: 'EXPENSE', color: 'red' })).status).toBe(400);
    await a.patch(`/api/categories/${cat.body.id}`).send({ isActive: false, color: '#112233' }).expect(200);
    expect((await a.get('/api/categories')).body.find((c: { name: string }) => c.name === 'Pets')).toBeUndefined();
    expect((await a.get('/api/categories').query({ includeInactive: 'true' })).body.find((c: { name: string }) => c.name === 'Pets').color).toBe('#112233');
    const acc = await makeAccount(a);
    const income = await categoryId(a, 'Salary');
    expect((await a.post('/api/transactions').send({ title: 'x', amount: 1, kind: 'EXPENSE', accountId: acc.id, categoryId: income })).status).toBe(409);
  });
});

describe('auth & ownership', () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await createApp(); });
  afterAll(async () => { await ctx.close(); });

  it('rejects unauthenticated access to every protected route', async () => {
    const http = request(ctx.app.getHttpServer());
    for (const path of ['/api/accounts', '/api/transactions', '/api/categories', '/api/automations', '/api/dashboard', '/api/reports', '/api/settings', '/api/auth/me']) {
      expect((await http.get(path)).status).toBe(401);
    }
    expect((await http.get('/api/health')).status).toBe(200);
  });

  it("never exposes or lets one user modify another user's data", async () => {
    const alice = await signUp(ctx.app, 'alice');
    const bob = await signUp(ctx.app, 'bob');
    const acc = await makeAccount(alice, { name: 'Alice acc', openingBalance: 1000 });
    const tx = await addTx(alice, { title: 'secret', amount: 100, kind: 'EXPENSE', occurredAt: '2026-05-05T10:00:00+05:30', accountId: acc.id });
    const cat = await categoryId(alice, 'Food');
    const auto = await alice.post('/api/automations').send({
      title: 'Rent', kind: 'EXPENSE', amount: 100, accountId: acc.id, frequency: 'MONTHLY', startDate: '2030-01-01',
    });
    expect(auto.status).toBe(201);

    // reads
    expect((await bob.get(`/api/accounts/${acc.id}`)).status).toBe(404);
    expect((await bob.get(`/api/transactions/${tx.id}`)).status).toBe(404);
    expect((await bob.get(`/api/automations/${auto.body.id}`)).status).toBe(404);
    expect((await bob.get('/api/transactions').query({ accountId: acc.id })).status).toBe(404);
    expect((await bob.get('/api/dashboard').query({ accountId: acc.id })).status).toBe(404);
    expect((await bob.get('/api/reports').query({ accountId: acc.id })).status).toBe(404);
    expect((await bob.get('/api/accounts')).body.items).toHaveLength(0);
    expect((await bob.get('/api/transactions')).body.total).toBe(0);
    expect((await bob.get('/api/automations')).body).toHaveLength(0);
    // writes
    expect((await bob.patch(`/api/transactions/${tx.id}`).send({ title: 'pwn' })).status).toBe(404);
    expect((await bob.delete(`/api/transactions/${tx.id}`)).status).toBe(404);
    expect((await bob.patch(`/api/accounts/${acc.id}`).send({ name: 'pwn' })).status).toBe(404);
    expect((await bob.patch(`/api/automations/${auto.body.id}`).send({ title: 'pwn' })).status).toBe(404);
    expect((await bob.delete(`/api/automations/${auto.body.id}`)).status).toBe(404);
    expect((await bob.post(`/api/accounts/${acc.id}/adjustments`).send({ amount: 5, reason: 'x' })).status).toBe(404);
    // cross-owner references on create
    const bobAcc = await makeAccount(bob);
    expect((await bob.post('/api/transactions').send({ title: 'x', amount: 5, kind: 'EXPENSE', accountId: acc.id })).status).toBe(404);
    expect((await bob.post('/api/transactions').send({ title: 'x', amount: 5, kind: 'EXPENSE', accountId: bobAcc.id, categoryId: cat })).status).toBe(404);
    expect((await bob.post('/api/transfers').send({ fromAccountId: bobAcc.id, toAccountId: acc.id, amount: 5 })).status).toBe(404);
    expect((await bob.patch(`/api/categories/${cat}`).send({ name: 'pwn' })).status).toBe(404);

    // alice's data is untouched
    expect((await alice.get(`/api/transactions/${tx.id}`)).body.title).toBe('secret');
  });

  it('logout revokes the session; sessions can be listed and revoked; password change works', async () => {
    const u = await signUp(ctx.app, 'sess');
    expect((await u.get('/api/auth/me')).status).toBe(200);
    expect((await u.get('/api/auth/sessions')).body).toHaveLength(1);
    const email = (await u.get('/api/auth/me')).body.email;

    const second = request.agent(ctx.app.getHttpServer());
    const login = await second.post('/api/auth/login').set('X-Client', 'native').send({ email, password: 'correct horse battery' });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy(); // native clients get the token in the body
    expect((await u.post('/api/auth/login').send({ email, password: 'correct horse battery' })).body.token).toBeUndefined();

    // bearer works without cookies
    expect((await request(ctx.app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`)).status).toBe(200);
    expect((await request(ctx.app.getHttpServer()).get('/api/auth/me').set('Authorization', 'Bearer nope')).status).toBe(401);

    expect((await second.post('/api/auth/login').send({ email, password: 'wrong password!!' })).status).toBe(401);
    expect((await second.post('/api/auth/login').send({ email: 'nobody@example.com', password: 'wrong password!!' })).status).toBe(401);

    await u.post('/api/auth/change-password').send({ currentPassword: 'correct horse battery', newPassword: 'another long password' }).expect(204);
    expect((await request(ctx.app.getHttpServer()).get('/api/auth/me').set('Authorization', `Bearer ${login.body.token}`)).status).toBe(401); // other sessions revoked
    expect((await u.get('/api/auth/me')).status).toBe(200);

    await u.post('/api/auth/logout').expect(204);
    expect((await u.get('/api/auth/me')).status).toBe(401);
  });

  it('validates input: unknown fields and weak passwords are rejected, errors share one shape', async () => {
    const http = request(ctx.app.getHttpServer());
    const r = await http.post('/api/auth/register').send({ email: 'bad', password: 'short', name: '' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ statusCode: 400, message: 'Validation failed' });
    expect(Array.isArray(r.body.details)).toBe(true);
    expect(r.body.path).toBeDefined();
    const u = await signUp(ctx.app, 'shape');
    expect((await u.post('/api/categories').send({ name: 'x', type: 'EXPENSE', ownerId: 'someone' })).status).toBe(400);
  });
});

describe('registration policy', () => {
  it('only the first user can register when ALLOW_REGISTRATION=false', async () => {
    const ctx = await createApp({ ALLOW_REGISTRATION: 'false' });
    try {
      await ctx.prisma.user.deleteMany();
      const first = await request(ctx.app.getHttpServer()).post('/api/auth/register').send({ email: 'one@example.com', password: 'correct horse battery', name: 'One' });
      expect(first.status).toBe(201);
      const second = await request(ctx.app.getHttpServer()).post('/api/auth/register').send({ email: 'two@example.com', password: 'correct horse battery', name: 'Two' });
      expect(second.status).toBe(403);
    } finally {
      await ctx.close();
    }
  });
});

describe('rate limiting', () => {
  it('throttles repeated login attempts', async () => {
    const ctx = await createApp({ RATE_LIMIT_ENABLED: 'true' });
    try {
      const http = request(ctx.app.getHttpServer());
      let last = 0;
      for (let i = 0; i < 12; i++) last = (await http.post('/api/auth/login').send({ email: 'x@example.com', password: 'nope-nope-nope' })).status;
      expect(last).toBe(429);
    } finally {
      process.env.RATE_LIMIT_ENABLED = 'false';
      await ctx.close();
    }
  });
});

import request from 'supertest';
import { normalizeInviteCode } from '../src/invites/invite-code.js';
import { Agent, TestCtx, createApp, signUp } from './utils.js';

const register = (ctx: TestCtx, body: Record<string, unknown>) =>
  request(ctx.app.getHttpServer()).post('/api/auth/register').send({ name: 'New', password: 'correct horse battery', ...body });
let n = 0;
const email = () => `invitee${++n}-${Date.now()}@example.com`;

describe('invite-only sign-up', () => {
  let ctx: TestCtx;
  let admin: Agent;
  let member: Agent;

  beforeAll(async () => {
    ctx = await createApp({ ALLOW_REGISTRATION: 'false' });
    await ctx.prisma.user.deleteMany(); // deterministic "first account" for this suite
  });
  afterAll(async () => { process.env.ALLOW_REGISTRATION = 'true'; await ctx.close(); });

  const invite = async (body: Record<string, unknown> = {}) => {
    const r = await admin.post('/api/invites').send(body);
    expect(r.status).toBe(201);
    return r.body as { id: string; code: string; expiresAt: string };
  };

  it('the first account is always allowed and becomes the admin; later ones are not admins', async () => {
    const cfg = await request(ctx.app.getHttpServer()).get('/api/auth/config');
    expect(cfg.body).toMatchObject({ registrationOpen: true, inviteRequired: false }); // empty system
    const first = await register(ctx, { email: email() });
    expect(first.status).toBe(201);
    expect(first.body.user.isAdmin).toBe(true);
    admin = request.agent(ctx.app.getHttpServer());
    await admin.post('/api/auth/login').send({ email: first.body.user.email, password: 'correct horse battery' });
    expect((await admin.get('/api/auth/me')).body.isAdmin).toBe(true);
  });

  it('closed sign-up needs an invite: public config says so, and a bare registration is refused', async () => {
    expect((await request(ctx.app.getHttpServer()).get('/api/auth/config')).body).toMatchObject({ registrationOpen: false, inviteRequired: true });
    const none = await register(ctx, { email: email() });
    expect(none.status).toBe(403);
    expect(none.body.message).toMatch(/invit/i);
    for (const inviteCode of ['', 'WRONG', 'ABCD-EFGH-JKMN-PQRS']) {
      expect((await register(ctx, { email: email(), inviteCode })).status).toBe(403);
    }
  });

  it('a valid invite registers exactly one account, is tolerant of how it is typed, and cannot be reused', async () => {
    const inv = await invite({ note: 'for Sam' });
    expect(inv.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
    const mail = email();
    const typed = ` ${inv.code.toLowerCase().replace(/-/g, ' ')} `; // lower case, spaces instead of dashes
    const ok = await register(ctx, { email: mail, inviteCode: typed });
    expect(ok.status).toBe(201);
    expect(ok.body.user.isAdmin).toBe(false);
    expect((await register(ctx, { email: email(), inviteCode: inv.code })).status).toBe(403); // already used

    const list = (await admin.get('/api/invites')).body as { id: string; status: string; note: string; usedBy: { email: string } | null }[];
    expect(list.find((i) => i.id === inv.id)).toMatchObject({ status: 'USED', note: 'for Sam', usedBy: { email: mail } });
  });

  it('only one of two simultaneous registrations can spend an invite', async () => {
    const inv = await invite();
    const [a, b] = await Promise.all([
      register(ctx, { email: email(), inviteCode: inv.code }), register(ctx, { email: email(), inviteCode: inv.code }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 403]);
  });

  it('expired and revoked invites are refused; a revoke only works while unused', async () => {
    const expired = await invite();
    await ctx.prisma.invite.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await register(ctx, { email: email(), inviteCode: expired.code })).status).toBe(403);

    const revoked = await invite();
    expect((await admin.delete(`/api/invites/${revoked.id}`)).status).toBe(204);
    expect((await register(ctx, { email: email(), inviteCode: revoked.code })).status).toBe(403);
    expect((await admin.delete(`/api/invites/${revoked.id}`)).status).toBe(404);

    const list = (await admin.get('/api/invites')).body as { id: string; status: string }[];
    expect(list.find((i) => i.id === expired.id)!.status).toBe('EXPIRED');
    expect(list.find((i) => i.id === revoked.id)!.status).toBe('REVOKED');
  });

  it('a failed registration (e-mail already taken, weak password) does not burn the invite', async () => {
    const inv = await invite();
    const me = await admin.get('/api/auth/me');
    expect((await register(ctx, { email: me.body.email, inviteCode: inv.code })).status).toBe(409);
    expect((await register(ctx, { email: email(), password: 'short', inviteCode: inv.code })).status).toBe(400);
    expect((await register(ctx, { email: email(), inviteCode: inv.code })).status).toBe(201); // still usable
  });

  it('only admins can create, list or revoke invites', async () => {
    const inv = await invite();
    const mail = email();
    const reg = await register(ctx, { email: mail, inviteCode: (await invite()).code });
    expect(reg.status).toBe(201);
    member = request.agent(ctx.app.getHttpServer());
    await member.post('/api/auth/login').send({ email: mail, password: 'correct horse battery' });
    expect((await member.get('/api/auth/me')).body.isAdmin).toBe(false);
    expect((await member.post('/api/invites').send({})).status).toBe(403);
    expect((await member.get('/api/invites')).status).toBe(403);
    expect((await member.delete(`/api/invites/${inv.id}`)).status).toBe(403);
    expect((await request(ctx.app.getHttpServer()).post('/api/invites').send({})).status).toBe(401);
  });

  it('stores only a hash of the code and validates note/expiry input', async () => {
    const inv = await invite({ expiresInDays: 3 });
    const row = await ctx.prisma.invite.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.codeHash).not.toContain(inv.code.replace(/-/g, ''));
    expect(JSON.stringify(row)).not.toContain(normalizeInviteCode(inv.code)!);
    expect(Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000)).toBe(3);
    expect((await admin.post('/api/invites').send({ expiresInDays: 400 })).status).toBe(400);
    expect((await admin.post('/api/invites').send({ unknown: 1 })).status).toBe(400);
    expect((await admin.get('/api/invites')).body.every((i: Record<string, unknown>) => !('code' in i) && !('codeHash' in i))).toBe(true);
  });

  it('open registration (ALLOW_REGISTRATION=true) still works without an invite', async () => {
    const open = await createApp({ ALLOW_REGISTRATION: 'true' });
    try {
      expect((await register(open, { email: email() })).status).toBe(201);
      expect((await request(open.app.getHttpServer()).get('/api/auth/config')).body).toMatchObject({ registrationOpen: true, inviteRequired: false });
    } finally { await open.close(); process.env.ALLOW_REGISTRATION = 'false'; }
  });
});

describe('invite codes', () => {
  it('normalises look-alikes and rejects malformed codes', () => {
    expect(normalizeInviteCode('abcd-efgh-jkmn-pqrs')).toBe('ABCDEFGHJKMNPQRS');
    expect(normalizeInviteCode('0O0O-1I1L-0000-1111')).toBe('0000111100001111');
    expect(normalizeInviteCode('too short')).toBeNull();
    expect(normalizeInviteCode('ABCD-EFGH-JKMN-PQR!')).toBeNull();
    expect(normalizeInviteCode('UUUU-UUUU-UUUU-UUUU')).toBeNull(); // U is not in the alphabet
  });
});

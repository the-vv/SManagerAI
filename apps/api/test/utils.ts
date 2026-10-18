import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { loadConfig } from '../src/common/config.js';
import { PrismaService } from '../src/database/prisma.service.js';

export type Agent = ReturnType<typeof request.agent>;

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  close: () => Promise<void>;
}

export async function createApp(env: Record<string, string> = {}): Promise<TestCtx> {
  Object.assign(process.env, { SCHEDULER_ENABLED: 'false', RATE_LIMIT_ENABLED: 'false', ALLOW_REGISTRATION: 'true', NODE_ENV: 'test', ...env });
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = mod.createNestApplication();
  configureApp(app, loadConfig());
  await app.init();
  return { app, prisma: app.get(PrismaService), close: () => app.close() };
}

let n = 0;
export async function signUp(app: INestApplication, name = 'user'): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent.post('/api/auth/register').send({
    email: `${name}${++n}-${Date.now()}@example.com`, password: 'correct horse battery', name,
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

/** Amounts in tests are written in rupees and converted to paise. */
export const rs = (r: number) => Math.round(r * 100);

export async function makeAccount(a: Agent, body: Record<string, unknown> = {}) {
  const res = await a.post('/api/accounts').send({
    name: `Acc ${Math.random().toString(36).slice(2, 7)}`, type: 'BANK', openingBalance: 0,
    openingDate: '2026-01-01', ...body,
  });
  if (res.status !== 201) throw new Error(`account failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string; balance: number; isDefault: boolean; name: string };
}

export async function addTx(
  a: Agent, body: { title: string; amount: number; kind: 'INCOME' | 'EXPENSE'; occurredAt: string; accountId?: string; categoryId?: string },
) {
  const res = await a.post('/api/transactions').send(body);
  if (res.status !== 201) throw new Error(`tx failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { id: string };
}

export async function categoryId(a: Agent, name: string): Promise<string> {
  const res = await a.get('/api/categories');
  return res.body.find((c: { name: string }) => c.name === name).id;
}

export async function dashboard(a: Agent, month: string, accountId?: string) {
  const res = await a.get('/api/dashboard').query({ month, ...(accountId ? { accountId } : {}) });
  expect(res.status).toBe(200);
  return res.body;
}

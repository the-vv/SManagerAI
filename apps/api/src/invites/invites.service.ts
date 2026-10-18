import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { generateInviteCode, hashInviteCode, normalizeInviteCode } from './invite-code.js';

export const INVALID_INVITE = 'This invite code is not valid or has expired.';
const DAY = 24 * 60 * 60 * 1000;

export type InviteStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

@Injectable()
export class InvitesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The plain code is returned exactly once; only its hash is stored. */
  async create(adminId: string, opts: { note?: string; expiresInDays?: number }) {
    const code = generateInviteCode();
    const days = opts.expiresInDays ?? 7;
    const invite = await this.prisma.invite.create({
      data: {
        codeHash: hashInviteCode(normalizeInviteCode(code)!), note: opts.note?.trim() || null,
        createdById: adminId, expiresAt: new Date(Date.now() + days * DAY),
      },
    });
    return { id: invite.id, code, note: invite.note, createdAt: invite.createdAt, expiresAt: invite.expiresAt };
  }

  async list(adminId: string, now = new Date()) {
    const rows = await this.prisma.invite.findMany({
      where: { createdById: adminId }, orderBy: { createdAt: 'desc' }, take: 100,
    });
    const usedBy = rows.map((r) => r.usedById).filter((id): id is string => !!id);
    const users = usedBy.length
      ? await this.prisma.user.findMany({ where: { id: { in: usedBy } }, select: { id: true, email: true, name: true } })
      : [];
    const byId = new Map(users.map((u) => [u.id, u]));
    return rows.map((r) => ({
      id: r.id, note: r.note, createdAt: r.createdAt, expiresAt: r.expiresAt, usedAt: r.usedAt,
      usedBy: r.usedById ? (byId.get(r.usedById) ?? null) : null,
      status: (r.revokedAt ? 'REVOKED' : r.usedAt ? 'USED' : r.expiresAt <= now ? 'EXPIRED' : 'ACTIVE') as InviteStatus,
    }));
  }

  /** Only an invite that is still unused can be revoked (a used one already created an account). */
  async revoke(adminId: string, id: string): Promise<void> {
    const r = await this.prisma.invite.updateMany({
      where: { id, createdById: adminId, usedAt: null, revokedAt: null }, data: { revokedAt: new Date() },
    });
    if (r.count === 0) throw new NotFoundException('Invite not found or already used');
  }

  /**
   * Atomically spends an invite (single use). Throws one generic error for every failure so the
   * response never reveals whether a code exists. Pair with `release` if account creation fails.
   */
  async claim(input: string, now = new Date()): Promise<string> {
    const normalized = normalizeInviteCode(input);
    if (!normalized) throw new ForbiddenException(INVALID_INVITE);
    const invite = await this.prisma.invite.findUnique({ where: { codeHash: hashInviteCode(normalized) } });
    if (!invite) throw new ForbiddenException(INVALID_INVITE);
    const r = await this.prisma.invite.updateMany({
      where: { id: invite.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now },
    });
    if (r.count !== 1) throw new ForbiddenException(INVALID_INVITE);
    return invite.id;
  }

  markUsedBy(inviteId: string, userId: string) {
    return this.prisma.invite.update({ where: { id: inviteId }, data: { usedById: userId } });
  }

  release(inviteId: string) {
    return this.prisma.invite.updateMany({ where: { id: inviteId }, data: { usedAt: null, usedById: null } });
  }
}

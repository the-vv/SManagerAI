import {
  BadRequestException, ConflictException, ForbiddenException, Inject, Injectable,
  NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { APP_CONFIG, AppConfig } from '../common/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { AuthUser } from '../common/auth.decorators.js';
import { InvitesService } from '../invites/invites.service.js';

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const DAY = 24 * 60 * 60 * 1000;

export interface SessionInfo {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  current: boolean;
}

@Injectable()
export class AuthService {
  private readonly google?: OAuth2Client;
  // Used to burn comparable time when the e-mail is unknown (mitigates user enumeration).
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly invites: InvitesService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {
    if (config.googleClientId) this.google = new OAuth2Client(config.googleClientId);
  }

  get googleEnabled(): boolean {
    return !!this.google;
  }

  /**
   * `registrationOpen`: anyone may sign up (first account, or ALLOW_REGISTRATION=true).
   * `inviteRequired`: sign-up is closed to the public but a valid invite code opens it.
   */
  async signupMode(): Promise<{ registrationOpen: boolean; inviteRequired: boolean }> {
    const first = (await this.users.count()) === 0;
    const open = first || this.config.allowRegistration;
    return { registrationOpen: open, inviteRequired: !open };
  }

  /**
   * Decides how a NEW account may be created. The first account is always allowed and becomes the
   * admin; otherwise sign-up must be open or the caller must hold a valid, unused invite (which is
   * spent here and must be `release`d if the account then fails to be created).
   */
  private async admit(inviteCode?: string): Promise<{ isAdmin: boolean; inviteId: string | null }> {
    const { registrationOpen } = await this.signupMode();
    const first = (await this.users.count()) === 0;
    if (registrationOpen) return { isAdmin: first, inviteId: null };
    if (!inviteCode?.trim()) throw new ForbiddenException('Sign-up is by invitation only. Enter your invite code.');
    return { isAdmin: false, inviteId: await this.invites.claim(inviteCode) };
  }

  private async createWithInvite(
    admission: { isAdmin: boolean; inviteId: string | null },
    data: { email: string; name: string; passwordHash?: string; googleId?: string },
  ) {
    try {
      const user = await this.users.createUser({ ...data, isAdmin: admission.isAdmin });
      if (admission.inviteId) await this.invites.markUsedBy(admission.inviteId, user.id);
      return user;
    } catch (e) {
      if (admission.inviteId) await this.invites.release(admission.inviteId); // the invite was not used up
      throw e;
    }
  }

  async register(email: string, password: string, name: string, userAgent?: string, inviteCode?: string) {
    const normalized = email.trim().toLowerCase();
    // check the invite first so an unauthorised caller learns nothing about registered e-mails
    const admission = await this.admit(inviteCode);
    let user;
    try {
      if (await this.users.findByEmail(normalized)) throw new ConflictException('Email is already registered');
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      user = await this.createWithInvite(admission, { email: normalized, name: name.trim(), passwordHash });
    } catch (e) {
      // no account was created: give the invite back (createWithInvite releases on its own failure; repeating is harmless)
      if (admission.inviteId) await this.invites.release(admission.inviteId);
      throw e;
    }
    return this.issueSession(user.id, userAgent).then((s) => ({ user: this.users.publicUser(user), ...s }));
  }

  async login(email: string, password: string, userAgent?: string) {
    const user = await this.users.findByEmail(email.trim().toLowerCase());
    const hash = user?.passwordHash ?? (await (this.dummyHash ??= argon2.hash('dummy-password-for-timing')));
    const ok = await argon2.verify(hash, password).catch(() => false);
    if (!user || !user.passwordHash || !ok) throw new UnauthorizedException('Invalid email or password');
    const s = await this.issueSession(user.id, userAgent);
    return { user: this.users.publicUser(user), ...s };
  }

  async loginWithGoogle(idToken: string, userAgent?: string, inviteCode?: string) {
    if (!this.google) throw new BadRequestException('Google login is not configured');
    let payload;
    try {
      const ticket = await this.google.verifyIdToken({ idToken, audience: this.config.googleClientId });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException('Invalid Google token');
    }
    if (!payload?.sub || !payload.email || !payload.email_verified) {
      throw new UnauthorizedException('Google account email is not verified');
    }
    const email = payload.email.toLowerCase();
    let user = await this.users.findByGoogleId(payload.sub);
    if (!user) {
      const existing = await this.users.findByEmail(email);
      if (existing) {
        user = await this.users.linkGoogle(existing.id, payload.sub);
      } else {
        const admission = await this.admit(inviteCode);
        user = await this.createWithInvite(admission, {
          email, name: payload.name ?? email.split('@')[0], googleId: payload.sub,
        });
      }
    }
    const s = await this.issueSession(user.id, userAgent);
    return { user: this.users.publicUser(user), ...s };
  }

  private async issueSession(userId: string, userAgent?: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlDays * DAY);
    await this.prisma.session.create({
      data: { userId, tokenHash: hashToken(token), expiresAt, userAgent: userAgent?.slice(0, 250) },
    });
    return { token, expiresAt };
  }

  /** Resolve a raw session token to a user, or null. Slides the expiry forward on use. */
  async authenticate(token: string): Promise<AuthUser | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now) return null;
    if (now.getTime() - session.lastUsedAt.getTime() > 5 * 60 * 1000) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { lastUsedAt: now, expiresAt: new Date(now.getTime() + this.config.sessionTtlDays * DAY) },
      });
    }
    return { id: session.user.id, email: session.user.email, name: session.user.name, isAdmin: session.user.isAdmin, sessionId: session.id };
  }

  async logout(user: AuthUser): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: user.sessionId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listSessions(user: AuthUser): Promise<SessionInfo[]> {
    const rows = await this.prisma.session.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id, userAgent: r.userAgent, createdAt: r.createdAt, lastUsedAt: r.lastUsedAt,
      expiresAt: r.expiresAt, current: r.id === user.sessionId,
    }));
  }

  async revokeSession(user: AuthUser, sessionId: string): Promise<void> {
    const res = await this.prisma.session.updateMany({
      where: { id: sessionId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Session not found');
  }

  async revokeOtherSessions(user: AuthUser): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId: user.id, id: { not: user.sessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(user: AuthUser, current: string, next: string): Promise<void> {
    const row = await this.users.findById(user.id);
    if (!row?.passwordHash) throw new BadRequestException('This account signs in with Google and has no password');
    if (!(await argon2.verify(row.passwordHash, current).catch(() => false))) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    await this.users.setPassword(user.id, await argon2.hash(next, { type: argon2.argon2id }));
    await this.revokeOtherSessions(user);
  }
}

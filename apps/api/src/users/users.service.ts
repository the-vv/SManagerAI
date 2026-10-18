import { Injectable } from '@nestjs/common';
import { DEFAULT_CATEGORIES } from '../categories/default-categories.js';
import { PrismaService } from '../database/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  count() { return this.prisma.user.count(); }
  findByEmail(email: string) { return this.prisma.user.findUnique({ where: { email } }); }
  findById(id: string) { return this.prisma.user.findUnique({ where: { id } }); }
  findByGoogleId(googleId: string) { return this.prisma.user.findUnique({ where: { googleId } }); }
  linkGoogle(id: string, googleId: string) { return this.prisma.user.update({ where: { id }, data: { googleId } }); }
  setPassword(id: string, passwordHash: string) { return this.prisma.user.update({ where: { id }, data: { passwordHash } }); }

  publicUser(u: { id: string; email: string; name: string; isAdmin: boolean }) {
    return { id: u.id, email: u.email, name: u.name, isAdmin: u.isAdmin };
  }

  /** Creates the user together with preferences and the editable default categories. */
  async createUser(data: { email: string; name: string; passwordHash?: string; googleId?: string; isAdmin?: boolean }) {
    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data });
      await tx.userPreference.create({ data: { userId: u.id } });
      await tx.category.createMany({
        data: DEFAULT_CATEGORIES.map((c, i) => ({ ...c, ownerId: u.id, sortOrder: i })),
      });
      return u;
    });
    return user;
  }
}

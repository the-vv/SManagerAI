import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { DEFAULT_TZ, isValidTimezone } from '../common/time.js';
import type { UpdateSettingsDto } from './dto.js';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(ownerId: string) {
    const p = await this.prisma.userPreference.upsert({
      where: { userId: ownerId }, update: {}, create: { userId: ownerId },
    });
    const { userId: _u, updatedAt: _t, ...rest } = p;
    return rest;
  }

  async timezone(ownerId: string): Promise<string> {
    const p = await this.prisma.userPreference.findUnique({ where: { userId: ownerId }, select: { timezone: true } });
    return p?.timezone ?? DEFAULT_TZ;
  }

  async update(ownerId: string, dto: UpdateSettingsDto) {
    if (dto.timezone && !isValidTimezone(dto.timezone)) throw new BadRequestException('Unknown timezone');
    await this.prisma.userPreference.upsert({
      where: { userId: ownerId }, update: dto, create: { userId: ownerId, ...dto },
    });
    return this.get(ownerId);
  }
}

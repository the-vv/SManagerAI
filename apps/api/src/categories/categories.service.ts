import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PrismaService } from '../database/prisma.service.js';
import { Category } from '../generated/prisma/client.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateCategoryDto {
  @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsIn(['INCOME', 'EXPENSE']) type: 'INCOME' | 'EXPENSE';
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color must be a #RRGGBB hex value' }) color?: string;
  @IsOptional() @IsString() @MaxLength(40) icon?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @Transform(trim) @IsString() @IsNotEmpty() @MaxLength(60) name?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string | null;
  @IsOptional() @IsString() @MaxLength(40) icon?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export const categoryView = (c: Category) => ({
  id: c.id, name: c.name, type: c.type, color: c.color, icon: c.icon, isActive: c.isActive,
});

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, opts: { type?: 'INCOME' | 'EXPENSE'; includeInactive?: boolean }) {
    const rows = await this.prisma.category.findMany({
      where: { ownerId, ...(opts.type ? { type: opts.type } : {}), ...(opts.includeInactive ? {} : { isActive: true }) },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(categoryView);
  }

  async create(ownerId: string, dto: CreateCategoryDto) {
    const name = dto.name.trim();
    if (await this.prisma.category.findFirst({ where: { ownerId, type: dto.type, name } })) {
      throw new ConflictException('A category with this name already exists');
    }
    const max = await this.prisma.category.aggregate({ where: { ownerId, type: dto.type }, _max: { sortOrder: true } });
    const c = await this.prisma.category.create({
      data: { ownerId, name, type: dto.type, color: dto.color ?? null, icon: dto.icon ?? null, sortOrder: (max._max.sortOrder ?? 0) + 1 },
    });
    return categoryView(c);
  }

  async update(ownerId: string, id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.category.findFirst({ where: { id, ownerId } });
    if (!existing) throw new NotFoundException('Category not found');
    if (dto.name && dto.name.trim() !== existing.name &&
      (await this.prisma.category.findFirst({ where: { ownerId, type: existing.type, name: dto.name.trim(), NOT: { id } } }))) {
      throw new ConflictException('A category with this name already exists');
    }
    const c = await this.prisma.category.update({
      where: { id },
      data: { name: dto.name?.trim(), color: dto.color, icon: dto.icon, isActive: dto.isActive },
    });
    return categoryView(c);
  }

  /** Transactions keep existing but become uncategorized (FK is SET NULL). */
  async remove(ownerId: string, id: string) {
    const res = await this.prisma.category.deleteMany({ where: { id, ownerId } });
    if (res.count === 0) throw new NotFoundException('Category not found');
  }

  /** Validates that a category is owned by the user and matches the transaction direction. */
  async assertUsable(ownerId: string, categoryId: string, type: 'INCOME' | 'EXPENSE') {
    const c = await this.prisma.category.findFirst({ where: { id: categoryId, ownerId } });
    if (!c) throw new NotFoundException('Category not found');
    if (c.type !== type) throw new ConflictException(`Category "${c.name}" is not an ${type.toLowerCase()} category`);
    return c;
  }
}

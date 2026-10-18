import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/auth.decorators.js';
import { CategoriesService, CreateCategoryDto, UpdateCategoryDto } from './categories.service.js';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Get() list(
    @CurrentUser() u: AuthUser,
    @Query('type') type?: 'INCOME' | 'EXPENSE',
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.categories.list(u.id, {
      type: type === 'INCOME' || type === 'EXPENSE' ? type : undefined,
      includeInactive: includeInactive === 'true',
    });
  }

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateCategoryDto) { return this.categories.create(u.id, dto); }

  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(u.id, id, dto);
  }

  @HttpCode(204) @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.categories.remove(u.id, id);
  }
}

import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api.client';
import { Category } from '../../shared/models/api.models';

@Injectable({ providedIn: 'root' })
export class CategoriesApi {
  private readonly api = inject(ApiClient);
  create(b: { name: string; type: 'INCOME' | 'EXPENSE'; color?: string | null; icon?: string | null }): Observable<Category> { return this.api.post('/categories', b); }
  update(id: string, b: Partial<Pick<Category, 'name' | 'color' | 'icon' | 'isActive'>>): Observable<Category> { return this.api.patch(`/categories/${id}`, b); }
  remove(id: string): Observable<void> { return this.api.delete(`/categories/${id}`); }
}

import { Injectable, inject, signal } from '@angular/core';
import { type CanMatchFn, Router } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class AdminSession {
  private credential = '';
  private readonly accessError = signal('');
  readonly error = this.accessError.asReadonly();

  get token(): string {
    return this.credential;
  }

  start(token: string): void {
    this.credential = token;
    this.accessError.set('');
  }

  end(error = ''): void {
    this.credential = '';
    this.accessError.set(error);
  }
}

export const requireAdminToken: CanMatchFn = () =>
  Boolean(inject(AdminSession).token) || inject(Router).createUrlTree(['/admin/acceso']);

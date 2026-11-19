import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminSession } from './admin-session';

@Component({
  selector: 'app-admin-access',
  imports: [RouterLink],
  templateUrl: './admin-access.component.html',
  styleUrl: './admin-access.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAccessComponent {
  private readonly router = inject(Router);
  private readonly session = inject(AdminSession);
  private readonly tokenField = viewChild.required<ElementRef<HTMLInputElement>>('tokenField');
  protected readonly error = this.session.error;
  protected readonly invalid = signal(false);

  constructor() {
    afterNextRender(() => this.tokenField().nativeElement.focus());
  }

  protected enter(event: Event, field: HTMLInputElement): void {
    event.preventDefault();
    const token = field.value.trim();
    if (!/^\S+$/.test(token)) {
      this.invalid.set(true);
      field.focus();
      return;
    }
    field.value = '';
    this.session.start(token);
    void this.router.navigateByUrl('/admin', { replaceUrl: true });
  }
}

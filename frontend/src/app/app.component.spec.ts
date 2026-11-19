import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('muestra el nombre de la aplicación', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();

    const brand = (fixture.nativeElement as HTMLElement).querySelector('header .brand');
    expect(brand?.textContent).toContain('AeroPulse');
  });

  it('ofrece Administración al final del menú principal y abre el acceso sin sesión', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();

    const page = fixture.nativeElement as HTMLElement;
    const link = page.querySelector<HTMLAnchorElement>('nav[aria-label="Principal"] a:last-child')!;
    expect(link.textContent).toContain('Administración');
    expect(link.getAttribute('href')).toBe('/admin');

    link.click();
    await fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/admin/acceso');
    expect(page.querySelector('#admin-token')).not.toBeNull();
    expect(link.getAttribute('aria-current')).toBe('page');
  });
});

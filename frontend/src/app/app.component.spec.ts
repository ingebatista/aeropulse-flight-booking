import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('muestra el nombre de la aplicación', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await fixture.whenStable();

    const brand = (fixture.nativeElement as HTMLElement).querySelector('header .brand');
    expect(brand?.textContent).toContain('AeroPulse');
  });
});

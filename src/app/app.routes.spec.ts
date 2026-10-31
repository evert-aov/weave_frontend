import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, Routes, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from './app.routes';

@Component({ standalone: true, template: 'Workspace' })
class WorkspaceStub {}
@Component({ standalone: true, template: 'Login' })
class LoginStub {}
@Component({ standalone: true, imports: [RouterOutlet], template: '<router-outlet />' })
class HostStub {}

describe('lazy public startup', () => {
  let workspaceLoads: number;
  let loginLoads: number;

  beforeEach(() => {
    workspaceLoads = loginLoads = 0;
    vi.stubGlobal('localStorage', { getItem: () => null });
    const testRoutes: Routes = routes.map(route => {
      if (route.path === '') return { ...route, loadComponent: async () => { workspaceLoads++; return WorkspaceStub; } };
      if (route.path === 'login') return { ...route, loadComponent: async () => { loginLoads++; return LoginStub; } };
      return route;
    });
    TestBed.configureTestingModule({ providers: [provideRouter(testRoutes)], imports: [HostStub] });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens login directly without matching the protected workspace or downloading it', async () => {
    const fixture = TestBed.createComponent(HostStub);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/login');
    fixture.detectChanges();
    expect(router.url).toBe('/login');
    expect(workspaceLoads).toBe(0);
    expect(loginLoads).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Login');
  });

  it('redirects an unauthenticated root navigation once and does not download workspace', async () => {
    const fixture = TestBed.createComponent(HostStub);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(router.url).toBe('/login');
    expect(workspaceLoads).toBe(0);
    expect(loginLoads).toBe(1);
  });

  it('preserves an internal document destination through the login redirect', async () => {
    const fixture = TestBed.createComponent(HostStub); fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/?document=507f1f77bcf86cd799439011');
    expect(router.url).toBe('/login?document=507f1f77bcf86cd799439011');
    expect(workspaceLoads).toBe(0);
  });
});

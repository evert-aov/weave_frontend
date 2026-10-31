import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DefaultUrlSerializer, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { NotesService } from './notes.service';
import { SpacesService } from './spaces.service';
import { AiService } from './ai.service';
import { environment } from '../../../environments/environment';

describe('authentication with a document destination', () => {
  let auth: AuthService, http: HttpTestingController;
  const router = { url: '/login?document=target', parseUrl: (url: string) => new DefaultUrlSerializer().parse(url), navigate: vi.fn(() => Promise.resolve(true)) };
  beforeEach(() => {
    router.navigate.mockClear(); router.url = '/login?document=target';
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() });
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: router },
      { provide: NotesService, useValue: { clearState: vi.fn() } },
      { provide: SpacesService, useValue: { clearState: vi.fn() } },
      { provide: AiService, useValue: { resetSession: vi.fn() } },
    ] });
    auth = TestBed.inject(AuthService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); vi.unstubAllGlobals(); });
  it('returns to the requested document after successful login', () => {
    auth.login({ email: 'user@example.test', password: 'test' }).subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ accessToken: 'token', user: { id: 'u', name: 'User' } });
    expect(router.navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true, queryParams: { document: 'target' } });
  });
  it('does not use arbitrary redirect URLs passed as a document ID', () => {
    router.url = '/login?document=%2F%2Fevil.test';
    auth.login({ email: 'user@example.test', password: 'test' }).subscribe();
    http.expectOne(`${environment.apiUrl}/auth/login`).flush({ accessToken: 'token', user: { id: 'u' } });
    expect(router.navigate).toHaveBeenCalledWith(['/'], { replaceUrl: true, queryParams: undefined });
  });
});

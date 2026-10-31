import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nService } from './i18n.service';

describe('language during startup', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('initializes and switches language when local storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    const service = new I18nService();
    expect(service.currentLang()).toBe('es');
    service.setLanguage('en');
    expect(service.t('loading.workspace')).toBe('Preparing your workspace…');
  });
});

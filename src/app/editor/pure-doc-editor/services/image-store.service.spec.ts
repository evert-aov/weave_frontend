import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ImageStoreService } from './image-store.service';
import { NotesService } from '../../../core/services/notes.service';
import { environment } from '../../../../environments/environment';

describe('ImageStoreService', () => {
  let service: ImageStoreService;
  let notesServiceMock: any;

  beforeEach(() => {
    notesServiceMock = {
      uploadBase64Image: vi.fn().mockReturnValue(
        of({ url: '/uploads/img-persisted-123.png', filename: 'img-persisted-123.png' })
      ),
    };

    TestBed.configureTestingModule({
      providers: [
        ImageStoreService,
        { provide: NotesService, useValue: notesServiceMock },
      ],
    });

    service = TestBed.inject(ImageStoreService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('toRelativeUrl', () => {
    it('should convert absolute URL matching serverBaseUrl to relative /uploads/ path', () => {
      const url = `${environment.serverBaseUrl}/uploads/test.png`;
      if (environment.serverBaseUrl) {
        expect(service.toRelativeUrl(url)).toBe('/uploads/test.png');
      } else {
        expect(service.toRelativeUrl('/uploads/test.png')).toBe('/uploads/test.png');
      }
    });

    it('should extract pathname if http URL contains /uploads/', () => {
      expect(service.toRelativeUrl('http://otherhost:3000/uploads/file.png')).toBe('/uploads/file.png');
    });
  });

  describe('toDisplayUrl', () => {
    it('should prepend serverBaseUrl to /uploads/ if set', () => {
      const display = service.toDisplayUrl('/uploads/sample.png');
      if (environment.serverBaseUrl) {
        expect(display).toBe(`${environment.serverBaseUrl}/uploads/sample.png`);
      } else {
        expect(display).toBe('/uploads/sample.png');
      }
    });
  });

  describe('externalizeImages', () => {
    it('should ignore html without img tags', async () => {
      const html = '<p>Texto sin imágenes</p>';
      const result = await service.externalizeImages(html);
      expect(result).toBe(html);
      expect(notesServiceMock.uploadBase64Image).not.toHaveBeenCalled();
    });

    it('should upload base64 image and replace src with relative /uploads/ URL', async () => {
      const sampleBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const inputHtml = `<p>Inicio</p><img src="${sampleBase64}" alt="test"/><p>Fin</p>`;

      const outputHtml = await service.externalizeImages(inputHtml);

      expect(notesServiceMock.uploadBase64Image).toHaveBeenCalledWith(sampleBase64);
      expect(outputHtml).toContain('src="/uploads/img-persisted-123.png"');
      expect(outputHtml).not.toContain(sampleBase64);
    });
  });

  describe('resolveImages', () => {
    it('should resolve /uploads/ relative URLs to display URLs', async () => {
      const inputHtml = '<p><img src="/uploads/img-test.png" alt="img"/></p>';
      const result = await service.resolveImages(inputHtml);

      if (environment.serverBaseUrl) {
        expect(result).toContain(`src="${environment.serverBaseUrl}/uploads/img-test.png"`);
      } else {
        expect(result).toBe(inputHtml);
      }
    });

    it('should migrate legacy weave-img:// references if present in cache', async () => {
      const legacyId = 'imgtest123';
      const legacyDataUrl = 'data:image/png;base64,sampledata';
      await service.save(legacyId, legacyDataUrl);

      const inputHtml = `<p><img src="weave-img://${legacyId}" alt="legacy"/></p>`;
      const result = await service.resolveImages(inputHtml);

      expect(notesServiceMock.uploadBase64Image).toHaveBeenCalledWith(legacyDataUrl);
      expect(result).not.toContain(`weave-img://${legacyId}`);
      expect(result).toContain('/uploads/img-persisted-123.png');
    });

    it('should show fallback placeholder if legacy weave-img:// is not in cache', async () => {
      const missingId = 'nonexistent-id';
      const inputHtml = `<p><img src="weave-img://${missingId}" alt="missing"/></p>`;
      const result = await service.resolveImages(inputHtml);

      expect(result).toContain('data:image/svg+xml');
      expect(result).not.toContain(`weave-img://${missingId}`);
    });
  });
});

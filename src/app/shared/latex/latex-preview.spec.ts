import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LatexPreviewComponent } from './latex-preview.component';
import { environment } from '../../../environments/environment';

describe('LaTeX PDF preview', () => {
  let fixture: ComponentFixture<LatexPreviewComponent>; let http: HttpTestingController;
  const url = `${environment.apiUrl}/latex/compile`;
  beforeEach(() => {
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});
    http = TestBed.inject(HttpTestingController);
    vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:weave-pdf'); vi.spyOn(URL,'revokeObjectURL').mockImplementation(() => {});
    fixture = TestBed.createComponent(LatexPreviewComponent); fixture.componentRef.setInput('source','source A'); fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); vi.restoreAllMocks(); });
  it('compiles only on request and marks the old PDF stale after an edit', () => {
    http.expectNone(url); fixture.componentInstance.compile();
    const request = http.expectOne(url); expect(request.request.body).toEqual({source:'source A', mode:'document'});
    request.flush({success:true,pdf:btoa('%PDF-1.4\nexample'),log:'ok'}); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('iframe')).toBeTruthy();
    fixture.componentRef.setInput('source','source B'); fixture.detectChanges();
    expect(fixture.componentInstance.stale()).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('button')[1].disabled).toBe(true);
    fixture.destroy(); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:weave-pdf');
  });
  it('cancels outdated requests and displays compiler diagnostics as text', () => {
    fixture.componentInstance.compile(); const request = http.expectOne(url);
    fixture.componentRef.setInput('source','new'); fixture.detectChanges(); expect(request.cancelled).toBe(true);
    fixture.componentInstance.compile(); http.expectOne(url).flush({success:false,log:'main.tex:12: Undefined control sequence <script>bad</script>'}); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role=alert]')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('pre').textContent).toContain('main.tex:12');
    expect(fixture.nativeElement.querySelector('script')).toBeNull();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });
  it('reports missing compiler configuration and recovers to allow retry', () => {
    fixture.componentInstance.compile(); http.expectOne(url).flush({message:'Compilador LaTeX no disponible.'},{status:503,statusText:'Unavailable'}); fixture.detectChanges();
    expect(fixture.componentInstance.error()).toContain('no disponible'); expect(fixture.componentInstance.busy()).toBe(false);
    fixture.componentInstance.compile(); http.expectOne(url).flush({success:false,log:'error'});
  });
});

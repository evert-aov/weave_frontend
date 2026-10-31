import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { NotesService } from '../../../core/services/notes.service';
import { DocumentReferenceService } from '../../../core/services/document-reference.service';
import { NoteSummary } from '../../../core/models/note.model';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-document-reference-picker', standalone: true, imports: [FormsModule, IconComponent],
  templateUrl: './document-reference-picker.component.html', styleUrl: './document-reference-picker.component.scss',
})
export class DocumentReferencePickerComponent implements AfterViewInit, OnDestroy {
  readonly references = inject(DocumentReferenceService);
  private readonly notes = inject(NotesService);
  @ViewChild('search') search?: ElementRef<HTMLInputElement>;
  private request?: Subscription;
  readonly query = signal('');
  readonly documents = signal<NoteSummary[]>([]);
  readonly loading = signal(true);
  readonly failed = signal(false);
  readonly results = computed(() => {
    const search = this.query().trim().toLocaleLowerCase();
    const source = this.references.request()?.sourceId;
    return this.documents().filter((note) => note._id !== source && `${note.title} ${note.space}`.toLocaleLowerCase().includes(search));
  });

  constructor() { this.load(); }
  typeLabel(type: NoteSummary['docType']): string {
    return ({ doc: 'Word', block: 'Texto por bloques', sheet: 'Hoja de cálculo', canvas: 'Lienzo', slide: 'Presentación', latex: 'LaTeX' } as const)[type ?? 'block'];
  }
  ngAfterViewInit(): void { this.search?.nativeElement.focus(); }
  load(): void {
    this.request?.unsubscribe(); this.loading.set(true); this.failed.set(false);
    this.request = this.notes.listDocumentReferences().subscribe({
      next: (notes) => { this.documents.set(notes); this.loading.set(false); },
      error: () => { this.failed.set(true); this.loading.set(false); },
    });
  }
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.references.close(); }
    if (event.key !== 'Tab') return;
    const dialog = (event.currentTarget as HTMLElement);
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  chooseFirst(event: Event): void {
    if (!this.results().length) return;
    event.preventDefault(); this.references.choose(this.results()[0]);
  }
  ngOnDestroy(): void { this.request?.unsubscribe(); }
}

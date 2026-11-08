import { Component, Input } from '@angular/core';
import { Note } from '../../core/models/note.model';

@Component({
  selector: 'app-pure-slide-editor',
  standalone: true,
  template: `<div class="presentation-unavailable" role="status"><h2>{{ note.title }}</h2><p>El editor de presentaciones está temporalmente deshabilitado.</p><p>Tu archivo guardado se conserva para abrirlo con el próximo editor.</p></div>`,
  styles: [`.presentation-unavailable { padding: 3rem; color: var(--text); } h2 { font-size: 1.25rem; margin-bottom: 1rem; } p { margin: .5rem 0; }`],
})
export class PureSlideEditorComponent {
  @Input({ required: true }) note!: Note;
}

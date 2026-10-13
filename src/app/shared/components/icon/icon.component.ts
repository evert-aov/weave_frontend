import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type IconName =
  | 'grid'
  | 'search'
  | 'inbox'
  | 'file'
  | 'folder'
  | 'chevron'
  | 'plus'
  | 'more'
  | 'sun'
  | 'moon'
  | 'share'
  | 'code'
  | 'sheet'
  | 'canvas'
  | 'sigma'
  | 'diagram'
  | 'text'
  | 'arrow'
  | 'pen'
  | 'type'
  | 'undo'
  | 'redo'
  | 'comment'
  | 'panel'
  | 'image'
  | 'camera'
  | 'trash'
  | 'up'
  | 'down'
  | 'palette'
  | 'sliders'
  | 'save'
  | 'close'
  | 'check'
  | 'refresh'
  | 'book'
  | 'eye'
  | 'download'
  | 'printer'
  | 'zoom-in'
  | 'zoom-out'
  | 'target'
  | 'file-text'
  | 'paperclip'
  | 'folder-input'
  | 'move'
  | 'arrow-left'
  | 'arrow-right'
  | 'presentation'
  | 'maximize'
  | 'brush';

/**
 * Componente de Iconos vectoriales de Weave.
 * Reproduce fielmente los iconos SVG estilizados del diseño de Figma.
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './icon.component.html',
  styleUrls: ['./icon.component.scss'],
})
export class IconComponent {
  @Input() name: IconName = 'file';
  @Input() size = 18;
}

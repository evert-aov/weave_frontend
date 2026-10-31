import { Component, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideDynamicIcon,
  provideLucideIcons,
  LucideSearch,
  LucideX,
  LucideHome,
  LucideSettings,
  LucideUser,
  LucideHeart,
  LucideStar,
  LucideBell,
  LucideTrash2,
  LucideEdit3,
  LucidePlus,
  LucideEye,
  LucideShare2,
  LucideLock,
  LucideShield,
  LucideFlag,
  LucideAward,
  LucideThumbsUp,
  LucideCompass,
  LucideBookmark,
  LucideBriefcase,
  LucideDollarSign,
  LucideTrendingUp,
  LucideBarChart3,
  LucideCreditCard,
  LucidePieChart,
  LucideLandmark,
  LucideShoppingBag,
  LucideTarget,
  LucideWallet,
  LucideReceipt,
  LucidePercent,
  LucideMail,
  LucideMessageSquare,
  LucidePhone,
  LucideSend,
  LucideInbox,
  LucideAtSign,
  LucideMegaphone,
  LucideLaptop,
  LucideSmartphone,
  LucideMonitor,
  LucideCpu,
  LucideServer,
  LucideWifi,
  LucideDatabase,
  LucideCode,
  LucideCloud,
  LucideTerminal,
  LucidePrinter,
  LucideBookOpen,
  LucideGraduationCap,
  LucideFileText,
  LucideFeather,
  LucideLightbulb,
  LucideAtom,
  LucideArrowRight,
  LucideArrowLeft,
  LucideArrowUp,
  LucideArrowDown,
  LucideChevronRight,
  LucideActivity,
  LucideSun,
  LucideCoffee,
  LucideSmile,
  LucideZap,
  LucideCheck,
} from '@lucide/angular';
import { I18nService } from '../../../../core/services/i18n.service';

export interface IconItem {
  name: string;
  category: string;
  tags: string[];
}

@Component({
  selector: 'app-word-icons-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideDynamicIcon],
  providers: [
    provideLucideIcons(
      LucideSearch,
      LucideX,
      LucideHome,
      LucideSettings,
      LucideUser,
      LucideHeart,
      LucideStar,
      LucideBell,
      LucideTrash2,
      LucideEdit3,
      LucidePlus,
      LucideEye,
      LucideShare2,
      LucideLock,
      LucideShield,
      LucideFlag,
      LucideAward,
      LucideThumbsUp,
      LucideCompass,
      LucideBookmark,
      LucideBriefcase,
      LucideDollarSign,
      LucideTrendingUp,
      LucideBarChart3,
      LucideCreditCard,
      LucidePieChart,
      LucideLandmark,
      LucideShoppingBag,
      LucideTarget,
      LucideWallet,
      LucideReceipt,
      LucidePercent,
      LucideMail,
      LucideMessageSquare,
      LucidePhone,
      LucideSend,
      LucideInbox,
      LucideAtSign,
      LucideMegaphone,
      LucideLaptop,
      LucideSmartphone,
      LucideMonitor,
      LucideCpu,
      LucideServer,
      LucideWifi,
      LucideDatabase,
      LucideCode,
      LucideCloud,
      LucideTerminal,
      LucidePrinter,
      LucideBookOpen,
      LucideGraduationCap,
      LucideFileText,
      LucideFeather,
      LucideLightbulb,
      LucideAtom,
      LucideArrowRight,
      LucideArrowLeft,
      LucideArrowUp,
      LucideArrowDown,
      LucideChevronRight,
      LucideActivity,
      LucideSun,
      LucideCoffee,
      LucideSmile,
      LucideZap,
      LucideCheck,
    ),
  ],
  templateUrl: './word-icons-modal.component.html',
  styleUrl: './word-icons-modal.component.scss',
})
export class WordIconsModalComponent {
  private readonly i18n = inject(I18nService, { optional: true });

  @Input() isOpen = false;
  @Input() darkMode = false;
  @Output() selectIcon = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();

  searchQuery = signal<string>('');
  selectedCategory = signal<string>('all');
  selectedIcon = signal<string | null>(null);

  readonly categories = [
    { id: 'all', labelKey: 'word.icons.cat_all', fallback: 'Todos' },
    { id: 'interface', labelKey: 'word.icons.cat_interface', fallback: 'Interfaz' },
    { id: 'business', labelKey: 'word.icons.cat_business', fallback: 'Negocios' },
    { id: 'comm', labelKey: 'word.icons.cat_comm', fallback: 'Comunicación' },
    { id: 'tech', labelKey: 'word.icons.cat_tech', fallback: 'Tecnología' },
    { id: 'edu', labelKey: 'word.icons.cat_edu', fallback: 'Educación' },
    { id: 'arrows', labelKey: 'word.icons.cat_arrows', fallback: 'Flechas' },
  ];

  readonly iconsList: IconItem[] = [
    // Interfaz
    { name: 'home', category: 'interface', tags: ['casa', 'inicio'] },
    { name: 'search', category: 'interface', tags: ['buscar', 'lupa'] },
    { name: 'settings', category: 'interface', tags: ['ajustes', 'configuracion'] },
    { name: 'user', category: 'interface', tags: ['usuario', 'perfil'] },
    { name: 'heart', category: 'interface', tags: ['corazon', 'favorito'] },
    { name: 'star', category: 'interface', tags: ['estrella', 'calificacion'] },
    { name: 'bell', category: 'interface', tags: ['notificacion', 'campana'] },
    { name: 'lock', category: 'interface', tags: ['seguridad', 'candado'] },
    { name: 'shield', category: 'interface', tags: ['escudo', 'proteccion'] },
    { name: 'check', category: 'interface', tags: ['ok', 'aprobado'] },
    { name: 'plus', category: 'interface', tags: ['anadir', 'mas'] },
    { name: 'edit-3', category: 'interface', tags: ['editar', 'lapiz'] },

    // Negocios
    { name: 'briefcase', category: 'business', tags: ['maletin', 'trabajo'] },
    { name: 'dollar-sign', category: 'business', tags: ['dinero', 'precio'] },
    { name: 'trending-up', category: 'business', tags: ['crecimiento', 'subida'] },
    { name: 'bar-chart-3', category: 'business', tags: ['grafico', 'metricas'] },
    { name: 'credit-card', category: 'business', tags: ['tarjeta', 'pago'] },
    { name: 'pie-chart', category: 'business', tags: ['torta', 'porcentaje'] },
    { name: 'landmark', category: 'business', tags: ['banco', 'institucion'] },
    { name: 'shopping-bag', category: 'business', tags: ['tienda', 'compra'] },
    { name: 'target', category: 'business', tags: ['objetivo', 'meta'] },
    { name: 'percent', category: 'business', tags: ['descuento', 'tasa'] },

    // Comunicación
    { name: 'mail', category: 'comm', tags: ['correo', 'email'] },
    { name: 'message-square', category: 'comm', tags: ['chat', 'mensaje'] },
    { name: 'phone', category: 'comm', tags: ['telefono', 'llamada'] },
    { name: 'send', category: 'comm', tags: ['enviar', 'avion'] },
    { name: 'inbox', category: 'comm', tags: ['bandeja', 'entrada'] },
    { name: 'at-sign', category: 'comm', tags: ['arroba', 'mencion'] },
    { name: 'megaphone', category: 'comm', tags: ['anuncio', 'difusion'] },

    // Tecnología
    { name: 'laptop', category: 'tech', tags: ['computadora', 'portatil'] },
    { name: 'smartphone', category: 'tech', tags: ['movil', 'celular'] },
    { name: 'monitor', category: 'tech', tags: ['pantalla', 'display'] },
    { name: 'cpu', category: 'tech', tags: ['procesador', 'chip'] },
    { name: 'server', category: 'tech', tags: ['servidor', 'host'] },
    { name: 'wifi', category: 'tech', tags: ['red', 'conexion'] },
    { name: 'database', category: 'tech', tags: ['base de datos', 'sql'] },
    { name: 'code', category: 'tech', tags: ['codigo', 'html'] },
    { name: 'cloud', category: 'tech', tags: ['nube', 'cloud'] },
    { name: 'terminal', category: 'tech', tags: ['consola', 'bash'] },
    { name: 'printer', category: 'tech', tags: ['imprimir', 'impresora'] },

    // Educación
    { name: 'book-open', category: 'edu', tags: ['libro', 'lectura'] },
    { name: 'graduation-cap', category: 'edu', tags: ['grado', 'universidad'] },
    { name: 'file-text', category: 'edu', tags: ['documento', 'archivo'] },
    { name: 'feather', category: 'edu', tags: ['pluma', 'escribir'] },
    { name: 'lightbulb', category: 'edu', tags: ['idea', 'bombilla'] },
    { name: 'atom', category: 'edu', tags: ['ciencia', 'fisica'] },

    // Flechas
    { name: 'arrow-right', category: 'arrows', tags: ['derecha'] },
    { name: 'arrow-left', category: 'arrows', tags: ['izquierda'] },
    { name: 'arrow-up', category: 'arrows', tags: ['arriba'] },
    { name: 'arrow-down', category: 'arrows', tags: ['abajo'] },
    { name: 'chevron-right', category: 'arrows', tags: ['siguiente'] },
    { name: 'activity', category: 'arrows', tags: ['pulso', 'salud'] },
    { name: 'zap', category: 'arrows', tags: ['energia', 'rayo'] },
    { name: 'sun', category: 'arrows', tags: ['sol', 'luz'] },
    { name: 'coffee', category: 'arrows', tags: ['cafe', 'break'] },
    { name: 'smile', category: 'arrows', tags: ['feliz', 'sonrisa'] },
  ];

  t(key: string, fallback?: string): string {
    return this.i18n?.t ? this.i18n.t(key) : fallback || key;
  }

  get filteredIcons(): IconItem[] {
    const q = this.searchQuery().trim().toLowerCase();
    const cat = this.selectedCategory();

    return this.iconsList.filter(item => {
      const matchesCat = cat === 'all' || item.category === cat;
      const matchesQuery = !q || item.name.includes(q) || item.tags.some(t => t.includes(q));
      return matchesCat && matchesQuery;
    });
  }

  pickIcon(name: string): void {
    this.selectedIcon.set(name);
  }

  confirm(): void {
    const icon = this.selectedIcon();
    if (icon) {
      this.selectIcon.emit(icon);
    }
  }
}

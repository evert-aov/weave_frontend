import { Component, ElementRef, ViewChild, input, output, signal } from '@angular/core';
import { IconComponent, IconName } from '../../../../shared/components/icon/icon.component';

export interface SidebarItemAction {
  id: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
}

let nextMenuId = 0;

/** Menú de acciones en la capa superior: no se recorta por el scroll del árbol de espacios. */
@Component({
  selector: 'app-sidebar-item-actions',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './item-actions.component.html',
  styleUrl: './item-actions.component.scss',
  host: { '(window:resize)': 'close(false)' },
})
export class SidebarItemActionsComponent {
  readonly label = input.required<string>();
  readonly triggerLabel = input.required<string>();
  readonly actions = input.required<SidebarItemAction[]>();
  readonly actionSelected = output<string>();
  readonly isOpen = signal(false);
  readonly menuId = `sidebar-item-menu-${nextMenuId++}`;
  @ViewChild('menu') private menu?: ElementRef<HTMLElement>;
  @ViewChild('trigger') private trigger?: ElementRef<HTMLButtonElement>;

  toggle(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const menu = this.menu?.nativeElement;
    const trigger = this.trigger?.nativeElement;
    if (!menu || !trigger) return;
    if (menu.matches(':popover-open')) {
      this.close();
      return;
    }
    menu.showPopover();
    const anchor = trigger.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(anchor.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - menu.offsetHeight - 8))}px`;
    this.isOpen.set(true);
    menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
  }

  syncOpen(event: Event): void {
    this.isOpen.set((event as ToggleEvent).newState === 'open');
  }

  select(action: string, event: MouseEvent): void {
    event.stopPropagation();
    this.close();
    this.actionSelected.emit(action);
  }

  close(restoreFocus = true): void {
    if (!this.menu?.nativeElement.matches(':popover-open')) return;
    this.menu.nativeElement.hidePopover();
    this.isOpen.set(false);
    if (restoreFocus) this.trigger?.nativeElement.focus();
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') event.preventDefault();
      this.close();
      return;
    }
    const items = Array.from(this.menu?.nativeElement.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    let index: number;
    switch (event.key) {
      case 'ArrowDown': index = (current + 1) % items.length; break;
      case 'ArrowUp': index = (current - 1 + items.length) % items.length; break;
      case 'Home': index = 0; break;
      case 'End': index = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    items[index]?.focus();
  }
}

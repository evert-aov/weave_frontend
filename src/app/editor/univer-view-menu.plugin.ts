import { Plugin, Inject, Injector } from '@univerjs/core';
import {
  IMenuManagerService,
  MenuItemType,
  RibbonPosition,
  RibbonViewGroup,
  ToggleFullscreenOperation,
  ILayoutService,
} from '@univerjs/ui';
import { fromEvent, merge, of } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';

function createFullscreenMenuItem(accessor: any, tooltipKey: string) {
  const root = accessor.get(ILayoutService)?.rootContainerElement;
  const fullscreen$ = root
    ? merge(of(null), fromEvent(root.ownerDocument, 'fullscreenchange')).pipe(
        map(() => root.ownerDocument.fullscreenElement === root),
        distinctUntilChanged()
      )
    : of(false);

  return {
    id: ToggleFullscreenOperation.id,
    type: MenuItemType.BUTTON,
    tooltip: tooltipKey,
    title: 'Pantalla completa',
    icon: fullscreen$.pipe(map((fs) => (fs ? 'ShrinkIcon' : 'ExpandIcon'))),
    activated$: fullscreen$,
  };
}

export class UniverViewRibbonPlugin extends Plugin {
  static override pluginName = 'univer-view-ribbon-plugin';

  constructor(
    _config: any,
    @Inject(Injector) override readonly _injector: Injector
  ) {
    super();
  }

  override onStarting(): void {
    const menuManagerService = this._injector.get(IMenuManagerService);
    if (!menuManagerService) return;

    menuManagerService.mergeMenu({
      [RibbonPosition.VIEW]: {
        [RibbonViewGroup.DISPLAY]: {
          [ToggleFullscreenOperation.id]: {
            order: 10,
            gridLayout: {
              row: 1,
              column: 1,
              rowSpan: 2,
              showLabel: true,
              width: 112,
            },
            menuItemFactory: (accessor: any) =>
              createFullscreenMenuItem(accessor, 'ui.ribbon.view'),
          },
        },
      },
    });
  }
}

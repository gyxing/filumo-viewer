import type { CapabilityAction } from '../capabilities/types';
import { createShellIcon } from './icons';
import { createOptionPopup } from './OptionPopup';

/** 用共享选项浮层呈现能力选择，保留鼠标、键盘与模型受控更新。 */
export function createSelectControl(
  document: Document,
  onError: (error: unknown) => void,
) {
  const element = document.createElement('span');
  element.className = 'filumo-select';
  const control = document.createElement('button');
  control.type = 'button';
  control.className = 'filumo-select-trigger';
  control.setAttribute('role', 'combobox');
  control.setAttribute('aria-haspopup', 'listbox');
  control.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span');
  value.className = 'filumo-select-value';
  control.append(value, createShellIcon(document, 'chevronDown'));
  element.append(control);
  let current: CapabilityAction | undefined;
  let active = -1,
    disposed = false,
    optionKey = '',
    renderedKey: string | undefined;
  let typed = '',
    typedAt = 0;
  const popup = createOptionPopup(control, element, () => {
    control.setAttribute('aria-expanded', 'false');
    control.removeAttribute('aria-activedescendant');
    active = -1;
    typed = '';
    typedAt = 0;
  });
  control.setAttribute('aria-controls', popup.element.id);
  const commit = (index: number) => {
    const action = current;
    const option = action?.options?.[index];
    if (!action || !option || control.disabled || disposed) return;
    popup.close();
    control.focus({ preventScroll: true });
    if (option.kind === 'action' || option.value !== action.value || action.allowReselect)
      void Promise.resolve()
        .then(() => {
          if (!disposed) return action.run(option.value);
        })
        .catch((error) => {
          if (!disposed) onError(error);
        });
  };
  const render = () => {
    // 状态刷新只更新选中态，避免重建选项吞掉正在进行的鼠标点击。
    if (renderedKey !== optionKey) {
      renderedKey = optionKey;
      popup.element.replaceChildren(
        ...(current?.options ?? []).map((option, index) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.tabIndex = -1;
          button.id = popup.element.id + '-' + index;
          button.setAttribute('role', 'option');
          button.textContent = option.label;
          button.title = option.label;
          button.onpointerdown = (event) => event.preventDefault();
          button.onclick = () => commit(index);
          button.onpointermove = () => {
            if (active === index) return;
            active = index;
            for (const child of popup.element.children)
              (child as HTMLElement).dataset.active = String(child === button);
            control.setAttribute('aria-activedescendant', button.id);
          };
          return button;
        }),
      );
    }
    for (let index = 0; index < popup.element.children.length; index++) {
      const button = popup.element.children[index] as HTMLButtonElement;
      button.setAttribute(
        'aria-selected',
        String(current?.options?.[index]?.kind !== 'action' && current?.options?.[index]?.value === current?.value),
      );
      button.dataset.active = String(index === active);
    }
    if (active >= 0)
      control.setAttribute(
        'aria-activedescendant',
        popup.element.id + '-' + active,
      );
    else control.removeAttribute('aria-activedescendant');
    popup.position();
    popup.element.children[active]?.scrollIntoView({ block: 'nearest' });
  };
  const open = () => {
    if (control.disabled || disposed) return;
    if (!popup.opened)
      active = Math.max(
        0,
        current?.options?.findIndex(
          (option) => option.kind !== 'action' && option.value === current?.value,
        ) ?? 0,
      );
    render();
    popup.open();
    control.setAttribute('aria-expanded', 'true');
    popup.element.children[active]?.scrollIntoView({ block: 'nearest' });
  };
  control.onclick = () => {
    if (popup.opened) popup.close();
    else open();
  };
  control.onblur = () => {
    if (!element.closest('[data-filumo-moving]')) popup.close();
  };
  control.onkeydown = (event) => {
    if (control.disabled || disposed) return;
    const count = current?.options?.length ?? 0;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      const wasOpen = popup.opened;
      open();
      if (event.key === 'Home') active = 0;
      else if (event.key === 'End') active = count - 1;
      else if (wasOpen)
        active =
          (active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
      render();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      if (popup.opened) commit(active);
      else open();
    } else if (event.key === 'Escape' && popup.opened) {
      event.preventDefault();
      event.stopPropagation();
      popup.close();
    } else if (event.key === 'Tab') popup.close();
    else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const now = Date.now();
      typed =
        (now - typedAt < 700 ? typed : '') + event.key.toLocaleLowerCase();
      typedAt = now;
      open();
      const index =
        current?.options?.findIndex((option) =>
          option.label.toLocaleLowerCase().startsWith(typed),
        ) ?? -1;
      if (index >= 0) {
        active = index;
        render();
      }
    }
  };
  return {
    element,
    control,
    close: popup.close,
    update(action: CapabilityAction, available: boolean) {
      const previousActive = current?.options?.[active]?.value;
      current = action;
      control.disabled =
        !available || action.enabled === false || !action.options?.length;
      control.setAttribute('aria-label', action.label);
      control.title = action.label;
      popup.element.setAttribute('aria-label', action.label);
      value.textContent =
        action.options?.find((option) => option.kind !== 'action' && option.value === action.value)
          ?.label ?? action.label;
      value.title = value.textContent ?? '';
      const nextKey = JSON.stringify(action.options ?? []);
      if (optionKey !== nextKey) {
        optionKey = nextKey;
        const preserved =
          action.options?.findIndex(
            (option) => option.value === previousActive,
          ) ?? -1;
        active =
          preserved >= 0
            ? preserved
            : Math.max(
                0,
                action.options?.findIndex(
                  (option) => option.value === action.value,
                ) ?? 0,
              );
      }
      if (control.disabled) popup.close();
      else if (popup.opened) render();
    },
    dispose() {
      disposed = true;
      current = undefined;
      popup.dispose();
      element.remove();
    },
  };
}

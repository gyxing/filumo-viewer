import type { ViewerCapabilities } from '../capabilities/types';
import { labelShellButton } from './icons';
import { createOptionPopup } from './OptionPopup';
import { getZoomPresets } from './zoomPresets';

type Zoom = NonNullable<ViewerCapabilities['zoom']>;

/** 统一绑定比例输入与预设选项，未配置的格式也使用公共默认比例。 */
export function createZoomControl(
  document: Document,
  onError: (error: unknown) => void,
) {
  const element = document.createElement('span');
  element.className = 'filumo-capability-group filumo-zoom-control';
  const field = document.createElement('span');
  field.className = 'filumo-zoom-field';
  const input = document.createElement('input');
  input.className = 'filumo-zoom-input';
  const unit = document.createElement('span');
  unit.textContent = '%';
  unit.setAttribute('aria-hidden', 'true');
  const minus = document.createElement('button');
  const plus = document.createElement('button');
  minus.type = plus.type = 'button';
  field.append(input, unit);
  element.append(field, minus, plus);
  let current: Zoom | undefined;
  let rich = false,
    dirty = false,
    closed = false;
  let accepted = '',
    active = -1;
  let choices: Array<{ label: string; value: number | string }> = [];
  const popup = createOptionPopup(
    field,
    element,
    () => {
      active = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    },
    { width: 180, align: 'end' },
  );
  const list = popup.element;
  list.classList.add('filumo-zoom-options');
  const modeActive = () =>
    Boolean(
      current?.mode?.options.some(
        (option) => option.value === current?.mode?.value,
      ),
    );
  const reset = () => {
    accepted = input.value = String(current?.value ?? '');
    dirty = false;
  };
  const invoke = (run: () => unknown) => {
    void Promise.resolve()
      .then(run)
      .catch((error) => {
        if (!closed) {
          reset();
          onError(error);
        }
      });
  };
  const position = popup.position;
  const close = popup.close;
  const submit = (explicit = false) => {
    const zoom = current;
    if (!zoom || (!dirty && !explicit)) return;
    const raw = input.value;
    const value = Number(raw);
    if (
      !raw.trim() ||
      !Number.isFinite(value) ||
      (rich && !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw))
    ) {
      reset();
      return;
    }
    // 增加默认预设不改变旧插件的越界处理；显式配置继续沿用原有限幅规则。
    const clampInput = Boolean(zoom.presets || zoom.mode);
    if (!clampInput && (value < zoom.min || value > zoom.max)) {
      reset();
      return;
    }
    const next = clampInput
      ? Math.max(zoom.min, Math.min(zoom.max, value))
      : value;
    dirty = false;
    accepted = input.value = String(next);
    // 自适应测量可能恰好等于输入值，确认手动比例仍须退出该模式。
    if (next !== zoom.value || (rich && modeActive()))
      invoke(() => zoom.set(next));
  };
  const select = (index: number) => {
    const choice = choices[index];
    const zoom = current;
    if (!choice || !zoom) return;
    dirty = false;
    if (typeof choice.value === 'number') {
      accepted = input.value = String(choice.value);
      invoke(() => zoom.set(choice.value as number));
    } else {
      const mode = choice.value;
      invoke(() => zoom.mode?.set(mode));
    }
    close();
    input.focus({ preventScroll: true });
  };
  const renderOptions = () => {
    list.replaceChildren(
      ...choices.map((choice, index) => {
        const option = document.createElement('button');
        option.type = 'button';
        option.tabIndex = -1;
        option.id = list.id + '-' + index;
        option.setAttribute('role', 'option');
        option.textContent = choice.label;
        option.setAttribute(
          'aria-selected',
          String(
            index === active ||
              (typeof choice.value === 'string'
                ? choice.value === current?.mode?.value
                : !modeActive() && choice.value === current?.value),
          ),
        );
        // 保留输入框焦点，避免 blur 在选项点击前提交并关闭列表。
        option.onpointerdown = (event) => event.preventDefault();
        option.onclick = () => select(index);
        return option;
      }),
    );
    if (active >= 0)
      input.setAttribute('aria-activedescendant', list.id + '-' + active);
    else input.removeAttribute('aria-activedescendant');
    list.children[active]?.scrollIntoView({ block: 'nearest' });
    position();
  };
  const open = () => {
    if (!rich || input.disabled || closed) return;
    renderOptions();
    popup.open();
    input.setAttribute('aria-expanded', 'true');
  };
  input.onfocus = open;
  input.onclick = open;
  input.oninput = () => {
    if (rich && !/^\d*(?:\.\d*)?$/.test(input.value)) {
      input.value = accepted;
      return;
    }
    accepted = input.value;
    dirty = true;
    active = -1;
    open();
  };
  input.onchange = () => {
    if (!rich) submit();
  };
  input.onblur = () => {
    if (element.closest('[data-filumo-moving]')) return;
    submit();
    close();
  };
  input.onkeydown = (event) => {
    if (rich && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      active = choices.length
        ? active < 0
          ? event.key === 'ArrowDown'
            ? 0
            : choices.length - 1
          : (active + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) %
            choices.length
        : -1;
      open();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (popup.opened && active >= 0) select(active);
      else {
        submit(true);
        close();
      }
    } else if (event.key === 'Escape') {
      reset();
      if (popup.opened) {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    } else if (event.key === 'Tab') {
      submit();
      close();
    }
  };
  minus.onclick = () => {
    const zoom = current;
    if (zoom)
      invoke(() => zoom.set(Math.max(zoom.min, zoom.value - zoom.step)));
  };
  plus.onclick = () => {
    const zoom = current;
    if (zoom)
      invoke(() => zoom.set(Math.min(zoom.max, zoom.value + zoom.step)));
  };
  return {
    element,
    close,
    update(zoom: Zoom, locale: 'zh-CN' | 'en-US', available: boolean) {
      const presets = getZoomPresets(zoom);
      const nextRich = Boolean(presets.length || zoom.mode?.options.length);
      if (nextRich !== rich) {
        close();
        dirty = false;
      }
      current = zoom;
      rich = nextRich;
      input.type = rich ? 'text' : 'number';
      input.step = 'any';
      input.inputMode = 'decimal';
      input.min = String(zoom.min);
      input.max = String(zoom.max);
      input.setAttribute(
        'aria-label',
        locale === 'en-US' ? 'Zoom percentage' : '缩放比例',
      );
      if (rich) {
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-controls', list.id);
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', String(popup.opened));
      } else {
        for (const attr of [
          'role',
          'aria-controls',
          'aria-autocomplete',
          'aria-expanded',
          'aria-activedescendant',
        ])
          input.removeAttribute(attr);
      }
      choices = [
        ...(zoom.mode?.options ?? []).map((option) => ({
          label: option.label,
          value: option.value,
        })),
        ...presets.map((value) => ({ label: value + '%', value })),
      ];
      if (!dirty || document.activeElement !== input) reset();
      input.disabled = !available;
      minus.disabled = !available || zoom.value <= zoom.min;
      plus.disabled = !available || zoom.value >= zoom.max;
      labelShellButton(
        minus,
        locale === 'en-US' ? 'Zoom out' : '缩小',
        'zoomOut',
        true,
      );
      labelShellButton(
        plus,
        locale === 'en-US' ? 'Zoom in' : '放大',
        'zoomIn',
        true,
      );
      if (!available) close();
      else if (popup.opened) renderOptions();
    },
    dispose() {
      close();
      closed = true;
      current = undefined;
      popup.dispose();
      element.remove();
    },
  };
}

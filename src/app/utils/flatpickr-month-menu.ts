import type { Instance } from 'flatpickr/dist/types/instance';

/**
 * Replaces flatpickr's browser-native month select with a small in-calendar
 * menu. Native select popups cannot be themed consistently in Android
 * WebView, whereas this stays within the picker sheet and follows our theme.
 */
export interface FlatpickrMonthMenu {
  sync(): void;
  destroy(): void;
}

export interface FlatpickrMonthMenuOptions {
  /** Render January–December even when an edge year has date bounds. */
  showAllMonths?: boolean;
  /** Called after an unavailable month is moved to its nearest valid month. */
  onMonthAdjusted?: () => void;
}

export function installFlatpickrMonthMenu(
  fp: Instance,
  options: FlatpickrMonthMenuOptions = {},
): FlatpickrMonthMenu | null {
  const calendar = fp.calendarContainer;
  const select = calendar.querySelector<HTMLSelectElement>('.flatpickr-monthDropdown-months');
  const host = calendar.querySelector<HTMLElement>('.flatpickr-current-month');
  if (!select || !host) return null;

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'fp-month-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');

  const menu = document.createElement('div');
  menu.className = 'fp-month-menu';
  menu.setAttribute('role', 'listbox');

  const close = () => {
    menu.classList.remove('fp-month-menu-open');
    trigger.setAttribute('aria-expanded', 'false');
  };
  const positionMenu = () => {
    const rect = trigger.getBoundingClientRect();
    const estimatedMenuHeight = 270;
    const openAbove = window.innerHeight - rect.bottom < estimatedMenuHeight && rect.top > estimatedMenuHeight;
    const menuWidth = menu.getBoundingClientRect().width;
    const horizontalInset = 16;
    const centerX = Math.max(
      menuWidth / 2 + horizontalInset,
      Math.min(rect.left + rect.width / 2, window.innerWidth - menuWidth / 2 - horizontalInset),
    );
    menu.classList.toggle('fp-month-menu-above', openAbove);
    menu.style.left = `${centerX}px`;
    menu.style.top = `${openAbove ? rect.top - 8 : rect.bottom + 8}px`;
  };
  const sync = () => {
    const selected = select.options[select.selectedIndex];
    trigger.textContent = options.showAllMonths
      ? fp.l10n.months.longhand[fp.currentMonth]
      : selected?.textContent?.trim() ?? '';
    menu.querySelectorAll<HTMLButtonElement>('.fp-month-option').forEach((option, index) => {
      const isSelected = index === (options.showAllMonths ? fp.currentMonth : select.selectedIndex);
      option.classList.toggle('fp-month-option-active', isSelected);
      option.setAttribute('aria-selected', String(isSelected));
    });
  };
  const toggle = (event: Event) => {
    event.stopPropagation();
    const isOpen = menu.classList.toggle('fp-month-menu-open');
    trigger.setAttribute('aria-expanded', String(isOpen));
    if (isOpen) positionMenu();
  };
  const onDocumentPointerDown = (event: PointerEvent) => {
    if (!host.contains(event.target as Node) && !menu.contains(event.target as Node)) close();
  };
  // Prev/next month arrows are owned by flatpickr; update the trigger after
  // its own click handler has changed the selected native option.
  const onCalendarClick = () => setTimeout(sync, 0);

  const monthLabels = options.showAllMonths
    ? fp.l10n.months.longhand
    : Array.from(select.options).map(option => option.textContent?.trim() ?? '');

  monthLabels.forEach((label, index) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'fp-month-option';
    item.textContent = `${index + 1}. ${label}`;
    item.setAttribute('role', 'option');
    item.addEventListener('click', (event) => {
      event.stopPropagation();
      const minDate = fp.config.minDate instanceof Date ? fp.config.minDate : undefined;
      const maxDate = fp.config.maxDate instanceof Date ? fp.config.maxDate : undefined;
      let targetMonth = index;
      let adjusted = false;
      if (minDate && fp.currentYear === minDate.getFullYear() && targetMonth < minDate.getMonth()) {
        targetMonth = minDate.getMonth();
        adjusted = true;
      }
      if (maxDate && fp.currentYear === maxDate.getFullYear() && targetMonth > maxDate.getMonth()) {
        targetMonth = maxDate.getMonth();
        adjusted = true;
      }
      fp.changeMonth(targetMonth, false);
      fp.redraw();
      sync();
      close();
      if (adjusted) options.onMonthAdjusted?.();
    });
    menu.appendChild(item);
  });

  select.style.display = 'none';
  trigger.addEventListener('click', toggle);
  host.append(trigger);
  // A body-level layer avoids clipping/stacking contexts from full-screen
  // overlays and transformed mobile sheets.
  document.body.appendChild(menu);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  calendar.addEventListener('click', onCalendarClick);
  sync();

  return {
    sync,
    destroy: () => {
      document.removeEventListener('pointerdown', onDocumentPointerDown);
      calendar.removeEventListener('click', onCalendarClick);
      trigger.removeEventListener('click', toggle);
      menu.remove();
      trigger.remove();
      select.style.display = '';
    },
  };
}

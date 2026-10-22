import { useEffect, useId, useRef, useState } from 'react';

import { buildIcs } from '../../shared/ics.js';
import type { Plan } from '../../shared/schemas.js';
import { planFileName } from '../storage';

/** Hand the browser a file to save. Blob URLs keep everything on the device. */
export function downloadFile(name: string, type: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export function downloadCalendar(plan: Plan): void {
  downloadFile(`${planFileName(plan)}.ics`, 'text/calendar', buildIcs(plan, new Date()));
}

/**
 * Open/close state for a disclosure menu. Opening focuses the first item; Escape, a
 * click outside or choosing an item closes it, and focus returns to the trigger.
 */
function useMenu() {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstItem = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    firstItem.current?.focus();
    const onPointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node && wrapper.current?.contains(event.target)))
        setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    action();
    setOpen(false);
    // The menu item is about to disappear; return focus to the button that opened it.
    trigger.current?.focus();
  };
  const toggle = () => {
    setOpen((value) => !value);
  };

  return { open, toggle, choose, wrapper, trigger, firstItem };
}

/** A disclosure menu: calendar file, plan file, print. */
export function ExportMenu({ plan }: { plan: Plan }) {
  const menuId = useId();
  const { open, toggle, choose, wrapper, trigger, firstItem } = useMenu();
  const downloadPlan = () => {
    downloadFile(`${planFileName(plan)}.json`, 'application/json', JSON.stringify(plan, null, 2));
  };

  return (
    <div className="menu-wrap" ref={wrapper}>
      <button
        ref={trigger}
        type="button"
        className="btn btn-secondary"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={toggle}
      >
        Export
      </button>
      {open && (
        <div id={menuId} className="menu">
          <button
            ref={firstItem}
            type="button"
            className="menu-item"
            onClick={choose(() => {
              downloadCalendar(plan);
            })}
          >
            Calendar file (.ics)
            <span className="row-sub">Google Calendar, Apple Calendar, Outlook</span>
          </button>
          <button type="button" className="menu-item" onClick={choose(downloadPlan)}>
            Plan file (.json)
            <span className="row-sub">To back up or open on another device</span>
          </button>
          <button
            type="button"
            className="menu-item"
            onClick={choose(() => {
              window.print();
            })}
          >
            Print or save as PDF
          </button>
        </div>
      )}
    </div>
  );
}

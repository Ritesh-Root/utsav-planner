import type { KeyboardEvent } from 'react';
import { useRef } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
}

/**
 * WAI-ARIA tabs with a roving tabindex: arrow keys, Home and End move between
 * tabs and select them. The selected tab also lives in the URL hash.
 */
export function Tabs<T extends string>({
  items,
  selected,
  onSelect,
  label,
  idPrefix,
}: {
  items: TabItem<T>[];
  selected: T;
  onSelect: (id: T) => void;
  label: string;
  idPrefix: string;
}) {
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const move = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = items.findIndex((item) => item.id === selected);
    const last = items.length - 1;
    const next: Partial<Record<string, number>> = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    const target = next[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const item = items[target];
    if (!item) return;
    onSelect(item.id);
    refs.current.get(item.id)?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          ref={(node) => {
            if (node) refs.current.set(item.id, node);
          }}
          id={`${idPrefix}-tab-${item.id}`}
          type="button"
          role="tab"
          className="tab"
          aria-selected={item.id === selected}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={item.id === selected ? 0 : -1}
          onKeyDown={move}
          onClick={() => {
            onSelect(item.id);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { daysUntil } from '../../shared/timeline.js';
import { formatDate } from '../../shared/dates.js';
import { useToday } from '../hooks';
import type { Route } from '../router';
import { hrefFor } from '../router';
import { usePlanStore } from '../state/store';

export function BrandMark({ className = 'brand-mark' }: { className?: string }) {
  // A diya, the small clay lamp lit at Indian celebrations.
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        fill="#e09a12"
        d="M16 3c3.6 4.4 5.4 7.6 3.4 10.6-.8 1.2-2 1.9-3.4 1.9s-2.6-.7-3.4-1.9C10.6 10.6 12.4 7.4 16 3z"
      />
      <path fill="var(--accent)" d="M4 18h24c0 5.5-5.4 10-12 10S4 23.5 4 18z" />
    </svg>
  );
}

function countdown(days: number): string {
  if (days < 0) return 'Done';
  if (days === 0) return 'Today';
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

function Sidebar({ route, open, onClose }: { route: Route; open: boolean; onClose: () => void }) {
  const { plans } = usePlanStore();
  const today = useToday();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  const current = (r: Route) => (hrefFor(r) === hrefFor(route) ? 'page' : undefined);
  const activePlanId = route.name === 'plan' ? route.id : null;

  return (
    <nav id="app-nav" className={`sidebar${open ? ' is-open' : ''}`} aria-label="Main">
      <div className="sidebar-head">
        <a className="brand" href="#/" onClick={onClose}>
          <BrandMark />
          Utsav
        </a>
        {open && (
          <button
            ref={closeRef}
            type="button"
            className="btn btn-quiet btn-small"
            onClick={onClose}
          >
            Close menu
          </button>
        )}
      </div>
      <a className="btn btn-secondary" href="#/new" onClick={onClose}>
        New plan
      </a>
      <div className="nav-group">
        <p className="nav-label" id="nav-plans">
          Your plans
        </p>
        {plans.length === 0 ? (
          <p className="nav-empty">Plans you make appear here.</p>
        ) : (
          <ul aria-labelledby="nav-plans" className="nav-group">
            {plans.map((plan) => (
              <li key={plan.id}>
                <a
                  className="nav-item"
                  href={hrefFor({ name: 'plan', id: plan.id, tab: 'overview' })}
                  aria-current={plan.id === activePlanId ? 'page' : undefined}
                  onClick={onClose}
                >
                  <span>{plan.brief.title}</span>
                  <span className="nav-sub">
                    {formatDate(plan.brief.date)} · {countdown(daysUntil(plan.brief.date, today))}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="nav-group sidebar-foot">
        <a
          className="nav-item"
          href="#/settings"
          aria-current={current({ name: 'settings' })}
          onClick={onClose}
        >
          Settings
        </a>
      </div>
    </nav>
  );
}

/** Open-plane shell: a labelled sidebar on desktop that folds into a top bar and menu on smaller screens. */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const close = () => {
    setMenuOpen(false);
    menuButton.current?.focus();
  };

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="shell">
        <Sidebar route={route} open={menuOpen} onClose={close} />
        <div className="main">
          <header className="topbar">
            <a className="brand" href="#/">
              <BrandMark />
              Utsav
            </a>
            <button
              ref={menuButton}
              type="button"
              className="btn btn-secondary btn-small"
              aria-expanded={menuOpen}
              aria-controls="app-nav"
              onClick={() => {
                setMenuOpen(true);
              }}
            >
              Menu
            </button>
          </header>
          <main id="main" className="canvas" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}

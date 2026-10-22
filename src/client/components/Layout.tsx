import type { ReactNode, Ref } from 'react';

/** The page's heading row: the focusable h1, lines under it and actions beside it. */
export function PageTitle({
  headingRef,
  title,
  children,
  actions,
}: {
  /** Receives focus after navigation, so screen readers start at the new page. */
  headingRef: Ref<HTMLHeadingElement>;
  title: string;
  /** Lines shown under the heading. */
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="title-row">
      <div className="title-text">
        <h1 ref={headingRef} tabIndex={-1} className="title">
          {title}
        </h1>
        {children}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

/** A button styled as a link, for quiet actions such as "Full timeline". */
export function LinkButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  /** An accessible name when the visible text alone is ambiguous. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <button type="button" className="link-button" aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

/** A titled card: the section is named by its heading, with an optional action beside it. */
export function Panel({
  id,
  title,
  className,
  action,
  children,
}: {
  /** The heading's id; it names the section for assistive technology. */
  id: string;
  title: string;
  /** Layout classes such as "span-6 stretch". */
  className?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const heading = (
    <h2 id={id} className="panel-title">
      {title}
    </h2>
  );
  return (
    <section className={className ? `panel ${className}` : 'panel'} aria-labelledby={id}>
      {action ? (
        <div className="panel-head">
          {heading}
          {action}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  );
}

import { render } from '@testing-library/react';
import axe from 'axe-core';
import type { ReactNode } from 'react';

import type { Plan } from '../../src/shared/schemas.js';
import { AnnouncerProvider } from '../../src/client/state/announcer';
import { SettingsProvider } from '../../src/client/state/settings';
import { PlanStoreProvider } from '../../src/client/state/store';

/** Render inside the app's providers; `plans: null` loads saved plans from localStorage instead. */
export function renderWithProviders(ui: ReactNode, plans: Plan[] | null = []) {
  return render(
    <SettingsProvider>
      <AnnouncerProvider>
        {plans === null ? (
          <PlanStoreProvider>{ui}</PlanStoreProvider>
        ) : (
          <PlanStoreProvider initialPlans={plans}>{ui}</PlanStoreProvider>
        )}
      </AnnouncerProvider>
    </SettingsProvider>,
  );
}

/** axe-core violations in a rendered tree. Colour contrast is checked separately (jsdom has no layout). */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
  );
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

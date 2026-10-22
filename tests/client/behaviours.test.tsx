import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/client/App';
import { ErrorBoundary } from '../../src/client/components/ErrorBoundary';
import { requestPlan } from '../../src/client/api';
import { PLANS_KEY } from '../../src/client/storage';
import { usePlanStore } from '../../src/client/state/store';
import { useEffect } from 'react';
import HomeView from '../../src/client/views/HomeView';
import NewPlanView from '../../src/client/views/NewPlanView';
import PlanView from '../../src/client/views/PlanView';
import SettingsView from '../../src/client/views/SettingsView';
import { addDays, localToday } from '../../src/shared/dates.js';
import { finalizePlan } from '../../src/shared/plan.js';
import { buildTemplateDraft as draftFor } from '../../src/shared/templates/index.js';
import type { Brief, Plan } from '../../src/shared/schemas.js';
import { buildTemplateDraft } from '../../src/shared/templates/index.js';
import { TODAY, birthdayBrief, sequentialIds, templatePlan } from '../fixtures/plans';
import { jsonResponse, renderWithProviders } from './helpers';

function planFor(brief: Brief = birthdayBrief, id = 'plan-1'): Plan {
  const today = localToday();
  const dated = { ...brief, date: addDays(today, 30) };
  return finalizePlan(buildTemplateDraft(dated), dated, {
    planId: id,
    today,
    now: new Date(),
    source: 'ai',
    fallbackReason: null,
    model: 'gemini-test',
    newId: sequentialIds(),
  });
}

const statusText = () =>
  screen
    .getAllByRole('status')
    .map((el) => el.textContent)
    .join(' ');
const alertText = () =>
  screen
    .getAllByRole('alert')
    .map((el) => el.textContent)
    .join(' ');

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('saved plans', () => {
  it('loads saved plans in the background after the first paint', async () => {
    localStorage.setItem(PLANS_KEY, JSON.stringify([templatePlan(birthdayBrief)]));
    renderWithProviders(<HomeView />, null);
    expect(screen.getByText('Loading your plans…')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: birthdayBrief.title })).toBeInTheDocument();
  });

  it('shows a plan saved in another tab', async () => {
    renderWithProviders(<HomeView />);
    expect(screen.getByText(/No plans yet/)).toBeInTheDocument();
    localStorage.setItem(PLANS_KEY, JSON.stringify([templatePlan(birthdayBrief)]));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: PLANS_KEY }));
    });
    expect(await screen.findByRole('link', { name: birthdayBrief.title })).toBeInTheDocument();
  });

  it('warns when the browser refuses to save', async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor()]);
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await waitFor(
      () => {
        expect(alertText()).toContain('couldn’t save in this browser');
      },
      { timeout: 2000 },
    );
  });

  it('writes the last edit at once when the page is hidden', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor()]);
    await user.click(screen.getAllByRole('checkbox')[0]!);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const saved = JSON.parse(localStorage.getItem(PLANS_KEY) ?? '[]') as Plan[];
    expect(saved[0]?.tasks.some((t) => t.done)).toBe(true);
  });
});

describe('creating a plan', () => {
  it('cancelling returns to the form and says so', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );
    renderWithProviders(<NewPlanView preset="birthday" />);
    await user.click(await screen.findByRole('button', { name: 'Create my plan' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: 'Create my plan' })).toBeInTheDocument();
    await waitFor(() => {
      expect(statusText()).toContain('Planning cancelled.');
    });
    expect(window.location.hash).toBe('');
  });

  it('shows server field errors on the form and stays on the page', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'VALIDATION_FAILED',
                message: 'Some details need fixing.',
                fields: [{ path: 'brief.guests', message: 'x' }],
              },
            },
            400,
          ),
        ),
      ),
    );
    renderWithProviders(<NewPlanView preset="birthday" />);
    await user.click(await screen.findByRole('button', { name: 'Create my plan' }));
    expect(await screen.findByLabelText('Number of guests')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(window.location.hash).toBe('');
  });

  it('rethrows a caller’s abort instead of reporting a network error', async () => {
    const controller = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))),
    );
    controller.abort();
    await expect(requestPlan(birthdayBrief, TODAY, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('settings: backups', () => {
  const upload = (text: string) => new File([text], 'plans.json', { type: 'application/json' });

  it('opens its own "Download all plans" backup, giving clashing ids new ids', async () => {
    const user = userEvent.setup();
    const plan = templatePlan(birthdayBrief);
    renderWithProviders(<SettingsView />, [plan]);
    await user.upload(
      screen.getByLabelText('Open a plan file'),
      upload(JSON.stringify([plan, plan])),
    );
    expect(await screen.findByText('Imported 2 plans.', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText(/3 plans are saved/)).toBeInTheDocument();
    await waitFor(() => {
      expect(statusText()).toContain('Imported 2 plans.');
    });
  });

  it('rejects a damaged file, announcing it urgently and describing the field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsView />);
    const input = screen.getByLabelText('Open a plan file');
    await user.upload(input, upload('{nope'));
    expect(
      await screen.findByText('That file is not valid JSON.', { selector: 'p' }),
    ).toHaveAttribute('id', 'import-result');
    expect(input).toHaveAccessibleDescription('That file is not valid JSON.');
    await waitFor(() => {
      expect(alertText()).toContain('That file is not valid JSON.');
    });
  });

  it('deletes all plans only after confirming', async () => {
    const user = userEvent.setup();
    renderWithProviders(<SettingsView />, [templatePlan(birthdayBrief)]);
    await user.click(screen.getByRole('button', { name: 'Delete all plans' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete all plans?' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete all plans' }));
    expect(await screen.findByText(/0 plans are saved/)).toBeInTheDocument();
  });
});

describe('focus and keyboard', () => {
  it('moves focus to the new page heading and handles unknown routes', async () => {
    renderWithProviders(<App />);
    await screen.findByRole('heading', { level: 1, name: 'Plan a celebration' });
    act(() => {
      window.location.hash = '#/settings';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    const settings = await screen.findByRole('heading', { level: 1, name: 'Settings' });
    await waitFor(() => {
      expect(settings).toHaveFocus();
    });
    act(() => {
      window.location.hash = '#/no/such/page';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('closes the phone menu with Escape and returns focus to the Menu button', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);
    const menu = screen.getByRole('button', { name: 'Menu' });
    await user.click(menu);
    expect(menu).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(menu).toHaveAttribute('aria-expanded', 'false');
    expect(menu).toHaveFocus();
  });

  it('closes a dialog on Escape and returns focus to the button that opened it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor()]);
    const opener = screen.getByRole('button', { name: 'Edit details' });
    await user.click(opener);
    const dialog = await screen.findByRole('dialog', { name: 'Edit event details' });
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(opener).toHaveFocus();
  });
});

describe('editing every part of the plan by hand', () => {
  it('removes a task and adds a run-sheet item', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="timeline" />, [planFor()]);
    const firstTask = screen.getAllByRole('checkbox')[0]!;
    const title = firstTask.closest('li')?.querySelector('label')?.textContent ?? '';
    await user.click(screen.getByRole('button', { name: `Remove: ${title}` }));
    expect(screen.queryByRole('checkbox', { name: title })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('What happens'), 'Magic show');
    await user.clear(screen.getByLabelText('Time'));
    await user.type(screen.getByLabelText('Time'), '17:15');
    await user.click(screen.getByRole('button', { name: 'Add to run sheet' }));
    expect(await screen.findByText('Magic show')).toBeInTheDocument();
    expect(screen.getByText('17:15')).toBeInTheDocument();
  });

  it('adds and removes vendors', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="vendors" />, [planFor()]);
    await user.click(screen.getByRole('button', { name: 'Add vendor' }));
    expect(screen.getByText(/Say which kind of vendor/)).toBeInTheDocument();
    await user.type(screen.getByLabelText('Kind of vendor'), 'Magician');
    await user.click(screen.getByRole('button', { name: 'Add vendor' }));
    expect(await screen.findByRole('heading', { name: 'Magician' })).toBeInTheDocument();
    expect(screen.getByText('0 of 5 booked')).toBeInTheDocument();
    await user.click(screen.getAllByText(/Questions to ask and your notes/).at(-1)!);
    await user.click(screen.getByRole('button', { name: 'Remove: Magician' }));
    expect(screen.queryByRole('heading', { name: 'Magician' })).not.toBeInTheDocument();
  });

  it('adds a budget line that stays fixed while the others rebalance', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="budget" />, [planFor()]);
    await user.type(screen.getByLabelText('What it is for'), 'Magician');
    await user.type(screen.getByLabelText('Amount (INR)'), '3,000');
    await user.click(screen.getByRole('button', { name: 'Add line' }));
    expect(await screen.findByRole('textbox', { name: 'Planned for Magician' })).toHaveValue(
      '3,000',
    );
    const planned = screen
      .getAllByRole('textbox', { name: /^Planned for / })
      .map((input) => Number((input as HTMLInputElement).value.replace(/,/g, '')));
    expect(planned.reduce((a, b) => a + b, 0)).toBe(25_000);
    await user.click(screen.getByRole('button', { name: 'Remove: Magician' }));
    expect(screen.queryByRole('textbox', { name: 'Planned for Magician' })).not.toBeInTheDocument();
  });

  it('adds the user’s own idea, already saved', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="ideas" />, [planFor()]);
    await user.type(screen.getByLabelText('Idea'), 'Rocket piñata');
    await user.click(screen.getByRole('button', { name: 'Save idea' }));
    expect(await screen.findByRole('button', { name: 'Save: Rocket piñata' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('things going wrong', () => {
  it('offers a reload instead of a blank page when a view fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Broken = () => {
      throw new Error('chunk failed to load');
    };
    renderWithProviders(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(alertText()).toContain('This page couldn’t load');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(document.title).toBe('Page couldn’t load · Utsav');
  });

  it('explains a cleared date instead of failing silently', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="timeline" />, [planFor()]);
    await user.type(screen.getByLabelText('Task'), 'Buy candles');
    const due = screen.getByLabelText('Due');
    fireEvent.change(due, { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    expect(alertText()).toContain('Choose today or a later date.');
    expect(due).toHaveAttribute('aria-invalid', 'true');
    expect(due).toHaveAccessibleDescription('Choose today or a later date.');
    expect(screen.getByLabelText('Task')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.queryByRole('checkbox', { name: 'Buy candles' })).not.toBeInTheDocument();
  });

  it('asks for a book-by date when it is cleared', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="vendors" />, [planFor()]);
    await user.type(screen.getByLabelText('Kind of vendor'), 'Magician');
    fireEvent.change(screen.getByLabelText('Book by'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Add vendor' }));
    expect(alertText()).toContain('Choose the date to book by.');
    expect(screen.queryByRole('heading', { name: 'Magician' })).not.toBeInTheDocument();
  });

  it('refuses a book-by date that has already passed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="vendors" />, [planFor()]);
    await user.type(screen.getByLabelText('Kind of vendor'), 'Magician');
    const bookBy = screen.getByLabelText('Book by');
    fireEvent.change(bookBy, { target: { value: '2026-10-01' } });
    await user.click(screen.getByRole('button', { name: 'Add vendor' }));
    expect(alertText()).toContain('Choose today or a later date to book by.');
    expect(bookBy).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('heading', { name: 'Magician' })).not.toBeInTheDocument();
  });

  it('keeps the plan as it was when a refinement is discarded', async () => {
    const user = userEvent.setup();
    const plan = planFor();
    const ideas = draftFor(plan.brief).ideas.map((idea, i) => ({
      ...idea,
      title: `Other idea ${i}`,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            result: { message: 'New ideas.', briefPatch: null, sections: { ideas } },
            meta: { source: 'ai', fallbackReason: null, cached: false, latencyMs: 5, model: 'm' },
          }),
        ),
      ),
    );
    renderWithProviders(<PlanView id="plan-1" tab="ideas" />, [plan]);
    await user.click(screen.getByRole('button', { name: 'Refine with AI' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refine with AI' });
    await user.type(within(dialog).getByLabelText('Your request'), 'Other ideas');
    await user.click(within(dialog).getByRole('button', { name: 'Ask Utsav' }));
    await user.click(await within(dialog).findByRole('button', { name: 'Discard' }));
    expect(within(dialog).getByLabelText('Your request')).toBeInTheDocument();
    expect(screen.queryByText('Other idea 0')).not.toBeInTheDocument();
  });

  it('stops asking Gemini when the refine dialog is closed mid-request', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            signal = init.signal ?? undefined;
            init.signal?.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
      ),
    );
    const plan = planFor();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [plan]);
    await user.click(screen.getByRole('button', { name: 'Refine with AI' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refine with AI' });
    await user.type(within(dialog).getByLabelText('Your request'), 'More guests');
    await user.click(within(dialog).getByRole('button', { name: 'Ask Utsav' }));
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(signal?.aborted).toBe(true);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(plan.brief.title);
  });
});

describe('keyboard focus after changes', () => {
  it('speaks each change once and keeps focus on the page after Undo or Dismiss', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor()]);
    const heading = screen.getByRole('heading', { level: 1 });
    await user.click(screen.getAllByRole('checkbox')[0]!);
    const undo = await screen.findByRole('button', { name: 'Undo' });
    expect(undo.closest('[role="status"], [aria-live]')).toBeNull();
    undo.focus();
    await user.keyboard('{Enter}');
    expect(heading).toHaveFocus();
    await user.click(screen.getAllByRole('checkbox')[0]!);
    await user.click(await screen.findByRole('button', { name: 'Dismiss' }));
    expect(heading).toHaveFocus();
  });

  it('returns focus to Export when its menu closes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor()]);
    const exportButton = screen.getByRole('button', { name: 'Export' });
    await user.click(exportButton);
    await user.keyboard('{Escape}');
    expect(exportButton).toHaveFocus();
    expect(exportButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('moves focus to Apply on a preview and back to the request on an error', async () => {
    const user = userEvent.setup();
    const plan = planFor();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse({ error: { code: 'AI_UNAVAILABLE', message: 'Gemini is busy.' } }, 503),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            result: { message: 'Done.', briefPatch: null, sections: {} },
            meta: { source: 'ai', fallbackReason: null, cached: false, latencyMs: 5, model: 'm' },
          }),
        ),
    );
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [plan]);
    await user.click(screen.getByRole('button', { name: 'Refine with AI' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refine with AI' });
    const request = within(dialog).getByLabelText('Your request');
    await user.type(request, 'More flowers');
    await user.click(within(dialog).getByRole('button', { name: 'Ask Utsav' }));
    expect(await within(dialog).findByText('Gemini is busy.')).toBeInTheDocument();
    expect(request).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Ask Utsav' }));
    expect(await within(dialog).findByRole('button', { name: 'Apply changes' })).toHaveFocus();
  });

  it('puts the page out of reach while the phone menu covers it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<App />);
    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(document.querySelector('.main')).toHaveAttribute('inert');
    await user.keyboard('{Escape}');
    expect(document.querySelector('.main')).not.toHaveAttribute('inert');
  });
});

describe('saving never loses a plan', () => {
  it('writes a plan made before the saved ones finished loading', async () => {
    const saved = templatePlan(birthdayBrief);
    localStorage.setItem(PLANS_KEY, JSON.stringify([saved]));
    const early = { ...planFor(), id: 'plan-early' };
    function MakesAPlanAtOnce() {
      const { savePlan } = usePlanStore();
      useEffect(() => {
        savePlan(early);
      }, [savePlan]);
      return null;
    }
    renderWithProviders(<MakesAPlanAtOnce />, null);
    await waitFor(
      () => {
        const stored = JSON.parse(localStorage.getItem(PLANS_KEY) ?? '[]') as Plan[];
        expect(stored.map((p) => p.id).sort()).toEqual([early.id, saved.id].sort());
      },
      { timeout: 2000 },
    );
  });

  it('does not write over another tab’s newer save when this page is hidden', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor()]);
    await user.click(screen.getAllByRole('checkbox')[0]!);
    const otherTab = [{ ...templatePlan(birthdayBrief), id: 'plan-other' }];
    localStorage.setItem(PLANS_KEY, JSON.stringify(otherTab));
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: PLANS_KEY }));
    });
    await waitFor(() => {
      expect(document.title).toContain('Plan not found');
    });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const stored = JSON.parse(localStorage.getItem(PLANS_KEY) ?? '[]') as Plan[];
    expect(stored.map((p) => p.id)).toEqual(otherTab.map((p) => p.id));
  });

  it('keeps both plans when one backup file holds the same id twice', async () => {
    const user = userEvent.setup();
    const plan = templatePlan(birthdayBrief);
    renderWithProviders(<SettingsView />, []);
    await user.upload(
      screen.getByLabelText('Open a plan file'),
      new File([JSON.stringify([plan, plan])], 'plans.json', { type: 'application/json' }),
    );
    expect(await screen.findByText(/2 plans are saved/)).toBeInTheDocument();
  });

  it('never offers a currency change for an existing plan', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor()]);
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit event details' });
    expect(within(dialog).queryByLabelText(/currency/i)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Number of guests')).toBeInTheDocument();
  });

  it('leaves focus alone when the error page re-renders', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const Broken = () => {
      throw new Error('boom');
    };
    const ui = (n: number) => (
      <>
        <button type="button">Other {n}</button>
        <ErrorBoundary>
          <Broken />
        </ErrorBoundary>
      </>
    );
    const { rerender } = render(ui(1));
    screen.getByRole('button', { name: 'Reload' }).focus();
    rerender(ui(2));
    expect(screen.getByRole('button', { name: 'Reload' })).toHaveFocus();
  });
});

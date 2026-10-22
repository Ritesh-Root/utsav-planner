import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PlanView from '../../src/client/views/PlanView';
import { addDays, localToday } from '../../src/shared/dates.js';
import { finalizePlan } from '../../src/shared/plan.js';
import type { Brief, Plan } from '../../src/shared/schemas.js';
import { buildTemplateDraft } from '../../src/shared/templates/index.js';
import { birthdayBrief, communityBrief, sequentialIds } from '../fixtures/plans';
import { axeViolations, jsonResponse, renderWithProviders } from './helpers';

function planFor(brief: Brief, daysAway: number, source: 'ai' | 'template' = 'ai'): Plan {
  const today = localToday();
  const dated = { ...brief, date: addDays(today, daysAway) };
  return finalizePlan(buildTemplateDraft(dated), dated, {
    planId: 'plan-1',
    today,
    now: new Date(),
    source,
    fallbackReason: source === 'template' ? 'The AI took too long to answer.' : null,
    model: source === 'ai' ? 'gemini-test' : null,
    newId: sequentialIds(),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('timeline tab', () => {
  it('groups tasks by phase with calendar links and a run sheet', async () => {
    const { container } = renderWithProviders(<PlanView id="plan-1" tab="timeline" />, [
      planFor(communityBrief, 10),
    ]);
    expect(await screen.findByRole('heading', { name: 'Final week' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'After the event' })).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: /Add to Google Calendar: Write the safety plan/,
    });
    expect(link.getAttribute('href')).toContain('calendar.google.com');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getAllByText('Do now').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Run sheet' })).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('adds a custom task and validates the form', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="timeline" />, [planFor(birthdayBrief, 30)]);
    await user.click(await screen.findByRole('button', { name: 'Add task' }));
    expect(screen.getByText('Give the task a name.')).toHaveAttribute('role', 'alert');
    await user.type(screen.getByLabelText('Task'), 'Buy candles');
    await user.click(screen.getByRole('button', { name: 'Add task' }));
    expect(await screen.findByRole('checkbox', { name: 'Buy candles' })).toBeInTheDocument();
  });

  it('downloads the calendar file', async () => {
    const user = userEvent.setup();
    const createUrl = vi.fn(() => 'blob:calendar');
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }),
    );
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    renderWithProviders(<PlanView id="plan-1" tab="timeline" />, [planFor(birthdayBrief, 30)]);
    await user.click(await screen.findByRole('button', { name: 'Download calendar file' }));
    expect(createUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });
});

describe('vendors tab', () => {
  it('tracks status, keeps private notes local and links to Maps', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PlanView id="plan-1" tab="vendors" />, [
      planFor(birthdayBrief, 30),
    ]);
    const status = await screen.findByRole('combobox', { name: 'Status for Cake baker' });
    await user.selectOptions(status, 'booked');
    expect(screen.getByText('1 of 4 booked')).toBeInTheDocument();
    await user.click(screen.getAllByText(/Questions to ask and your notes/)[0]!);
    const maps = screen.getAllByRole('link', { name: /on Google Maps/ })[0]!;
    expect(maps.getAttribute('href')).toContain('google.com/maps/search');
    await user.type(screen.getAllByLabelText('Vendor name')[0]!, 'Sweet Spot');
    await user.tab();
    expect(screen.getAllByLabelText('Vendor name')[0]).toHaveValue('Sweet Spot');
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('workspace actions', () => {
  it('edits the event details and reschedules', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor(birthdayBrief, 30)]);
    await user.click(screen.getByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit event details' });
    const budget = within(dialog).getByLabelText('Total budget (INR)');
    await user.clear(budget);
    await user.type(budget, 'abc');
    await user.click(within(dialog).getByRole('button', { name: 'Save details' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/whole number/);
    await user.clear(budget);
    await user.type(budget, '40000');
    await user.click(within(dialog).getByRole('button', { name: 'Save details' }));
    await screen.findByRole('button', { name: 'Undo' });
    expect(document.querySelector('.meta')).toHaveTextContent('₹40,000');
  });

  it('opens the export menu and closes it with Escape', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor(birthdayBrief, 30)]);
    const button = screen.getByRole('button', { name: 'Export' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Calendar file/ })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('labels a template plan and can ask Gemini again', async () => {
    const user = userEvent.setup();
    const fresh = planFor(birthdayBrief, 30);
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            plan: { ...fresh, id: 'other', title: 'Fresh from Gemini' },
            meta: { source: 'ai', fallbackReason: null, cached: false, latencyMs: 5, model: 'm' },
          }),
        ),
      ),
    );
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [
      planFor(birthdayBrief, 30, 'template'),
    ]);
    expect(screen.getByText('Template plan')).toBeInTheDocument();
    expect(screen.getByText('The AI took too long to answer.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try AI again' }));
    await user.click(await screen.findByRole('button', { name: 'Replace plan' }));
    expect(await screen.findByText('Drafted with Gemini')).toBeInTheDocument();
  });

  it('shows a refinement error without changing the plan', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              error: {
                code: 'AI_TIMEOUT',
                message: 'The AI took too long. Your plan is unchanged; please try again.',
              },
            },
            503,
          ),
        ),
      ),
    );
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [planFor(birthdayBrief, 30)]);
    await user.click(screen.getByRole('button', { name: 'Refine with AI' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refine with AI' });
    await user.click(within(dialog).getByRole('button', { name: 'Ask Utsav' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Tell Utsav what to change');
    await user.click(within(dialog).getByRole('button', { name: 'Help us cut costs by 15%' }));
    expect(within(dialog).getByLabelText('Your request')).toHaveValue('Help us cut costs by 15%');
    await user.click(within(dialog).getByRole('button', { name: 'Ask Utsav' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Your plan is unchanged');
  });
});

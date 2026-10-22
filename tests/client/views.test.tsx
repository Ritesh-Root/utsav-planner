import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/client/App';
import HomeView from '../../src/client/views/HomeView';
import NewPlanView from '../../src/client/views/NewPlanView';
import PlanView from '../../src/client/views/PlanView';
import SettingsView from '../../src/client/views/SettingsView';
import { localToday } from '../../src/shared/dates.js';
import { finalizePlan } from '../../src/shared/plan.js';
import type { Plan } from '../../src/shared/schemas.js';
import { buildTemplateDraft } from '../../src/shared/templates/index.js';
import { birthdayBrief, sequentialIds, weddingBrief } from '../fixtures/plans';
import { axeViolations, jsonResponse, renderWithProviders } from './helpers';

/** A plan dated relative to the real "today", since views read the clock. */
function freshPlan(brief = birthdayBrief, id = 'plan-1'): Plan {
  const today = localToday();
  const shifted = {
    ...brief,
    date: new Date(Date.parse(today) + 30 * 86_400_000).toISOString().slice(0, 10),
  };
  return finalizePlan(buildTemplateDraft(shifted), shifted, {
    planId: id,
    today,
    now: new Date(),
    source: 'ai',
    fallbackReason: null,
    model: 'gemini-test',
    newId: sequentialIds(),
  });
}

beforeEach(() => {
  window.location.hash = '';
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('home', () => {
  it('offers the three samples and an honest empty state', async () => {
    const { container } = renderWithProviders(<HomeView />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Plan a celebration' }),
    ).toBeInTheDocument();
    for (const sample of ['Indian wedding', 'Kid’s 7th birthday', 'Diwali community mela']) {
      expect(
        screen.getByRole('link', { name: `Start with this: ${sample} sample` }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText(/No plans yet/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('lists saved plans with their progress', () => {
    renderWithProviders(<HomeView />, [freshPlan()]);
    const table = screen.getByRole('table');
    expect(within(table).getByRole('link', { name: birthdayBrief.title })).toHaveAttribute(
      'href',
      '#/plan/plan-1',
    );
    expect(within(table).getByText('30 days')).toBeInTheDocument();
  });
});

describe('new plan form', () => {
  it('shows a focused error summary that links to each field', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<NewPlanView preset={null} />);
    await user.click(await screen.findByRole('button', { name: 'Create my plan' }));
    const summary = await screen.findByRole('heading', { name: 'There are some problems' });
    expect(summary.parentElement).toHaveFocus();
    const name = screen.getByLabelText('Event name');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('Give the event a name.');
    await user.click(screen.getByRole('link', { name: /Event name: Give the event a name/ }));
    expect(name).toHaveFocus();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('prefills a sample and creates the plan through the API', async () => {
    const user = userEvent.setup();
    const plan = freshPlan();
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          plan,
          meta: { source: 'ai', fallbackReason: null, cached: false, latencyMs: 5, model: 'm' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    renderWithProviders(<NewPlanView preset="birthday" />);
    expect(await screen.findByLabelText('Event name')).toHaveValue('Mira’s 7th birthday');
    await user.click(screen.getByRole('button', { name: 'Create my plan' }));
    await waitFor(() => {
      expect(window.location.hash).toBe('#/plan/plan-1');
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, { body: string }])[1].body,
    ) as {
      brief: { title: string };
    };
    expect(body.brief.title).toBe('Mira’s 7th birthday');
  });

  it('builds a template plan on the device when the service is unreachable', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    renderWithProviders(<NewPlanView preset="community" />);
    await user.click(await screen.findByRole('button', { name: 'Create my plan' }));
    await waitFor(() => {
      expect(window.location.hash).toMatch(/^#\/plan\/plan-/);
    });
  });
});

describe('plan workspace', () => {
  it('shows the plan, the road strip and the four pillars', async () => {
    const { container } = renderWithProviders(<PlanView id="plan-1" tab="overview" />, [
      freshPlan(),
    ]);
    expect(
      screen.getByRole('heading', { level: 1, name: birthdayBrief.title }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: /30 days to go\. 0 of 13 tasks done/ }),
    ).toBeInTheDocument();
    for (const title of ['Next up', 'Budget', 'Vendors', 'Ideas for you']) {
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    }
    expect(screen.getByText('Drafted with Gemini')).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('moves between tabs with the arrow keys', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [freshPlan()]);
    const overview = screen.getByRole('tab', { name: 'Overview' });
    overview.focus();
    await user.keyboard('{ArrowRight}');
    expect(window.location.hash).toBe('#/plan/plan-1/budget');
    await user.keyboard('{End}');
    expect(window.location.hash).toBe('#/plan/plan-1/ideas');
  });

  it('ticks off a task and offers Undo', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [freshPlan()]);
    const box = await screen.findByRole('checkbox', {
      name: 'Pick a theme and make the guest list',
    });
    await user.click(box);
    expect(box).toBeChecked();
    expect(screen.getByText('1 of 13 done')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(
      await screen.findByRole('checkbox', { name: 'Pick a theme and make the guest list' }),
    ).not.toBeChecked();
  });

  it('locks a typed budget line and keeps the total exact', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<PlanView id="plan-1" tab="budget" />, [freshPlan()]);
    const food = await screen.findByRole('textbox', { name: 'Planned for Food & snacks' });
    await user.clear(food);
    await user.type(food, '10,000{Enter}');
    expect(await screen.findByText('Set by you')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Planned for Food & snacks' })).toHaveValue(
      '10,000',
    );
    const totals = screen.getAllByText('₹25,000');
    expect(totals.length).toBeGreaterThan(0);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('projects a bigger guest list before applying it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="budget" />, [freshPlan()]);
    const guests = await screen.findByRole('textbox', { name: 'Guests' });
    await user.clear(guests);
    await user.type(guests, '60');
    expect(screen.getByText(/At 60 guests/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Use / }));
    expect(await screen.findByText(/60 guests ·/)).toBeInTheDocument();
  });

  it('saves ideas as toggle buttons and filters them', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="ideas" />, [freshPlan()]);
    const save = await screen.findByRole('button', { name: 'Save: Treasure hunt adventure' });
    await user.click(save);
    expect(screen.getByRole('button', { name: 'Save: Treasure hunt adventure' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Saved (1)' }));
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1);
  });

  it('previews an AI refinement and applies it only when asked', async () => {
    const user = userEvent.setup();
    const plan = freshPlan();
    const ideas = buildTemplateDraft(plan.brief).ideas.map((idea, i) => ({
      ...idea,
      title: `Fresh idea ${i}`,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            result: { message: 'Swapped in new ideas.', briefPatch: null, sections: { ideas } },
            meta: { source: 'ai', fallbackReason: null, cached: false, latencyMs: 5, model: 'm' },
          }),
        ),
      ),
    );
    renderWithProviders(<PlanView id="plan-1" tab="ideas" />, [plan]);
    await user.click(screen.getByRole('button', { name: 'Refine with AI' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refine with AI' });
    await user.type(within(dialog).getByLabelText('Your request'), 'New ideas please');
    await user.click(within(dialog).getByRole('button', { name: 'Ask Utsav' }));
    expect(await within(dialog).findByText('Swapped in new ideas.')).toBeInTheDocument();
    expect(screen.queryByText('Fresh idea 0')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Apply changes' }));
    expect(await screen.findByText('Fresh idea 0')).toBeInTheDocument();
  });

  it('confirms before deleting a plan', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlanView id="plan-1" tab="overview" />, [freshPlan()]);
    await user.click(screen.getByRole('button', { name: 'Delete plan' }));
    const dialog = await screen.findByRole('dialog', { name: /Delete Mira/ });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Delete plan' }));
    expect(window.location.hash).toBe('#/');
  });

  it('explains a missing plan', () => {
    renderWithProviders(<PlanView id="gone" tab="overview" />);
    expect(screen.getByRole('heading', { name: 'Plan not found' })).toBeInTheDocument();
  });
});

describe('settings and shell', () => {
  it('switches theme and reading mode on the page root', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<SettingsView />, [freshPlan(weddingBrief)]);
    await user.click(screen.getByRole('radio', { name: 'High contrast' }));
    expect(document.documentElement.dataset.theme).toBe('contrast');
    await user.click(screen.getByRole('checkbox', { name: 'Simple reading' }));
    expect(document.documentElement.dataset.reading).toBe('simple');
    expect(screen.getByText(/1 plan is saved/)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('routes between views from the hash', async () => {
    renderWithProviders(<App />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Plan a celebration' }),
    ).toBeInTheDocument();
    act(() => {
      window.location.hash = '#/settings';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main');
  });
});

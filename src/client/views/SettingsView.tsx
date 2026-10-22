import type { ChangeEvent } from 'react';
import { useState } from 'react';

import { randomId } from '../../shared/plan.js';
import type { Plan } from '../../shared/schemas.js';
import { ConfirmDialog } from '../components/Dialog';
import { downloadFile } from '../components/ExportMenu';
import { PageTitle, Panel } from '../components/Layout';
import { useDocumentTitle, usePageFocus } from '../hooks';
import type { Theme } from '../settings';
import { THEMES } from '../settings';
import { useAnnounce } from '../state/announcer';
import { useSettings } from '../state/settings';
import { usePlanStore } from '../state/store';
import { parsePlanFile } from '../storage';

const THEME_LABELS: Record<Theme, string> = {
  system: 'Match my device',
  light: 'Light',
  dark: 'Dark',
  contrast: 'High contrast',
};

function AppearancePanel() {
  const { settings, update } = useSettings();
  return (
    <Panel id="appearance-title" title="Appearance" className="span-6">
      <fieldset>
        <legend>Colours</legend>
        <div className="choices">
          {THEMES.map((theme) => (
            <label key={theme} className="choice">
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={settings.theme === theme}
                onChange={() => {
                  update({ theme });
                }}
              />
              {THEME_LABELS[theme]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="choice">
        <input
          type="checkbox"
          name="reading"
          checked={settings.reading === 'simple'}
          aria-describedby="reading-hint"
          onChange={(e) => {
            update({ reading: e.target.checked ? 'simple' : 'standard' });
          }}
        />
        Simple reading
      </label>
      <p className="hint" id="reading-hint">
        Larger text, more space between lines and bigger buttons.
      </p>
    </Panel>
  );
}

/**
 * Plans from a file, given new ids where needed: an id already saved, or seen earlier
 * in the same file, never overwrites a plan by accident.
 */
function withFreshIds(imported: readonly Plan[], saved: readonly Plan[]): Plan[] {
  const taken = new Set(saved.map((p) => p.id));
  return imported.map((plan) => {
    const id = taken.has(plan.id) ? randomId('plan') : plan.id;
    taken.add(id);
    return { ...plan, id };
  });
}

/** Open a plan file and save its plans, reporting the outcome on screen and aloud. */
function ImportPlans() {
  const store = usePlanStore();
  const announce = useAnnounce();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const parsed = parsePlanFile(await file.text());
    if (!parsed.ok) {
      setResult({ ok: false, text: parsed.message });
      announce(parsed.message, 'assertive');
      return;
    }
    for (const plan of withFreshIds(parsed.plans, store.plans)) store.savePlan(plan);
    const [first] = parsed.plans;
    const text =
      parsed.plans.length === 1 && first
        ? `Imported ${first.brief.title}.`
        : `Imported ${parsed.plans.length} plans.`;
    setResult({ ok: true, text });
    announce(text);
  };

  return (
    <div className="field">
      <label className="label" htmlFor="import-plan">
        Open a plan file
      </label>
      <input
        id="import-plan"
        type="file"
        accept=".json,application/json"
        aria-describedby={result ? 'import-result' : undefined}
        onChange={(e) => void importFile(e)}
      />
      {/* Announced through the live regions; shown here for sighted users. */}
      {result && (
        <p id="import-result" className={result.ok ? 'hint' : 'error-text'}>
          {result.text}
        </p>
      )}
    </div>
  );
}

function DataPanel() {
  const store = usePlanStore();
  const announce = useAnnounce();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const count = store.plans.length;
  return (
    <Panel id="data-title" title="Your data" className="span-6">
      <p>
        {count} {count === 1 ? 'plan is' : 'plans are'} saved in this browser. Nothing is stored on
        Utsav’s server.
      </p>
      <div className="actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={count === 0}
          onClick={() => {
            downloadFile(
              'utsav-plans.json',
              'application/json',
              JSON.stringify(store.plans, null, 2),
            );
          }}
        >
          Download all plans
        </button>
      </div>
      <ImportPlans />
      <div>
        <button
          type="button"
          className="btn btn-danger"
          disabled={count === 0}
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          Delete all plans
        </button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title="Delete all plans?"
        message="Every plan saved in this browser will be removed. Download them first if you want a copy. This cannot be undone."
        confirmLabel="Delete all plans"
        onCancel={() => {
          setConfirmDelete(false);
        }}
        onConfirm={() => {
          store.replaceAll([]);
          setConfirmDelete(false);
          announce('All plans deleted.');
        }}
      />
    </Panel>
  );
}

/** Appearance, the user's saved data (backup, restore, delete) and how AI is used. */
export default function SettingsView() {
  const heading = usePageFocus<HTMLHeadingElement>('settings');
  useDocumentTitle('Settings');
  return (
    <>
      <PageTitle headingRef={heading} title="Settings">
        <p className="meta">Appearance and your saved data. Changes save as you make them.</p>
      </PageTitle>
      <div className="grid">
        <AppearancePanel />
        <DataPanel />
        <Panel id="ai-title" title="How Utsav uses AI" className="span-12">
          <p>
            Utsav asks Google Gemini, running on Vertex AI, to draft and refine plans. It sends the
            event details you type and a short outline of the plan; it never sends vendor names,
            contacts, quotes, notes or spending. Gemini’s answer is checked against a strict format,
            cleaned of links and contact details, and the arithmetic is done by Utsav, so budgets
            always add up. Costs are estimates, not quotes.
          </p>
        </Panel>
      </div>
    </>
  );
}

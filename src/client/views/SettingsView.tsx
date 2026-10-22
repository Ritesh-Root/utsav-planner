import type { ChangeEvent } from 'react';
import { useState } from 'react';

import { randomId } from '../../shared/plan.js';
import { downloadFile } from '../components/ExportMenu';
import { ConfirmDialog } from '../components/Dialog';
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

/** Appearance, the user's saved data (backup, restore, delete) and how AI is used. */
export default function SettingsView() {
  const { settings, update } = useSettings();
  const store = usePlanStore();
  const announce = useAnnounce();
  const heading = usePageFocus<HTMLHeadingElement>('settings');
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useDocumentTitle('Settings');

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const result = parsePlanFile(await file.text());
    if (!result.ok) {
      setImportMessage({ ok: false, text: result.message });
      announce(result.message, 'assertive');
      return;
    }
    // Never overwrite an existing plan by accident: an id clash gets a new id.
    for (const plan of result.plans) {
      store.savePlan(store.getPlan(plan.id) ? { ...plan, id: randomId('plan') } : plan);
    }
    const [first] = result.plans;
    const text =
      result.plans.length === 1 && first
        ? `Imported ${first.brief.title}.`
        : `Imported ${result.plans.length} plans.`;
    setImportMessage({ ok: true, text });
    announce(text);
  };

  return (
    <>
      <div className="title-row">
        <div className="title-text">
          <h1 ref={heading} tabIndex={-1} className="title">
            Settings
          </h1>
          <p className="meta">Appearance and your saved data. Changes save as you make them.</p>
        </div>
      </div>
      <div className="grid">
        <section className="panel span-6" aria-labelledby="appearance-title">
          <h2 id="appearance-title" className="panel-title">
            Appearance
          </h2>
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
        </section>

        <section className="panel span-6" aria-labelledby="data-title">
          <h2 id="data-title" className="panel-title">
            Your data
          </h2>
          <p>
            {store.plans.length} {store.plans.length === 1 ? 'plan is' : 'plans are'} saved in this
            browser. Nothing is stored on Utsav’s server.
          </p>
          <div className="actions">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={store.plans.length === 0}
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
          <div className="field">
            <label className="label" htmlFor="import-plan">
              Open a plan file
            </label>
            <input
              id="import-plan"
              type="file"
              accept=".json,application/json"
              aria-describedby={importMessage ? 'import-result' : undefined}
              onChange={(e) => void importFile(e)}
            />
            {/* Announced through the live regions; shown here for sighted users. */}
            {importMessage && (
              <p id="import-result" className={importMessage.ok ? 'hint' : 'error-text'}>
                {importMessage.text}
              </p>
            )}
          </div>
          <div>
            <button
              type="button"
              className="btn btn-danger"
              disabled={store.plans.length === 0}
              onClick={() => {
                setConfirmDelete(true);
              }}
            >
              Delete all plans
            </button>
          </div>
        </section>

        <section className="panel span-12" aria-labelledby="ai-title">
          <h2 id="ai-title" className="panel-title">
            How Utsav uses AI
          </h2>
          <p>
            Utsav asks Google Gemini, running on Vertex AI, to draft and refine plans. It sends the
            event details you type and a short outline of the plan; it never sends vendor names,
            contacts, quotes, notes or spending. Gemini’s answer is checked against a strict format,
            cleaned of links and contact details, and the arithmetic is done by Utsav, so budgets
            always add up. Costs are estimates, not quotes.
          </p>
        </section>
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
    </>
  );
}

import type { SubmitEvent } from 'react';
import { useId, useMemo, useState } from 'react';

import { IDEA_CATEGORIES } from '../../shared/constants.js';
import { LIMITS } from '../../shared/limits.js';
import { addCustomIdea, randomId, toggleIdeaSaved } from '../../shared/plan.js';
import type { IdeaCategory } from '../../shared/schemas.js';
import { COST_TIER_LABELS, IDEA_CATEGORY_LABELS, pluralize } from '../labels';
import type { PanelProps } from './types';

type Filter = IdeaCategory | 'all' | 'saved';

function AddIdeaForm({ plan, update }: Pick<PanelProps, 'plan' | 'update'>) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IdeaCategory>('theme');
  const [error, setError] = useState('');
  const id = useId();

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    if (title.trim() === '') {
      setError('Give your idea a short name.');
      return;
    }
    setError('');
    update(addCustomIdea(plan, { title, description, category }, randomId, new Date()), {
      undoable: true,
      announcement: `Saved your idea ${title.trim()}`,
    });
    setTitle('');
    setDescription('');
  };

  return (
    <form className="inner form" onSubmit={submit} noValidate aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="panel-title">
        Add your own idea
      </h3>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor={`${id}-name`}>
            Idea
          </label>
          <input
            id={`${id}-name`}
            className="input"
            maxLength={LIMITS.shortText}
            value={title}
            aria-invalid={error !== ''}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
          />
        </div>
        <div className="field">
          <label className="label" htmlFor={`${id}-category`}>
            Kind
          </label>
          <select
            id={`${id}-category`}
            className="select"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value as IdeaCategory);
            }}
          >
            {IDEA_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {IDEA_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor={`${id}-details`}>
          Details (optional)
        </label>
        <textarea
          id={`${id}-details`}
          className="textarea"
          maxLength={LIMITS.longText}
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
        />
      </div>
      <div>
        <button type="submit" className="btn btn-secondary btn-small">
          Save idea
        </button>
      </div>
    </form>
  );
}

/** Personalised ideas to save, filter and refine, plus the user's own. */
export default function IdeasPanel({ plan, update, refine }: PanelProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const categories = useMemo(
    () => [...new Set(plan.ideas.map((idea) => idea.category))],
    [plan.ideas],
  );
  const savedCount = plan.ideas.filter((idea) => idea.saved).length;
  const shown = plan.ideas.filter((idea) =>
    filter === 'all' ? true : filter === 'saved' ? idea.saved : idea.category === filter,
  );

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'saved', label: `Saved (${savedCount})` },
    ...categories.map((category) => ({ id: category, label: IDEA_CATEGORY_LABELS[category] })),
  ];

  return (
    <section className="panel" aria-labelledby="ideas-title">
      <div className="panel-head">
        <h2 id="ideas-title" className="panel-title">
          Personalised ideas
        </h2>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => {
            refine(
              'ideas',
              savedCount > 0
                ? 'Suggest more ideas like the ones I saved, and keep the saved ones.'
                : 'Suggest fresh ideas that suit this event better.',
            );
          }}
        >
          More ideas like these
        </button>
      </div>
      <p className="panel-figure">{pluralize(plan.ideas.length, 'idea')}</p>
      <div className="chips" role="group" aria-label="Show ideas">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className="btn btn-secondary btn-small"
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        Showing {pluralize(shown.length, 'idea')}
      </p>
      {shown.length === 0 ? (
        <p className="empty">
          No ideas here yet. Save the ones you like and they will show up here.
        </p>
      ) : (
        <ul className="grid ideas-grid">
          {shown.map((idea) => (
            <li key={idea.id} className="inner idea span-6">
              <span className="row-sub">{IDEA_CATEGORY_LABELS[idea.category]}</span>
              <h3 className="row-title">{idea.title}</h3>
              <p>{idea.description}</p>
              <div className="idea-foot">
                <span className="unit">
                  {COST_TIER_LABELS[idea.costTier]}
                  {idea.saved && <span className="pill pill-accent saved-pill">Saved</span>}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  aria-pressed={idea.saved}
                  aria-label={`Save: ${idea.title}`}
                  onClick={() => {
                    update(toggleIdeaSaved(plan, idea.id, new Date()), {
                      announcement: `${idea.title} ${idea.saved ? 'removed from' : 'saved to'} your ideas`,
                    });
                  }}
                >
                  Save
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AddIdeaForm plan={plan} update={update} />
    </section>
  );
}

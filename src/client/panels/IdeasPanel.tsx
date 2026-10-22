import { useMemo, useState } from 'react';

import { IDEA_CATEGORIES } from '../../shared/constants.js';
import { LIMITS } from '../../shared/limits.js';
import { addCustomIdea, planIsFull, randomId, toggleIdeaSaved } from '../../shared/plan.js';
import type { Idea, IdeaCategory } from '../../shared/schemas.js';
import type { FormError } from '../components/InlineForm';
import {
  FormField,
  InlineForm,
  SelectField,
  TextField,
  fullPlanError,
} from '../components/InlineForm';
import { Panel } from '../components/Layout';
import { COST_TIER_LABELS, IDEA_CATEGORY_LABELS, pluralize } from '../labels';
import type { PanelProps } from './types';

type Filter = IdeaCategory | 'all' | 'saved';

function matches(idea: Idea, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'saved') return idea.saved;
  return idea.category === filter;
}

function AddIdeaForm({ plan, update }: Pick<PanelProps, 'plan' | 'update'>) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<IdeaCategory>('theme');
  const [error, setError] = useState<FormError | null>(null);

  const submit = () => {
    if (planIsFull(plan, 'ideas')) {
      setError(fullPlanError('ideas'));
      return;
    }
    if (title.trim() === '') {
      setError({ message: 'Give your idea a short name.', fields: ['name'] });
      return;
    }
    setError(null);
    update(addCustomIdea(plan, { title, description, category }, randomId, new Date()), {
      undoable: true,
      announcement: `Saved your idea ${title.trim()}`,
    });
    setTitle('');
    setDescription('');
  };

  return (
    <InlineForm heading="Add your own idea" error={error} submitLabel="Save idea" onSubmit={submit}>
      <div className="field-row">
        <TextField
          name="name"
          label="Idea"
          maxLength={LIMITS.shortText}
          value={title}
          onChange={setTitle}
        />
        <SelectField
          name="category"
          label="Kind"
          value={category}
          options={IDEA_CATEGORIES}
          optionLabel={(c) => IDEA_CATEGORY_LABELS[c]}
          onChange={setCategory}
        />
      </div>
      <FormField name="details" label="Details (optional)">
        {(control) => (
          <textarea
            {...control}
            className="textarea"
            maxLength={LIMITS.longText}
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
            }}
          />
        )}
      </FormField>
    </InlineForm>
  );
}

function IdeaCard({ idea, onToggleSaved }: { idea: Idea; onToggleSaved: () => void }) {
  return (
    <li className="inner idea span-6">
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
          onClick={onToggleSaved}
        >
          Save
        </button>
      </div>
    </li>
  );
}

/** Filter buttons: all ideas, the saved ones, or one kind of idea. */
function IdeaFilters({
  ideas,
  filter,
  onFilter,
}: {
  ideas: readonly Idea[];
  filter: Filter;
  onFilter: (filter: Filter) => void;
}) {
  const filters = useMemo(() => {
    const categories = [...new Set(ideas.map((idea) => idea.category))];
    const saved = ideas.filter((idea) => idea.saved).length;
    return [
      { id: 'all' as const, label: 'All' },
      { id: 'saved' as const, label: `Saved (${saved})` },
      ...categories.map((category) => ({ id: category, label: IDEA_CATEGORY_LABELS[category] })),
    ];
  }, [ideas]);
  return (
    <div className="chips" role="group" aria-label="Show ideas">
      {filters.map((f) => (
        <button
          key={f.id}
          type="button"
          className="btn btn-secondary btn-small"
          aria-pressed={filter === f.id}
          onClick={() => {
            onFilter(f.id);
          }}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

/** Personalised ideas to save, filter and refine, plus the user's own. */
export default function IdeasPanel({ plan, update, refine }: PanelProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const shown = plan.ideas.filter((idea) => matches(idea, filter));
  const anySaved = plan.ideas.some((idea) => idea.saved);
  const toggleSaved = (idea: Idea) => () => {
    update(toggleIdeaSaved(plan, idea.id, new Date()), {
      announcement: `${idea.title} ${idea.saved ? 'removed from' : 'saved to'} your ideas`,
    });
  };

  const moreLikeThese = (
    <button
      type="button"
      className="btn btn-secondary btn-small"
      onClick={() => {
        refine(
          'ideas',
          anySaved
            ? 'Suggest more ideas like the ones I saved, and keep the saved ones.'
            : 'Suggest fresh ideas that suit this event better.',
        );
      }}
    >
      More ideas like these
    </button>
  );

  return (
    <Panel id="ideas-title" title="Personalised ideas" action={moreLikeThese}>
      <p className="panel-figure">{pluralize(plan.ideas.length, 'idea')}</p>
      <IdeaFilters ideas={plan.ideas} filter={filter} onFilter={setFilter} />
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
            <IdeaCard key={idea.id} idea={idea} onToggleSaved={toggleSaved(idea)} />
          ))}
        </ul>
      )}
      <AddIdeaForm plan={plan} update={update} />
    </Panel>
  );
}

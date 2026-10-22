import birthday192 from '../assets/birthday-192.webp';
import birthday96 from '../assets/birthday-96.webp';
import community192 from '../assets/community-192.webp';
import community96 from '../assets/community-96.webp';
import wedding192 from '../assets/wedding-192.webp';
import wedding96 from '../assets/wedding-96.webp';
import { formatDate } from '../../shared/dates.js';
import { formatMoney } from '../../shared/money.js';
import { presets } from '../../shared/presets.js';
import { daysUntil, taskProgress } from '../../shared/timeline.js';
import { vendorProgress } from '../../shared/vendors.js';
import { BrandMark } from '../components/Shell';
import { useDocumentTitle, usePageFocus, useToday } from '../hooks';
import { EVENT_TYPE_LABELS } from '../labels';
import { hrefFor } from '../router';
import { usePlanStore } from '../state/store';

// Illustrations made with Google Antigravity; fingerprinted by Vite, so cached for a year.
const PICTURES = {
  wedding: {
    src: wedding96,
    srcSet: `${wedding96} 1x, ${wedding192} 2x`,
    alt: 'A wedding mandap hung with marigold garlands',
  },
  birthday: {
    src: birthday96,
    srcSet: `${birthday96} 1x, ${birthday192} 2x`,
    alt: 'A birthday cake with seven candles among planets and stars',
  },
  community: {
    src: community96,
    srcSet: `${community96} 1x, ${community192} 2x`,
    alt: 'Market stalls under hanging lanterns, with diyas in front',
  },
} as const;

function daysLabel(days: number): string {
  if (days < 0) return 'Done';
  if (days === 0) return 'Today';
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Start a plan from a sample or from scratch, and reopen saved plans. */
export default function HomeView() {
  const today = useToday();
  const { plans, ready } = usePlanStore();
  const heading = usePageFocus<HTMLHeadingElement>('home');
  useDocumentTitle('Plan a celebration');

  return (
    <>
      <div className="title-row">
        <div className="title-text">
          <h1 ref={heading} tabIndex={-1} className="title">
            Plan a celebration
          </h1>
          <p className="meta">
            Weddings, birthdays and community events. Utsav drafts the budget, timeline, vendor
            checklist and ideas with Gemini; you change anything you like.
          </p>
        </div>
      </div>

      <section aria-labelledby="start-title">
        <h2 id="start-title" className="section-title">
          Start a plan
        </h2>
        <ul className="grid">
          {presets(today).map((preset) => (
            <li key={preset.id} className="panel preset span-3 stretch">
              <img
                className="picture"
                src={PICTURES[preset.id].src}
                srcSet={PICTURES[preset.id].srcSet}
                alt={PICTURES[preset.id].alt}
                width="96"
                height="96"
                loading="lazy"
              />
              <div>
                <h3 className="row-title">{preset.label}</h3>
                <p className="row-sub">{preset.blurb}</p>
              </div>
              <a
                className="btn btn-secondary"
                href={hrefFor({ name: 'new', preset: preset.id })}
                aria-label={`Start with this: ${preset.label} sample`}
              >
                Start with this
              </a>
            </li>
          ))}
          <li className="panel preset span-3 stretch">
            <div className="picture picture-mark">
              <BrandMark className="picture-mark-svg" />
            </div>
            <div>
              <h3 className="row-title">Your own event</h3>
              <p className="row-sub">Any wedding, birthday or fair</p>
            </div>
            <a className="btn btn-primary" href="#/new">
              New plan
            </a>
          </li>
        </ul>
      </section>

      <section className="section" aria-labelledby="plans-title">
        <h2 id="plans-title" className="section-title">
          Your plans
        </h2>
        {!ready ? (
          <p className="meta" role="status">
            Loading your plans…
          </p>
        ) : plans.length === 0 ? (
          <p className="empty">
            No plans yet. Start from a sample above or make your own; plans are saved in this
            browser only.
          </p>
        ) : (
          <div className="panel">
            <div className="table-wrap">
              <table className="table">
                <caption className="sr-only">Your saved plans</caption>
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col" className="num">
                      Date
                    </th>
                    <th scope="col" className="num">
                      To go
                    </th>
                    <th scope="col" className="num">
                      Tasks done
                    </th>
                    <th scope="col" className="num">
                      Vendors booked
                    </th>
                    <th scope="col" className="num">
                      Budget
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => {
                    const tasks = taskProgress(plan.tasks);
                    const vendors = vendorProgress(plan.vendors);
                    return (
                      <tr key={plan.id}>
                        <td>
                          <div className="row-main">
                            <a
                              className="row-title"
                              href={hrefFor({ name: 'plan', id: plan.id, tab: 'overview' })}
                            >
                              {plan.brief.title}
                            </a>
                            <span className="row-sub">
                              {EVENT_TYPE_LABELS[plan.brief.type]} · {plan.brief.location} ·{' '}
                              {plan.brief.guests} guests
                            </span>
                          </div>
                        </td>
                        <td className="num" data-label="Date">
                          {formatDate(plan.brief.date)}
                        </td>
                        <td className="num" data-label="To go">
                          {daysLabel(daysUntil(plan.brief.date, today))}
                        </td>
                        <td className="num" data-label="Tasks done">
                          {tasks.done} <span className="unit">/ {tasks.total}</span>
                        </td>
                        <td className="num" data-label="Vendors booked">
                          {vendors.booked} <span className="unit">/ {vendors.needed}</span>
                        </td>
                        <td className="num" data-label="Budget">
                          {formatMoney(plan.brief.budget, plan.brief.currency)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <p className="footnote">
          Your plans are stored only in this browser. To draft a plan, Utsav sends the event details
          you type (never vendor contacts or notes) to Google Gemini on Vertex AI.
        </p>
      </section>
    </>
  );
}

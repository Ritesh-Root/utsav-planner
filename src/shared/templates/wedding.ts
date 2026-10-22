import type { AiPlan, Brief } from '../schemas.js';
import type { EventTemplate } from './types.js';
import { at, share } from './types.js';

const tasks: AiPlan['timeline'] = [
  {
    title: 'Agree the budget and draft the guest list',
    details: 'Agree who pays for what and list must-invite guests first.',
    daysBefore: 300,
    priority: 'high',
  },
  {
    title: 'Shortlist and book the venue',
    details: 'Visit at least three venues and check capacity, parking and step-free access.',
    daysBefore: 270,
    priority: 'high',
  },
  {
    title: 'Book the caterer and plan a tasting',
    details: 'Share dietary needs early and ask for per-plate pricing in writing.',
    daysBefore: 240,
    priority: 'high',
  },
  {
    title: 'Book the photographer and videographer',
    details: 'Review full albums, not just highlights, before paying an advance.',
    daysBefore: 210,
    priority: 'high',
  },
  {
    title: 'Choose the decor theme and book the decorator',
    details: 'Share venue photos and your colour palette with the decorator.',
    daysBefore: 150,
    priority: 'medium',
  },
  {
    title: 'Shop for wedding outfits',
    details: 'Leave time for at least two fittings and alterations.',
    daysBefore: 120,
    priority: 'medium',
  },
  {
    title: 'Send save-the-dates',
    details: 'Give out-of-town guests time to plan travel.',
    daysBefore: 120,
    priority: 'medium',
  },
  {
    title: 'Book makeup and mehendi artists',
    details: 'Book trials and confirm how many people they can cover.',
    daysBefore: 90,
    priority: 'medium',
  },
  {
    title: 'Send invitations',
    details: 'Digital invitations save paper and make RSVPs easier to track.',
    daysBefore: 60,
    priority: 'high',
  },
  {
    title: 'Plan guest travel and stay',
    details: 'Block rooms near the venue and note who needs pickups.',
    daysBefore: 60,
    priority: 'medium',
  },
  {
    title: 'Finalise the menu after the tasting',
    details: 'Confirm counts for every dietary need you listed.',
    daysBefore: 45,
    priority: 'high',
  },
  {
    title: 'Confirm the ceremony schedule with family',
    details: 'Agree timings for each ritual and who leads it.',
    daysBefore: 30,
    priority: 'medium',
  },
  {
    title: 'Collect RSVPs and confirm the head count',
    details: 'Share the final count with the caterer and venue.',
    daysBefore: 21,
    priority: 'high',
  },
  {
    title: 'Finalise seating and the run sheet',
    details: 'Keep elders and guests with mobility needs close to exits and restrooms.',
    daysBefore: 10,
    priority: 'medium',
  },
  {
    title: 'Reconfirm every vendor and share the run sheet',
    details: 'Send each vendor arrival times and a day-of contact person.',
    daysBefore: 5,
    priority: 'high',
  },
  {
    title: 'Prepare payments and an emergency kit',
    details: 'Label envelopes for balances and pack safety pins, medicines and chargers.',
    daysBefore: 2,
    priority: 'medium',
  },
  {
    title: 'Hand the day to a trusted coordinator',
    details: 'Let one person handle vendors so the family can enjoy the day.',
    daysBefore: 0,
    priority: 'high',
  },
  {
    title: 'Settle final vendor payments',
    details: 'Check invoices against quotes before paying balances.',
    daysBefore: -3,
    priority: 'high',
  },
  {
    title: 'Send thank-you messages',
    details: 'Thank guests and vendors, and share a few photos.',
    daysBefore: -14,
    priority: 'medium',
  },
];

const multiDayTask: AiPlan['timeline'][number] = {
  title: 'Plan the pre-wedding celebrations',
  details: 'Set dates, venues and guest lists for each pre-wedding function.',
  daysBefore: 75,
  priority: 'medium',
};

function foodIdea(brief: Brief): AiPlan['ideas'][number] {
  const needs = brief.dietary.length > 0 ? brief.dietary.join(', ') : 'every guest';
  return {
    category: 'food',
    title: 'Live counters with clear labels',
    description: `Add two live counters and label every dish so ${needs} options are easy to find.`,
    costTier: 'medium',
  };
}

export const weddingTemplate: EventTemplate = {
  budget: [
    share(
      'venue',
      'Venue & booking',
      20,
      false,
      'The venue usually sets the scale of everything else.',
    ),
    share(
      'catering',
      'Catering & food',
      30,
      true,
      'Food is the largest per-guest cost at most weddings.',
    ),
    share('decor', 'Decor & flowers', 12, false, 'Mandap or stage, entrance and table decor.'),
    share('photography', 'Photography & video', 9, false, 'Covers photos, video and an album.'),
    share(
      'attire',
      'Outfits & jewellery',
      8,
      false,
      'Outfits for the couple across the functions.',
    ),
    share('beauty', 'Makeup & mehendi', 3, false, 'Makeup, hair and mehendi artists.'),
    share('entertainment', 'Music & entertainment', 5, false, 'DJ, band or performers.'),
    share('invitations', 'Invitations', 2, true, 'Printed or digital invitations.'),
    share('gifts', 'Return gifts & favours', 3, true, 'Small thank-you gifts for guests.'),
    share('rituals', 'Ceremony & rituals', 2, false, 'Officiant fees and ceremony items.'),
    share('transport', 'Transport & logistics', 2, false, 'Guest pickups and vendor logistics.'),
    share(
      'contingency',
      'Contingency buffer',
      8,
      false,
      'A buffer for surprises and price changes.',
    ),
  ],
  timeline: (brief) => (brief.days > 1 ? [...tasks, multiDayTask] : tasks),
  vendors: [
    {
      category: 'Venue',
      budgetKey: 'venue',
      why: 'Popular dates book out months ahead.',
      bookDaysBefore: 270,
      questions: [
        'What is included in the rental fee?',
        'Is there step-free access and backup power?',
        'What is the cancellation policy?',
      ],
    },
    {
      category: 'Caterer',
      budgetKey: 'catering',
      why: 'Feeds every guest across the functions.',
      bookDaysBefore: 240,
      questions: [
        'What is the per-plate price and minimum count?',
        'Can you cater for every dietary need on our list?',
        'Is a tasting included?',
      ],
    },
    {
      category: 'Photographer & videographer',
      budgetKey: 'photography',
      why: 'Captures the day; good teams book early.',
      bookDaysBefore: 210,
      questions: [
        'Can we see a full wedding album?',
        'When will we get edited photos and video?',
        'How many people are on the team?',
      ],
    },
    {
      category: 'Decorator & florist',
      budgetKey: 'decor',
      why: 'Turns the venue into your theme.',
      bookDaysBefore: 150,
      questions: [
        'What does the quote include?',
        'How long do setup and teardown take?',
        'Can decor be reused across functions?',
      ],
    },
    {
      category: 'Makeup & mehendi artist',
      budgetKey: 'beauty',
      why: 'Needed for the couple and close family.',
      bookDaysBefore: 90,
      questions: ['Is a trial included?', 'How many people can you cover in the time slot?'],
    },
    {
      category: 'DJ or live band',
      budgetKey: 'entertainment',
      why: 'Sets the mood at the celebrations.',
      bookDaysBefore: 90,
      questions: [
        'Do you bring your own sound system?',
        'Are there noise or time limits at our venue?',
      ],
    },
    {
      category: 'Officiant',
      budgetKey: 'rituals',
      why: 'Leads the ceremony your family chooses.',
      bookDaysBefore: 60,
      questions: ['How long will the ceremony take?', 'What items should we arrange?'],
    },
  ],
  ideas: (brief) => [
    {
      category: 'theme',
      title: brief.style ? `${brief.style} colour story` : 'Two-colour palette',
      description:
        'Pick two main colours and use them across invites, decor and outfits for a polished look.',
      costTier: 'low',
    },
    {
      category: 'decor',
      title: 'Reusable floral installations',
      description:
        'Design entrance and stage florals that move between functions to stretch the decor budget.',
      costTier: 'medium',
    },
    foodIdea(brief),
    {
      category: 'activity',
      title: 'Family memory wall',
      description:
        'Display old family photos with short captions so guests can mingle and share stories.',
      costTier: 'low',
    },
    {
      category: 'culture',
      title: 'Explain the rituals',
      description:
        'Print a small card that explains each ceremony so every guest can follow along.',
      costTier: 'low',
    },
    {
      category: 'accessibility',
      title: 'Comfort for elders and disabled guests',
      description:
        'Reserve front seating, step-free routes and a quiet rest area close to restrooms.',
      costTier: 'low',
    },
    {
      category: 'sustainability',
      title: 'Low-waste wedding',
      description:
        'Use digital invites, steel or leaf plates and arrange to donate leftover food safely.',
      costTier: 'low',
    },
  ],
  dayOf: (brief) => {
    const last = brief.days;
    const items: AiPlan['dayOf'] = [];
    for (let day = 1; day < last; day += 1) {
      items.push({ day, startMinute: at(17), title: 'Pre-wedding celebration' });
    }
    items.push(
      { day: last, startMinute: at(8), title: 'Getting ready, makeup and photos' },
      { day: last, startMinute: at(11), title: 'Guests arrive and welcome drinks' },
      { day: last, startMinute: at(12), title: 'Wedding ceremony' },
      { day: last, startMinute: at(14), title: 'Lunch' },
      { day: last, startMinute: at(19), title: 'Reception and dinner' },
      { day: last, startMinute: at(22), title: 'Send-off and vendor wrap-up' },
    );
    return items;
  },
};

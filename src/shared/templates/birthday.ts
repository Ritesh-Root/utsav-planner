import type { AiPlan, Brief } from '../schemas.js';
import type { EventTemplate } from './types.js';
import { at, share } from './types.js';

function ageGroup(brief: Brief): 'kid' | 'teen' | 'adult' | 'milestone' {
  const age = brief.honoreeAge;
  if (age === null) return 'adult';
  if (age < 13) return 'kid';
  if (age < 20) return 'teen';
  return age % 10 === 0 || age >= 60 ? 'milestone' : 'adult';
}

const THEME_IDEAS: Record<ReturnType<typeof ageGroup>, AiPlan['ideas'][number]> = {
  kid: {
    category: 'theme',
    title: 'Treasure hunt adventure',
    description:
      'Hide clues around the venue that lead to the cake; teams of children solve them together.',
    costTier: 'low',
  },
  teen: {
    category: 'theme',
    title: 'Photo booth and playlist party',
    description: 'Set up a prop photo corner and let guests add songs to a shared playlist.',
    costTier: 'low',
  },
  adult: {
    category: 'theme',
    title: 'Relaxed dinner party',
    description: 'A long-table dinner with soft lighting and a short toast from close friends.',
    costTier: 'medium',
  },
  milestone: {
    category: 'theme',
    title: 'Memory lane celebration',
    description: 'Display photos from each decade and invite guests to share a favourite memory.',
    costTier: 'low',
  },
};

const ACTIVITY_IDEAS: Record<ReturnType<typeof ageGroup>, AiPlan['ideas'][number]> = {
  kid: {
    category: 'activity',
    title: 'Craft table',
    description: 'Let children decorate their own party hats or cookies to take home.',
    costTier: 'low',
  },
  teen: {
    category: 'activity',
    title: 'Mini tournament',
    description: 'Run a short board-game or video-game tournament with a small prize.',
    costTier: 'low',
  },
  adult: {
    category: 'activity',
    title: 'Toasts and a quiz',
    description: 'A five-question quiz about the guest of honour breaks the ice.',
    costTier: 'low',
  },
  milestone: {
    category: 'activity',
    title: 'Message jar',
    description: 'Guests write wishes on cards that become a keepsake book.',
    costTier: 'low',
  },
};

export const birthdayTemplate: EventTemplate = {
  budget: [
    share(
      'venue',
      'Venue or home setup',
      15,
      false,
      'A hall, restaurant space or setting up at home.',
    ),
    share('catering', 'Food & snacks', 30, true, 'Food is the main per-guest cost.'),
    share('cake', 'Cake & desserts', 8, false, 'The cake plus a few desserts.'),
    share('decor', 'Decorations', 12, false, 'Balloons, banners and a theme backdrop.'),
    share('entertainment', 'Games & entertainment', 15, false, 'Activities or an entertainer.'),
    share('gifts', 'Return gifts', 8, true, 'Small thank-you gifts for guests.'),
    share('photography', 'Photos', 4, false, 'A photographer or a photo-booth setup.'),
    share('contingency', 'Contingency buffer', 8, false, 'A buffer for last-minute needs.'),
  ],
  timeline: () => [
    {
      title: 'Pick a theme and make the guest list',
      details: 'The theme guides decor, cake and invitations.',
      daysBefore: 45,
      priority: 'high',
    },
    {
      title: 'Book the venue or plan the home setup',
      details: 'Check space for games and seating for every guest.',
      daysBefore: 40,
      priority: 'high',
    },
    {
      title: 'Send invitations',
      details: 'Ask about allergies and dietary needs in the RSVP.',
      daysBefore: 30,
      priority: 'high',
    },
    {
      title: 'Book an entertainer or plan games',
      details: 'Plan one active and one calm activity.',
      daysBefore: 30,
      priority: 'medium',
    },
    {
      title: 'Order the cake',
      details: 'Share the theme, guest count and any allergies with the baker.',
      daysBefore: 14,
      priority: 'high',
    },
    {
      title: 'Plan the menu',
      details: 'Choose finger food that is easy to eat while mingling.',
      daysBefore: 14,
      priority: 'medium',
    },
    {
      title: 'Buy decorations',
      details: 'Prefer reusable decorations over single-use plastic.',
      daysBefore: 10,
      priority: 'medium',
    },
    {
      title: 'Prepare return gifts',
      details: 'Pack one per guest, plus a few spares.',
      daysBefore: 7,
      priority: 'medium',
    },
    {
      title: 'Confirm RSVPs and dietary needs',
      details: 'Share the final count with the caterer or baker.',
      daysBefore: 5,
      priority: 'high',
    },
    {
      title: 'Make the playlist and games plan',
      details: 'Keep a simple timetable so the party flows.',
      daysBefore: 3,
      priority: 'low',
    },
    {
      title: 'Set up the decorations',
      details: 'Set up the night before or the morning of the party.',
      daysBefore: 1,
      priority: 'medium',
    },
    {
      title: 'Celebrate and take photos',
      details: 'Ask one friend to be in charge of photos.',
      daysBefore: 0,
      priority: 'high',
    },
    {
      title: 'Send thank-you notes and photos',
      details: 'Share a few favourite photos with guests.',
      daysBefore: -3,
      priority: 'low',
    },
  ],
  vendors: [
    {
      category: 'Cake baker',
      budgetKey: 'cake',
      why: 'The centrepiece of the celebration.',
      bookDaysBefore: 14,
      questions: [
        'Can you match our theme?',
        'Can you make it free from the allergens on our list?',
        'Do you deliver?',
      ],
    },
    {
      category: 'Caterer or restaurant',
      budgetKey: 'catering',
      why: 'Food for every guest.',
      bookDaysBefore: 21,
      questions: ['What is the per-head price?', 'Can you label dishes for dietary needs?'],
    },
    {
      category: 'Entertainer or activity host',
      budgetKey: 'entertainment',
      why: 'Keeps guests engaged.',
      bookDaysBefore: 30,
      questions: ['How long is the session?', 'What do you need from us on the day?'],
    },
    {
      category: 'Decorator or balloon artist',
      budgetKey: 'decor',
      why: 'Creates the theme backdrop.',
      bookDaysBefore: 14,
      questions: ['What does the package include?', 'How long does setup take?'],
    },
  ],
  ideas: (brief) => {
    const group = ageGroup(brief);
    const needs = brief.dietary.length > 0 ? brief.dietary.join(', ') : 'any';
    return [
      THEME_IDEAS[group],
      ACTIVITY_IDEAS[group],
      {
        category: 'food',
        title: 'Labelled snack table',
        description: `Label every dish so guests with ${needs} dietary needs can choose with confidence.`,
        costTier: 'low',
      },
      {
        category: 'decor',
        title: 'One statement backdrop',
        description:
          'Put most of the decor budget into one photo backdrop instead of decorating every wall.',
        costTier: 'low',
      },
      {
        category: 'keepsake',
        title: 'Instant photo guestbook',
        description: 'Guests add a photo and a wish to a book the guest of honour keeps.',
        costTier: 'medium',
      },
      {
        category: 'accessibility',
        title: 'Quiet corner',
        description: 'Set up a calm space with seating for anyone who needs a break from noise.',
        costTier: 'low',
      },
      {
        category: 'sustainability',
        title: 'Reusable tableware',
        description: 'Use washable plates and cups and skip balloon releases.',
        costTier: 'low',
      },
    ];
  },
  dayOf: () => [
    { day: 1, startMinute: at(15), title: 'Final setup and decor check' },
    { day: 1, startMinute: at(16), title: 'Guests arrive' },
    { day: 1, startMinute: at(16, 30), title: 'Games and activities' },
    { day: 1, startMinute: at(17, 30), title: 'Cake cutting' },
    { day: 1, startMinute: at(18), title: 'Food is served' },
    { day: 1, startMinute: at(19), title: 'Return gifts and goodbyes' },
  ],
};

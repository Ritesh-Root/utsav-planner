import { addDays } from './dates.js';
import type { Brief, EventType } from './schemas.js';

export interface Preset {
  id: EventType;
  label: string;
  blurb: string;
  brief: Brief;
}

/** One-click samples with dates relative to today, so they never go stale. */
export function presets(today: string): Preset[] {
  return [
    {
      id: 'wedding',
      label: 'Indian wedding',
      blurb: '3 days · 250 guests · ₹15 lakh',
      brief: {
        type: 'wedding',
        title: 'Asha & Rohan’s wedding',
        date: addDays(today, 120),
        location: 'Jaipur',
        guests: 250,
        budget: 1_500_000,
        currency: 'INR',
        venue: 'outdoor',
        style: 'Royal pastel',
        priorities: ['food', 'photography', 'traditions'],
        dietary: ['vegetarian', 'jain'],
        days: 3,
        honoreeAge: null,
        notes: 'Mehendi and sangeet before the wedding day. Two grandparents use wheelchairs.',
      },
    },
    {
      id: 'birthday',
      label: 'Kid’s 7th birthday',
      blurb: '30 guests · ₹25,000',
      brief: {
        type: 'birthday',
        title: 'Mira’s 7th birthday',
        date: addDays(today, 30),
        location: 'Pune',
        guests: 30,
        budget: 25_000,
        currency: 'INR',
        venue: 'indoor',
        style: 'Space explorers',
        priorities: ['entertainment', 'saving-money'],
        dietary: ['nut-free'],
        days: 1,
        honoreeAge: 7,
        notes: 'Mostly classmates and their parents. One child has a nut allergy.',
      },
    },
    {
      id: 'community',
      label: 'Diwali community mela',
      blurb: '500 people · ₹2 lakh',
      brief: {
        type: 'community',
        title: 'Green Park Diwali mela',
        date: addDays(today, 45),
        location: 'Green Park, New Delhi',
        guests: 500,
        budget: 200_000,
        currency: 'INR',
        venue: 'outdoor',
        style: 'Festival of lights',
        priorities: ['sustainability', 'guest-comfort', 'entertainment'],
        dietary: ['vegetarian'],
        days: 1,
        honoreeAge: null,
        notes:
          'Residents’ association event in the park. We want a plastic-free fair with stalls by local home cooks.',
      },
    },
  ];
}

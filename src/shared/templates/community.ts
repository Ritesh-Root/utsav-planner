import type { EventTemplate } from './types.js';
import { at, share } from './types.js';

export const communityTemplate: EventTemplate = {
  budget: [
    share(
      'venue',
      'Ground or hall',
      14,
      false,
      'The site booking, often from a local body or society.',
    ),
    share(
      'permits',
      'Permits & permissions',
      4,
      false,
      'Local permissions for public gatherings, sound and food.',
    ),
    share(
      'sound-light',
      'Sound & lighting',
      12,
      false,
      'Stage sound, lights and a backup generator.',
    ),
    share('rentals', 'Tents, stage & furniture', 10, false, 'Shade, seating and the stage.'),
    share(
      'catering',
      'Food & refreshments',
      14,
      true,
      'Refreshments for volunteers and attendees.',
    ),
    share('decor', 'Decor & signage', 8, false, 'Entrance decor and clear direction signs.'),
    share(
      'entertainment',
      'Performances & activities',
      10,
      false,
      'Performers, competitions and prizes.',
    ),
    share('safety', 'Safety & first aid', 8, false, 'First aid, fire safety and crowd marshals.'),
    share('marketing', 'Publicity & printing', 5, false, 'Posters, social media and flyers.'),
    share('cleanup', 'Waste & cleanup', 5, false, 'Bins, segregation and a cleanup crew.'),
    share(
      'contingency',
      'Contingency buffer',
      10,
      false,
      'A buffer for weather and last-minute needs.',
    ),
  ],
  timeline: () => [
    {
      title: 'Form an organising committee and assign roles',
      details: 'Name leads for permits, money, safety, programme and volunteers.',
      daysBefore: 120,
      priority: 'high',
    },
    {
      title: 'Apply for local permits and permissions',
      details: 'Check what your local authority needs for crowds, sound and food stalls.',
      daysBefore: 90,
      priority: 'high',
    },
    {
      title: 'Book the ground or hall',
      details: 'Confirm capacity, power, water and step-free access.',
      daysBefore: 90,
      priority: 'high',
    },
    {
      title: 'Set the budget and sponsorship plan',
      details: 'List costs and approach local businesses and residents for support.',
      daysBefore: 75,
      priority: 'medium',
    },
    {
      title: 'Book sound, lighting and a generator',
      details: 'Ask about noise limits and cut-off times.',
      daysBefore: 60,
      priority: 'medium',
    },
    {
      title: 'Line up performers and competitions',
      details: 'Mix acts for children, families and elders.',
      daysBefore: 60,
      priority: 'medium',
    },
    {
      title: 'Recruit and organise volunteers',
      details: 'Plan shifts for entry, stalls, safety and cleanup.',
      daysBefore: 45,
      priority: 'high',
    },
    {
      title: 'Publicise the event',
      details: 'Use posters, residents’ groups and social media.',
      daysBefore: 30,
      priority: 'medium',
    },
    {
      title: 'Write the safety plan',
      details: 'Cover first aid, fire extinguishers, crowd flow and lost-child points.',
      daysBefore: 30,
      priority: 'high',
    },
    {
      title: 'Plan accessibility',
      details: 'Arrange ramps, reserved seating and accessible toilets.',
      daysBefore: 21,
      priority: 'high',
    },
    {
      title: 'Arrange waste segregation and cleanup',
      details: 'Place labelled bins and agree who clears the site.',
      daysBefore: 21,
      priority: 'medium',
    },
    {
      title: 'Brief volunteers and walk the site',
      details: 'Share the run sheet, emergency contacts and exits.',
      daysBefore: 3,
      priority: 'high',
    },
    {
      title: 'Set up the site',
      details: 'Put up tents, stage, signs and bins.',
      daysBefore: 1,
      priority: 'high',
    },
    {
      title: 'Run the event and keep a log',
      details: 'Keep one coordinator free to handle problems.',
      daysBefore: 0,
      priority: 'high',
    },
    {
      title: 'Clean up and return rentals',
      details: 'Leave the site as you found it.',
      daysBefore: -1,
      priority: 'high',
    },
    {
      title: 'Thank volunteers and sponsors',
      details: 'Share photos and a short thank-you note.',
      daysBefore: -7,
      priority: 'medium',
    },
    {
      title: 'Publish the accounts',
      details: 'Share a simple income and spending summary with the community.',
      daysBefore: -14,
      priority: 'medium',
    },
  ],
  vendors: [
    {
      category: 'Sound & lighting',
      budgetKey: 'sound-light',
      why: 'Performances and announcements need clear sound.',
      bookDaysBefore: 60,
      questions: ['Is a backup generator included?', 'What are the noise limits at this site?'],
    },
    {
      category: 'Tent, stage & furniture rental',
      budgetKey: 'rentals',
      why: 'Shade and seating for the crowd.',
      bookDaysBefore: 45,
      questions: ['What is the setup and pickup time?', 'Do you provide ramps or level flooring?'],
    },
    {
      category: 'Food stalls or caterer',
      budgetKey: 'catering',
      why: 'Refreshments for attendees and volunteers.',
      bookDaysBefore: 45,
      questions: ['Do you have the required food licence?', 'How will you handle waste?'],
    },
    {
      category: 'First aid & security',
      budgetKey: 'safety',
      why: 'Keeps a large crowd safe.',
      bookDaysBefore: 30,
      questions: ['How many staff for our expected crowd?', 'What equipment do you bring?'],
    },
    {
      category: 'Printing & signage',
      budgetKey: 'marketing',
      why: 'Posters, banners and direction signs.',
      bookDaysBefore: 30,
      questions: ['What is the turnaround time?', 'Can you print large-text, high-contrast signs?'],
    },
    {
      category: 'Waste management & cleanup',
      budgetKey: 'cleanup',
      why: 'Keeps the site clean and segregates waste.',
      bookDaysBefore: 21,
      questions: ['Do you collect segregated waste?', 'When can you clear the site?'],
    },
  ],
  ideas: (brief) => [
    {
      category: 'theme',
      title: brief.style ? `${brief.style} festival` : 'Neighbourhood festival',
      description:
        'Give the event one clear theme that runs through the stage, signs and activities.',
      costTier: 'low',
    },
    {
      category: 'activity',
      title: 'Community art wall',
      description: 'A large canvas where everyone adds a handprint or drawing during the day.',
      costTier: 'low',
    },
    {
      category: 'food',
      title: 'Home-cook stalls',
      description: `Invite residents to run small stalls, with clear labels for ${brief.dietary.length > 0 ? brief.dietary.join(', ') : 'dietary'} options.`,
      costTier: 'low',
    },
    {
      category: 'culture',
      title: 'Showcase local talent',
      description: 'Give stage time to children, elders and local groups before headline acts.',
      costTier: 'low',
    },
    {
      category: 'accessibility',
      title: 'Accessible by design',
      description:
        'Mark step-free routes, reserve front seating and add a quiet zone and an assistance desk.',
      costTier: 'low',
    },
    {
      category: 'sustainability',
      title: 'Plastic-free fair',
      description:
        'Offer water refill stations and ask stalls to use leaf, paper or steel serveware.',
      costTier: 'low',
    },
  ],
  dayOf: (brief) => {
    const items = [];
    for (let day = 1; day <= brief.days; day += 1) {
      items.push(
        { day, startMinute: at(9), title: 'Volunteer briefing and safety check' },
        { day, startMinute: at(16), title: 'Gates open' },
        { day, startMinute: at(17), title: 'Opening and welcome' },
        { day, startMinute: at(18), title: 'Performances and competitions' },
        { day, startMinute: at(21), title: 'Closing announcements' },
      );
    }
    items.push({ day: brief.days, startMinute: at(22), title: 'Cleanup' });
    return items.slice(-14);
  },
};

// Checks a running deployment end to end: health, security headers, and one
// real AI plan per sample event. Usage: npm run smoke:live -- https://your-url
const base = (process.argv[2] ?? 'http://localhost:8080').replace(/\/$/, '');
const today = new Date().toISOString().slice(0, 10);
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` (${detail})` : ''}`);
};

const health = await fetch(`${base}/api/health`).then((r) => r.json());
check(health.status === 'ok', 'health', `ai=${health.ai} model=${health.model}`);

const page = await fetch(`${base}/`);
const csp = page.headers.get('content-security-policy') ?? '';
check(csp.includes("script-src 'self'") && !csp.includes('unsafe-inline'), 'strict CSP');
check(page.headers.get('x-content-type-options') === 'nosniff', 'nosniff');
check((page.headers.get('strict-transport-security') ?? '').includes('max-age'), 'HSTS');

const briefs = [
  {
    type: 'wedding',
    title: 'Smoke test wedding',
    date: inDays(120),
    location: 'Jaipur',
    guests: 250,
    budget: 1500000,
    currency: 'INR',
    venue: 'outdoor',
    style: 'Royal pastel',
    priorities: ['food'],
    dietary: ['vegetarian'],
    days: 3,
    honoreeAge: null,
    notes: '',
  },
  {
    type: 'birthday',
    title: 'Smoke test birthday',
    date: inDays(30),
    location: 'Pune',
    guests: 30,
    budget: 25000,
    currency: 'INR',
    venue: 'indoor',
    style: 'Space explorers',
    priorities: [],
    dietary: ['nut-free'],
    days: 1,
    honoreeAge: 7,
    notes: '',
  },
  {
    type: 'community',
    title: 'Smoke test mela',
    date: inDays(45),
    location: 'New Delhi',
    guests: 500,
    budget: 200000,
    currency: 'INR',
    venue: 'outdoor',
    style: 'Festival of lights',
    priorities: ['sustainability'],
    dietary: [],
    days: 1,
    honoreeAge: null,
    notes: '',
  },
];
for (const brief of briefs) {
  const started = Date.now();
  const response = await fetch(`${base}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brief, today }),
  });
  const body = await response.json();
  const ms = Date.now() - started;
  check(
    response.ok && body.meta?.source === 'ai',
    `${brief.type} plan from Gemini`,
    `${ms} ms, source=${body.meta?.source}, tasks=${body.plan?.tasks?.length}`,
  );
}

const blocked = await fetch(`${base}/api/plan`, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain' },
  body: 'x',
});
check(blocked.status === 415, 'rejects non-JSON', `status ${blocked.status}`);
process.exit(failures > 0 ? 1 : 0);

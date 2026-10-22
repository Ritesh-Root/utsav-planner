import { Suspense, lazy } from 'react';

import { ErrorBoundary } from './components/ErrorBoundary';
import { Shell } from './components/Shell';
import { useDocumentTitle, usePageFocus } from './hooks';
import { useRoute } from './router';
import { AnnouncerProvider } from './state/announcer';
import { SettingsProvider } from './state/settings';
import { PlanStoreProvider } from './state/store';
import HomeView from './views/HomeView';

// The home screen ships in the first chunk; every other view loads when visited.
const NewPlanView = lazy(() => import('./views/NewPlanView'));
const PlanView = lazy(() => import('./views/PlanView'));
const SettingsView = lazy(() => import('./views/SettingsView'));

function NotFound() {
  const heading = usePageFocus<HTMLHeadingElement>('not-found');
  useDocumentTitle('Page not found');
  return (
    <div className="title-text">
      <h1 ref={heading} tabIndex={-1} className="title">
        Page not found
      </h1>
      <p className="meta">
        <a href="#/">Go to your plans</a>
      </p>
    </div>
  );
}

function Routes() {
  const route = useRoute();
  let view;
  switch (route.name) {
    case 'home':
      view = <HomeView />;
      break;
    case 'new':
      view = <NewPlanView key={route.preset ?? 'blank'} preset={route.preset} />;
      break;
    case 'plan':
      view = <PlanView key={route.id} id={route.id} tab={route.tab} />;
      break;
    case 'settings':
      view = <SettingsView />;
      break;
    case 'not-found':
      view = <NotFound />;
      break;
  }
  return (
    <Shell route={route}>
      <ErrorBoundary key={route.name}>
        <Suspense fallback={<p className="meta">Loading…</p>}>{view}</Suspense>
      </ErrorBoundary>
    </Shell>
  );
}

export function App() {
  return (
    <SettingsProvider>
      <AnnouncerProvider>
        <PlanStoreProvider>
          <Routes />
        </PlanStoreProvider>
      </AnnouncerProvider>
    </SettingsProvider>
  );
}

import { useEffect } from 'preact/hooks';
import { ErrorBox, Loading, Toasts } from './components/Feedback.tsx';
import { IconEdit, IconMore, IconToday, IconWeek } from './components/Icons.tsx';
import { NotifyPrompt } from './components/NotifyPrompt.tsx';
import { IS_OFFICE } from './config.ts';
import { useStore } from './data/hooks.ts';
import { store } from './data/store.ts';
import { useRoute } from './lib/router.ts';
import { Admin } from './screens/Admin.tsx';
import { Login } from './screens/Login.tsx';
import { More } from './screens/More.tsx';
import { MyWeek } from './screens/MyWeek.tsx';
import { Today } from './screens/Today.tsx';
import { Week } from './screens/Week.tsx';

const NAV = [
  { name: 'today', label: 'היום', href: '#/today', Icon: IconToday },
  { name: 'week', label: 'שבוע', href: '#/week', Icon: IconWeek },
  { name: 'me', label: 'השבוע שלי', href: '#/me', Icon: IconEdit },
  { name: 'more', label: 'עוד', href: '#/more', Icon: IconMore },
];

/** Auth gate + screen routing + bottom navigation. */
export function App() {
  const session = useStore((s) => s.session);
  const boot = useStore((s) => s.boot);
  const bootError = useStore((s) => s.bootError);
  const route = useRoute();

  // Cached data renders instantly; refresh the roster/statuses once per app start
  useEffect(() => {
    if (session) void store.loadBoot();
  }, [session?.token]);

  if (!session) {
    return (
      <>
        <Login />
        <Toasts />
      </>
    );
  }

  if (!boot) {
    return (
      <main class="screen is-center">
        {bootError ? (
          <>
            <ErrorBox message={bootError} onRetry={() => void store.loadBoot()} />
            <button type="button" class="btn is-ghost" onClick={() => void store.logout()}>התנתקות</button>
          </>
        ) : (
          <Loading label="טוען את הצוות…" />
        )}
        <Toasts />
      </main>
    );
  }

  const screen = (() => {
    switch (route.name) {
      case 'week': return <Week param={route.param} />;
      case 'me': return <MyWeek param={route.param} />;
      case 'more': return <More />;
      case 'admin': return <Admin param={route.param} />;
      default: return <Today param={route.param} />;
    }
  })();

  const active = route.name === 'admin' ? 'more' : route.name;
  return (
    <div class="app">
      <header class="topbar">
        <span class="topbar-title">📍 איפה כולם</span>
        <Toasts />
      </header>
      <main class="content">{screen}</main>
      {!IS_OFFICE && <NotifyPrompt />}
      <nav class="bottom-nav" aria-label="ניווט ראשי">
        {NAV.map(({ name, label, href, Icon }) => (
          <a key={name} href={href} class={`nav-item${active === name ? ' is-active' : ''}`} aria-current={active === name ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

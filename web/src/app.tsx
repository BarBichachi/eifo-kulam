import { ErrorBox, Loading, SyncStatus, Toasts } from './components/Feedback.tsx';
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
  { name: 'me', label: 'השבוע שלי', href: '#/me', Icon: IconEdit, membersOnly: true },
  { name: 'more', label: 'עוד', href: '#/more', Icon: IconMore },
];

/** Auth gate + screen routing + bottom navigation. Read-only viewers get no editing screen. */
export function App() {
  const session = useStore((s) => s.session);
  const boot = useStore((s) => s.boot);
  const bootError = useStore((s) => s.bootError);
  // Re-render on resume so "today" is recomputed after the app sat in the background overnight
  useStore((s) => s.resumeTick);
  const route = useRoute();

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

  const readOnly = boot.me.readOnly === true;
  // Viewers have no "my week": an old link to it lands on today
  const blocked = readOnly && route.name === 'me';
  const routeName = blocked ? 'today' : route.name;
  const param = blocked ? undefined : route.param;
  const screen = (() => {
    switch (routeName) {
      case 'week': return <Week param={param} />;
      case 'me': return <MyWeek param={param} />;
      case 'more': return <More />;
      case 'admin': return <Admin param={param} />;
      default: return <Today param={param} />;
    }
  })();

  const active = routeName === 'admin' ? 'more' : routeName;
  return (
    <div class="app">
      <header class="topbar">
        <span class="topbar-title">📍 איפה כולם {readOnly && <span class="tag is-accent">צפייה בלבד</span>}</span>
        <span class="topbar-status">
          <Toasts />
          <SyncStatus />
        </span>
      </header>
      <main class="content">{screen}</main>
      {!IS_OFFICE && !readOnly && <NotifyPrompt />}
      <nav class="bottom-nav" aria-label="ניווט ראשי">
        {NAV.filter((item) => !(readOnly && item.membersOnly)).map(({ name, label, href, Icon }) => (
          <a key={name} href={href} class={`nav-item${active === name ? ' is-active' : ''}`} aria-current={active === name ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}

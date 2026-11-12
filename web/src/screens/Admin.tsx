import { sortStatuses } from '../../../shared/status.ts';
import { ErrorBox } from '../components/Feedback.tsx';
import { useStore } from '../data/hooks.ts';
import { navigate } from '../lib/router.ts';
import { MembersTab } from './admin/MembersTab.tsx';
import { PushTab } from './admin/PushTab.tsx';
import { StatusesTab } from './admin/StatusesTab.tsx';

const TABS = [
  ['members', 'צוות'],
  ['statuses', 'סטטוסים'],
  ['push', 'התראות'],
] as const;

/** Admin area: roster, status options and notification coverage. */
export function Admin({ param }: { param?: string }) {
  const boot = useStore((s) => s.boot)!;
  const tab = TABS.some(([id]) => id === param) ? param : 'members';
  if (!boot.me.isAdmin) return <ErrorBox message="האזור הזה למנהלים בלבד." />;
  return (
    <section class="screen">
      <h1 class="screen-title">ניהול</h1>
      <nav class="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} class={`tab${tab === id ? ' is-active' : ''}`} onClick={() => navigate(`/admin/${id}`)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'members' && <MembersTab members={boot.members} />}
      {tab === 'statuses' && <StatusesTab statuses={sortStatuses(boot.statuses)} />}
      {tab === 'push' && <PushTab members={boot.members} />}
    </section>
  );
}

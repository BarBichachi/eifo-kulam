import { useEffect, useState } from 'preact/hooks';
import type { PushCoverage } from '../../../../shared/api.ts';
import type { Member } from '../../../../shared/types.ts';
import { ErrorBox, Loading } from '../../components/Feedback.tsx';
import { api } from '../../data/api.ts';
import { store } from '../../data/store.ts';
import { errorText } from './common.tsx';

/** Who enabled notifications, and whether the last push reached them. */
export function PushTab({ members }: { members: Member[] }) {
  const [coverage, setCoverage] = useState<PushCoverage[] | null>(null);
  const [error, setError] = useState('');
  const load = () => {
    setError('');
    store.adminCall((token) => api('pushCoverage', {}, token)).then((r) => setCoverage(r.coverage), (err) => setError(errorText(err)));
  };
  useEffect(load, []);
  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!coverage) return <Loading />;
  const byMember = new Map(coverage.map((c) => [c.memberId, c]));
  const active = members.filter((m) => m.active);
  const covered = active.filter((m) => byMember.has(m.id)).length;
  return (
    <>
      <p class="muted">{covered} מתוך {active.length} הפעילו התראות. מי שלא, יקבל רק את התזכורת בקבוצה.</p>
      <ul class="admin-list">
        {active.map((m) => {
          const c = byMember.get(m.id);
          const failed = c?.lastResult && !/^2\d\d$/.test(c.lastResult);
          return (
            <li key={m.id}>
              <div class="admin-row is-static">
                <strong>{m.name}</strong>
                <span class={`tag ${c ? (failed ? 'is-warning' : 'is-ok') : 'is-muted'}`}>
                  {c ? `${c.devices} מכשירים${c.lastResult ? ` · אחרון: ${failed ? `שגיאה ${c.lastResult}` : 'נשלח'}` : ''}` : 'אין התראות'}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

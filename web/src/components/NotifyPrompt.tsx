import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../data/hooks.ts';
import { isIos } from '../lib/device.ts';
import { enablePush, getPushState, resyncPush, type PushState } from '../lib/push.ts';
import { navigate } from '../lib/router.ts';
import { BottomSheet } from './BottomSheet.tsx';

/** Shown at most once per app launch (module state resets when the app is reopened). */
let shownThisLaunch = false;

/**
 * On every app launch: if notifications are not on for this device, ask to turn them on
 * (or explain how, when the browser cannot ask). If they are on, silently re-register the device.
 */
export function NotifyPrompt() {
  const boot = useStore((s) => s.boot);
  const token = useStore((s) => s.session?.token) ?? '';
  const [state, setState] = useState<PushState | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!boot || !token || shownThisLaunch) return;
    shownThisLaunch = true;
    void getPushState().then((s) => {
      setState(s);
      if (s === 'on') void resyncPush(token).catch((err) => console.warn('Push resync failed', err));
      else setOpen(true);
    });
  }, [boot, token]);

  const enable = async () => {
    setBusy(true);
    setError('');
    try {
      const next = await enablePush(boot?.vapidPublicKey ?? '', token);
      setState(next);
      if (next === 'on') setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const showGuide = () => {
    setOpen(false);
    navigate('/more');
  };

  return (
    <BottomSheet open={open} onClose={() => setOpen(false)} title="🔔 להפעיל התראות?">
      <p>כל יום רביעי ב-07:30 נזכיר לך לעדכן איפה תהיה בשבוע הבא. בלי התראות קל לשכוח.</p>
      {state === 'off' && (
        <button type="button" class="btn is-primary is-block" disabled={busy} onClick={enable}>
          {busy ? 'מפעיל…' : 'הפעלת התראות'}
        </button>
      )}
      {state === 'needs-install' && (
        <>
          <p class="banner is-info">באייפון התראות עובדות רק מהאפליקציה שעל מסך הבית.</p>
          <ol class="steps">
            <li>פתחו את הקישור ב-<strong>Safari</strong> (לא מתוך וואטסאפ).</li>
            <li>כפתור השיתוף <span aria-hidden="true">⬆️</span> ← <strong>"הוספה למסך הבית"</strong>.</li>
            <li>פתחו את "איפה כולם" מהאייקון ואשרו התראות.</li>
          </ol>
        </>
      )}
      {state === 'denied' && (
        <p class="banner is-warning">
          ההתראות חסומות. {isIos() ? 'הגדרות ← התראות ← איפה כולם ← לאפשר.' : 'בהגדרות האתר/האפליקציה ← התראות ← לאפשר.'} ואז לפתוח מחדש.
        </p>
      )}
      {state === 'unsupported' && (
        <p class="banner is-warning">הדפדפן הזה לא תומך בהתראות. פתחו ב-Chrome (אנדרואיד) או התקינו למסך הבית (אייפון).</p>
      )}
      {error && <p class="hint is-error" role="alert">{error}</p>}
      <div class="row-actions">
        {state !== 'off' && <button type="button" class="btn" onClick={showGuide}>הוראות התקנה</button>}
        <button type="button" class="btn is-ghost" onClick={() => setOpen(false)}>לא עכשיו</button>
      </div>
    </BottomSheet>
  );
}

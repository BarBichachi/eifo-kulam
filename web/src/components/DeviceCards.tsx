import { useEffect, useState } from 'preact/hooks';
import { APP_URL } from '../config.ts';
import { useStore } from '../data/hooks.ts';
import { api } from '../data/api.ts';
import { store } from '../data/store.ts';
import { canPromptInstall, isAndroid, isIos, isStandalone, onInstallAvailabilityChange, promptInstall } from '../lib/device.ts';
import { disablePush, enablePush, getPushState, localTestNotification, type PushState } from '../lib/push.ts';

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Turn notifications on/off for this device and send a test. */
export function NotificationsCard() {
  const boot = useStore((s) => s.boot)!;
  const token = useStore((s) => s.session?.token) ?? '';
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void getPushState().then(setState);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMessage('');
    try {
      await fn();
    } catch (err) {
      setMessage(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const enable = () => run(async () => setState(await enablePush(boot.vapidPublicKey, token)));
  const disable = () => run(async () => {
    await disablePush(token);
    setState('off');
  });
  const test = () => run(async () => {
    if (boot.pushTestEnabled) {
      await api('pushTest', {}, token);
      setMessage('נשלחה בקשה. ההתראה אמורה להגיע תוך דקה בערך, גם אם האפליקציה סגורה.');
    } else {
      await localTestNotification();
      setMessage('הוצגה התראה מקומית. שליחה מהשרת תיבדק בתזכורת של יום רביעי.');
    }
  });

  return (
    <section class="card">
      <h2 class="card-title">🔔 תזכורת שבועית</h2>
      <p class="muted">בכל יום רביעי ב-07:30 תגיע התראה לעדכן את השבוע הבא.</p>
      {state === null && <p class="muted">בודק…</p>}
      {state === 'needs-install' && (
        <p class="banner is-info">באייפון התראות עובדות רק מהאפליקציה שעל מסך הבית. התקינו אותה (הוראות למטה), פתחו מהאייקון וחזרו לכאן.</p>
      )}
      {state === 'unsupported' && <p class="banner is-warning">הדפדפן הזה לא תומך בהתראות. נסו ב-Chrome (אנדרואיד) או מהאפליקציה שעל מסך הבית (אייפון).</p>}
      {state === 'denied' && <p class="banner is-warning">ההתראות חסומות במכשיר. אפשרו התראות עבור האתר/האפליקציה בהגדרות ונסו שוב.</p>}
      {state === 'off' && (
        <button type="button" class="btn is-primary is-block" disabled={busy} onClick={enable}>
          {busy ? 'מפעיל…' : 'הפעלת התראות'}
        </button>
      )}
      {state === 'on' && (
        <>
          <p class="ok-line">✓ ההתראות פעילות במכשיר הזה</p>
          <div class="row-actions">
            <button type="button" class="btn" disabled={busy} onClick={test}>שליחת התראת בדיקה</button>
            <button type="button" class="btn is-ghost" disabled={busy} onClick={disable}>כיבוי</button>
          </div>
        </>
      )}
      {message && <p class="hint" role="status">{message}</p>}
    </section>
  );
}

/** Home-screen install: native prompt where available, step-by-step guide otherwise. */
export function InstallCard() {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall());
  useEffect(() => onInstallAvailabilityChange(() => setCanPrompt(canPromptInstall())), []);
  if (isStandalone()) return null;

  return (
    <section class="card">
      <h2 class="card-title">📲 הוספה למסך הבית</h2>
      <p class="muted">פותחים כמו אפליקציה, בלי לחפש את הקישור בוואטסאפ, ומקבלים התראות.</p>
      {canPrompt ? (
        <button type="button" class="btn is-primary is-block" onClick={() => void promptInstall()}>התקנה</button>
      ) : isIos() ? (
        <ol class="steps">
          <li>פתחו את הקישור ב-<strong>Safari</strong> (לא מתוך וואטסאפ).</li>
          <li>לחצו על כפתור השיתוף <span aria-hidden="true">⬆️</span> בתחתית המסך.</li>
          <li>בחרו <strong>"הוספה למסך הבית"</strong> ואשרו.</li>
          <li>פתחו את "איפה כולם" מהאייקון והפעילו התראות.</li>
        </ol>
      ) : (
        <ol class="steps">
          <li>פתחו את הקישור ב-<strong>Chrome</strong>{isAndroid() ? '' : ' בטלפון'}.</li>
          <li>בתפריט <strong>⋮</strong> בחרו <strong>"הוספה למסך הבית"</strong> או <strong>"התקנת אפליקציה"</strong>.</li>
          <li>פתחו מהאייקון והפעילו התראות.</li>
        </ol>
      )}
    </section>
  );
}

/** Office copy only: notifications and install live in the phone app. */
export function PhoneAppCard() {
  return (
    <section class="card">
      <h2 class="card-title">📱 תזכורות בטלפון</h2>
      <p class="muted">זו גרסת המחשב. התראות יום רביעי והתקנה למסך הבית עובדות באפליקציה בטלפון:</p>
      <a class="btn is-block" href={APP_URL} target="_blank" rel="noopener" dir="ltr">{APP_URL.replace(/^https:\/\//, '')}</a>
    </section>
  );
}

/** Signs out and stops this device from receiving the previous user's reminders. */
export function logoutWithPush(token: string) {
  return store.logout(async () => {
    try {
      await disablePush(token);
    } catch {
      /* logout must not depend on push */
    }
  });
}

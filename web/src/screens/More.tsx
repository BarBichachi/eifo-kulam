import { formatWeekRange, israelToday, nextWeekStart, weekStart } from '../../../shared/dates.ts';
import { formatPhone } from '../../../shared/phone.ts';
import { reminderText, weekSummaryText, whatsappShareUrl } from '../../../shared/share.ts';
import { MEMBER_TYPE_LABELS } from '../../../shared/statuses.ts';
import { notFilled } from '../../../shared/week.ts';
import { InstallCard, NotificationsCard, PhoneAppCard, logoutWithPush } from '../components/DeviceCards.tsx';
import { Loading } from '../components/Feedback.tsx';
import { IconShare } from '../components/Icons.tsx';
import { APP_URL, IS_OFFICE } from '../config.ts';
import { useStatusMap, useStore, useWeek } from '../data/hooks.ts';
import { navigate } from '../lib/router.ts';

const VERSION = import.meta.env.VITE_APP_VERSION ?? 'dev';

/** Who has not filled next week, WhatsApp sharing, notifications, install, account. */
export function More() {
  const boot = useStore((s) => s.boot)!;
  const token = useStore((s) => s.session?.token) ?? '';
  const statusMap = useStatusMap();
  const nextWs = nextWeekStart(israelToday());
  const thisWs = weekStart(israelToday());
  const next = useWeek(nextWs);
  const current = useWeek(thisWs);
  const missing = next.loaded ? notFilled(boot.members, nextWs, next.entries, next.holidays) : [];

  const share = (text: string) => window.open(whatsappShareUrl(text), '_blank', 'noopener');

  return (
    <section class="screen">
      <h1 class="screen-title">עוד</h1>

      <section class="card">
        <h2 class="card-title">⏳ מי עוד לא עדכן את שבוע <span class="nowrap">{formatWeekRange(nextWs)}</span></h2>
        {!next.loaded ? (
          <Loading />
        ) : missing.length === 0 ? (
          <p class="ok-line">כולם עדכנו 🎉</p>
        ) : (
          <ul class="name-list">
            {missing.map((m) => (
              <li key={m.id} class={m.id === boot.me.id ? 'is-me' : ''}>{m.name}{m.id === boot.me.id ? ' (אני)' : ''}</li>
            ))}
          </ul>
        )}
        {missing.some((m) => m.id === boot.me.id) && (
          <button type="button" class="btn is-primary is-block" onClick={() => navigate(`/me/${nextWs}`)}>לעדכן את השבוע שלי</button>
        )}
        <div class="row-actions">
          <button type="button" class="btn" disabled={!next.loaded} onClick={() => share(reminderText(nextWs, missing, APP_URL))}>
            <IconShare /> תזכורת לקבוצה
          </button>
        </div>
      </section>

      <section class="card">
        <h2 class="card-title">💬 שיתוף סיכום בוואטסאפ</h2>
        <p class="muted">מי לא במשרד בכל יום, עם מספר האנשים במשרד.</p>
        <div class="row-actions">
          <button type="button" class="btn" disabled={!current.loaded} onClick={() => share(weekSummaryText(thisWs, boot.members, statusMap, current.entries, current.holidays, APP_URL))}>
            <IconShare /> השבוע
          </button>
          <button type="button" class="btn" disabled={!next.loaded} onClick={() => share(weekSummaryText(nextWs, boot.members, statusMap, next.entries, next.holidays, APP_URL))}>
            <IconShare /> שבוע הבא
          </button>
        </div>
      </section>

      {IS_OFFICE ? (
        <PhoneAppCard />
      ) : (
        <>
          <NotificationsCard />
          <InstallCard />
        </>
      )}

      {boot.me.isAdmin && (
        <section class="card">
          <h2 class="card-title">🛠️ ניהול</h2>
          <p class="muted">חברי צוות, סטטוסים ומצב התראות.</p>
          <button type="button" class="btn is-block" onClick={() => navigate('/admin/members')}>מעבר לניהול</button>
        </section>
      )}

      <section class="card">
        <h2 class="card-title">👤 {boot.me.name}</h2>
        <p class="muted">
          {boot.me.phone ? <span dir="ltr">{formatPhone(boot.me.phone)}</span> : null} · {MEMBER_TYPE_LABELS[boot.me.type]}
          {boot.me.isAdmin ? ' · מנהל/ת' : ''}
        </p>
        <button type="button" class="btn is-danger is-block" onClick={() => void logoutWithPush(token)}>התנתקות</button>
      </section>

      <p class="muted version">איפה כולם · גרסה {VERSION}</p>
    </section>
  );
}

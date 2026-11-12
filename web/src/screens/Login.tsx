import { useRef, useState } from 'preact/hooks';
import { normalizePhone } from '../../../shared/phone.ts';
import logoUrl from '../assets/icon.svg';
import { IS_MOCK } from '../config.ts';
import { store } from '../data/store.ts';

/** Phone-number login. The device stays signed in until "התנתקות". */
export function Login() {
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reads the live field value: autofill may not fire an input event before submit
  const submit = async (e: Event) => {
    e.preventDefault();
    const value = inputRef.current?.value ?? phone;
    if (!normalizePhone(value)) {
      setError('מספר הטלפון לא תקין. דוגמה: 0501234567');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await store.login(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="login">
      <div class="login-card">
        <img class="login-logo" src={logoUrl} alt="" width={72} height={72} />
        <h1 class="login-title">איפה כולם</h1>
        <p class="login-sub">מי במשרד, מי בחופש ומי בשטח. כל השבוע, במקום אחד.</p>
        <form onSubmit={submit} class="login-form" noValidate>
          <label class="field">
            <span class="field-label">מספר טלפון</span>
            <input
              ref={inputRef}
              class="input is-large"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              dir="ltr"
              placeholder="050-123-4567"
              value={phone}
              onInput={(e) => setPhone((e.target as HTMLInputElement).value)}
              aria-invalid={!!error}
              autoFocus
            />
          </label>
          {error && <p class="hint is-error" role="alert">{error}</p>}
          <button class="btn is-primary is-block" type="submit" disabled={busy}>
            {busy ? 'מתחבר…' : 'כניסה'}
          </button>
        </form>
        <p class="muted login-foot">נשארים מחוברים במכשיר הזה עד שלוחצים על "התנתקות".</p>
        {IS_MOCK && <p class="banner is-info">מצב הדגמה: 0500000001 (מנהלת), 0500000002 עד 0500000010</p>}
      </div>
    </main>
  );
}

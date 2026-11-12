// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEED_STATUSES } from '../../shared/statuses.ts';
import { DayEditor } from '../../web/src/components/DayEditor.tsx';
import { store } from '../../web/src/data/store.ts';

const MEMBER = { id: 'm1', name: 'Me', type: 'regular' as const, isAdmin: false, active: true, order: 1 };
const DATE = '2026-11-16';
const statusMap = new Map(SEED_STATUSES.map((s) => [s.id, s]));

const renderEditor = () =>
  render(<DayEditor member={MEMBER} date={DATE} entry={undefined} holiday={undefined} statuses={SEED_STATUSES} statusMap={statusMap} />);

describe('DayEditor', () => {
  let queue: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    queue = vi.spyOn(store, 'queueDays').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    queue.mockRestore();
  });

  it('saves a picked status immediately', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('radio', { name: /חופש/ }));
    expect(queue).toHaveBeenCalledWith('m1', [{ date: DATE, statusId: 'vacation', note: '' }]);
  });

  it('"אחר" waits for a note, then saves when the field loses focus right after typing', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('radio', { name: /אחר/ }));
    expect(queue).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('כתבו הערה');

    const note = screen.getByRole('textbox') as HTMLTextAreaElement;
    note.value = 'קורס עזרה ראשונה';
    fireEvent.input(note);
    fireEvent.blur(note);
    expect(queue).toHaveBeenCalledWith('m1', [{ date: DATE, statusId: 'other', note: 'קורס עזרה ראשונה' }]);
  });

  it('a note on an untouched day keeps the shown default status', () => {
    renderEditor();
    const note = screen.getByRole('textbox') as HTMLTextAreaElement;
    note.value = 'עד 14:00';
    fireEvent.input(note);
    fireEvent.blur(note);
    expect(queue).toHaveBeenCalledWith('m1', [{ date: DATE, statusId: 'office', note: 'עד 14:00' }]);
  });

  it('closing the sheet while a note is still debouncing saves it', async () => {
    const { unmount } = renderEditor();
    fireEvent.click(screen.getByRole('radio', { name: /עבודה מהבית/ }));
    queue.mockClear();
    const note = screen.getByRole('textbox') as HTMLTextAreaElement;
    note.value = 'מ-10:00';
    fireEvent.input(note);
    unmount();
    // Preact 11 runs unmount effect cleanups after the next frame
    await vi.waitFor(() => expect(queue).toHaveBeenCalledWith('m1', [{ date: DATE, statusId: 'home', note: 'מ-10:00' }]));
  });
});

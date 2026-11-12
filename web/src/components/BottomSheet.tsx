import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { IconClose } from './Icons.tsx';

interface Props {
  open: boolean;
  title: ComponentChildren;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
}

/** Modal bottom sheet on a native <dialog> (focus trap, Esc and back-gesture handling come for free). */
export function BottomSheet({ open, title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Tapping the dimmed backdrop (the dialog element itself, outside the panel) closes the sheet
  const onClick = (e: MouseEvent) => {
    if (e.target === ref.current) onClose();
  };

  return (
    <dialog ref={ref} class="sheet" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} onClick={onClick}>
      {open && (
        // Focus lands on the panel itself (not the close button) when the dialog opens
        <div class="sheet-panel" tabIndex={-1} autoFocus>
          <header class="sheet-header">
            <h2 class="sheet-title">{title}</h2>
            <button type="button" class="icon-btn" onClick={onClose} aria-label="סגירה">
              <IconClose />
            </button>
          </header>
          <div class="sheet-body">{children}</div>
          {footer && <footer class="sheet-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}

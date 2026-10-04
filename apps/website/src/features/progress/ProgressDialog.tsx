import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Native modal semantics keep keyboard focus inside and make the page inert. */
export function ProgressDialog({ children, labelledBy, onClose }: {
  children: ReactNode;
  labelledBy: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog
      ref={dialogRef}
      className="progress-modal-overlay progress-dialog"
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}

export function ProgressPopup({ title, children, onClose }: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <ProgressDialog labelledBy="progress-popup-title" onClose={onClose}>
      <div className="progress-modal-card">
        <div className="progress-modal-header">
          <h2 id="progress-popup-title">{title}</h2>
          <button type="button" className="progress-modal-close" onClick={onClose} aria-label={`Close ${title}`}>
            &times;
          </button>
        </div>
        <div className="progress-modal-body">{children}</div>
      </div>
    </ProgressDialog>
  );
}

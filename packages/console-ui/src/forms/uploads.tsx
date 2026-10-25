import { useCallback, useEffect, useRef, useState } from 'react';
import { matchUploadFormat } from '@indigen-world/contracts/forms';
import type { AttachmentRef } from '@indigen-world/contracts/forms';
import { focusTarget, useRenderer, type Transfer, type UploadManager } from './context';
import { asAttachments, cx, domId, formatBytes, formatLabel, uploadLimits, withDeclaredType } from './model';
import { FileGlyph, QuestionErrors, QuestionHints, RequiredMark, UploadGlyph, hintIds, joinIds, type QuestionProps } from './parts';
import type { FormUploadAdapter } from './types';

/* -- Transfers ------------------------------------------------------------------------ */

function readable(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  // An adapter may reject with a plain record that carries a message (a callable's failure).
  const message = error && typeof error === 'object' ? (error as { message?: unknown }).message : undefined;
  if (typeof message === 'string' && message) return message;
  return 'The upload failed. Try again.';
}

/**
 * Uploads live at the renderer level, not in the question, so moving to
 * another page of a paged form, hiding a question or reordering group entries
 * never cancels a file on its way. A finished upload is written into the
 * latest answers through `attach`; if its place no longer exists (the entry
 * was removed, or the renderer is gone) the stored file is removed again.
 */
export function useUploadManager(options: {
  adapter?: FormUploadAdapter;
  preview: boolean;
  attach(slot: string, attachment: AttachmentRef): boolean;
  onUploadingChange?(count: number): void;
}): UploadManager {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [notices, setNotices] = useState<Record<string, string>>({});
  const live = useRef(options);
  live.current = options;
  const transfersRef = useRef(transfers);
  transfersRef.current = transfers;
  const controllers = useRef(new Map<string, AbortController>());
  const cancelled = useRef(new Set<string>());
  const mounted = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const map = controllers.current;
    return () => {
      mounted.current = false;
      for (const controller of map.values()) controller.abort();
      map.clear();
    };
  }, []);

  const uploading = transfers.filter((transfer) => transfer.status === 'uploading').length;
  useEffect(() => {
    live.current.onUploadingChange?.(uploading);
  }, [uploading]);

  const notify = useCallback((slot: string, message: string) => {
    if (mounted.current) setNotices((previous) => ({ ...previous, [slot]: message }));
  }, []);

  const discard = useCallback((attachment: AttachmentRef) => {
    const adapter = live.current.adapter;
    if (live.current.preview || !adapter?.remove) return;
    adapter.remove(attachment).catch(() => undefined);
  }, []);

  const run = useCallback((transfer: Transfer) => {
    const adapter = live.current.adapter;
    if (!adapter || live.current.preview) return;
    const controller = new AbortController();
    controllers.current.set(transfer.id, controller);
    let shown = -1;
    const abandoned = () => !mounted.current || controller.signal.aborted || cancelled.current.has(transfer.id);
    let pending: Promise<AttachmentRef>;
    try {
      pending = adapter.upload({
        fieldId: transfer.fieldId,
        file: transfer.file,
        signal: controller.signal,
        onProgress(fraction: number) {
          const percent = Math.round(Math.max(0, Math.min(1, Number(fraction) || 0)) * 100);
          if (percent === shown || abandoned()) return;
          shown = percent;
          setTransfers((list) => list.map((item) => (item.id === transfer.id ? { ...item, progress: percent / 100 } : item)));
        },
      });
    } catch (error) {
      pending = Promise.reject(error);
    }
    pending.then(
      (attachment) => {
        controllers.current.delete(transfer.id);
        if (abandoned()) {
          discard(attachment);
          return;
        }
        setTransfers((list) => list.filter((item) => item.id !== transfer.id));
        if (!live.current.attach(transfer.slot, attachment)) {
          discard(attachment);
          return;
        }
        notify(transfer.slot, `${attachment.name || transfer.file.name} uploaded.`);
      },
      (error: unknown) => {
        controllers.current.delete(transfer.id);
        if (abandoned()) return;
        const message = readable(error);
        setTransfers((list) => list.map((item): Transfer => (item.id === transfer.id ? { ...item, status: 'failed', error: message } : item)));
        notify(transfer.slot, `${transfer.file.name} was not uploaded. ${message}`);
      },
    );
  }, [discard, notify]);

  return {
    transfers,
    notices,
    available: Boolean(options.adapter) && !options.preview,
    canOpen: Boolean(options.adapter?.open) && !options.preview,
    start(slot, fieldId, file) {
      if (live.current.preview || !live.current.adapter) return;
      sequence.current += 1;
      const transfer: Transfer = { id: `upload-${sequence.current}`, slot, fieldId, file, progress: 0, status: 'uploading', error: null };
      setTransfers((list) => [...list, transfer]);
      notify(slot, `Uploading ${file.name}.`);
      run(transfer);
    },
    cancel(id) {
      const transfer = transfersRef.current.find((item) => item.id === id);
      cancelled.current.add(id);
      controllers.current.get(id)?.abort();
      controllers.current.delete(id);
      setTransfers((list) => list.filter((item) => item.id !== id));
      if (transfer) notify(transfer.slot, `Upload of ${transfer.file.name} cancelled.`);
    },
    retry(id) {
      const transfer = transfersRef.current.find((item) => item.id === id);
      if (!transfer) return;
      cancelled.current.delete(id);
      const again: Transfer = { ...transfer, status: 'uploading', progress: 0, error: null };
      setTransfers((list) => list.map((item) => (item.id === id ? again : item)));
      notify(transfer.slot, `Uploading ${transfer.file.name} again.`);
      run(again);
    },
    dismiss(id) {
      cancelled.current.add(id);
      setTransfers((list) => list.filter((item) => item.id !== id));
    },
    removeAttachment: discard,
    open(slot, attachment) {
      const adapter = live.current.adapter;
      if (!adapter?.open || live.current.preview) return;
      adapter.open(attachment).catch((error: unknown) => notify(slot, `${attachment.name} could not be opened. ${readable(error)}`));
    },
    notify,
  };
}

/* -- Upload question ------------------------------------------------------------------- */

export function UploadField({ field, path, slot, value, onChange, required }: QuestionProps) {
  const ctx = useRenderer();
  const cid = domId(ctx.prefix, path);
  const errors = ctx.issues.inline.get(path) ?? [];
  const flagged = ctx.issues.attachments.get(path);
  const limits = uploadLimits(field);
  const files = asAttachments(value);
  const transfers = ctx.uploads.transfers.filter((transfer) => transfer.slot === slot);
  const preview = ctx.mode === 'preview';
  const available = preview || ctx.uploads.available;
  const used = files.length + transfers.length;
  const full = used >= limits.maxFiles;
  const blocked = ctx.disabled || !available || full;
  const [rejections, setRejections] = useState<string[]>([]);
  const [checks, setChecks] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    focusTarget(document.getElementById(target));
  });

  const extensionList = limits.extensions.map((extension) => extension.toUpperCase()).join(', ');
  const plural = (count: number) => (count === 1 ? '' : 's');
  const limitText = `Accepted formats: ${extensionList || 'none'}. Up to ${limits.maxSizeMb} MB per file. ${
    limits.maxFiles === 1 ? 'One file.' : `Up to ${limits.maxFiles} files.`
  }`;
  const describedBy = joinIds(...hintIds(field, cid), `${cid}-limits`, errors.length > 0 && `${cid}-err`);

  // Checks mirror the server's beginUpload: extension AND declared type must
  // match an allowed format, within the size and count limits. Messages use
  // the contract's wording so the same file reads the same everywhere.
  const choose = (chosen: File[]) => {
    if (!chosen.length || ctx.disabled || !available) return;
    let room = limits.maxFiles - used;
    const problems: string[] = [];
    const accepted: string[] = [];
    for (const original of chosen) {
      const file = withDeclaredType(original, field);
      const name = file.name || 'This file';
      if (!matchUploadFormat(field, file.name, file.type)) {
        problems.push(`${name} is not an allowed format. Use ${extensionList}.`);
      } else if (file.size > limits.maxSizeMb * 1024 * 1024) {
        problems.push(`${name} is larger than ${limits.maxSizeMb} MB.`);
      } else if (file.size <= 0) {
        problems.push(`${name} is empty.`);
      } else if (room <= 0) {
        problems.push(`${name} was not added. Attach ${limits.maxFiles} file${plural(limits.maxFiles)} at most.`);
      } else {
        room -= 1;
        if (preview) accepted.push(`${name} (${formatBytes(file.size)}) would be accepted.`);
        else ctx.uploads.start(slot, field.id, file);
      }
    }
    setRejections(problems);
    setChecks(preview ? accepted : []);
  };

  const removeFile = (attachment: AttachmentRef) => {
    onChange(files.filter((item) => item.id !== attachment.id));
    // Only a request: the store keeps a file that saved answers still list (this change may
    // never be saved), and lets it go once nothing saved uses it.
    if (!preview) ctx.uploads.removeAttachment(attachment);
    ctx.uploads.notify(slot, `${attachment.name} removed.`);
    pendingFocus.current = cid;
  };

  const legendId = `${cid}-legend`;
  const dropId = `${cid}-drop`;
  const busy = files.length > 0 || transfers.length > 0;

  return (
    <fieldset
      className={cx('iwf-q', 'iwf-upload', `iwf-q--${field.type}`, errors.length > 0 && 'is-invalid')}
      id={cid}
      aria-describedby={describedBy}
      data-field-id={field.id}
    >
      <legend className="ts-label iwf-label" id={legendId}>
        <span className="iwf-label__text">{field.label}</span>
        <RequiredMark required={required} spoken />
      </legend>
      <QuestionHints field={field} cid={cid} />
      <p className="ts-hint iwf-limits" id={`${cid}-limits`}>{limitText}</p>
      {preview ? <p className="iwf-note">Preview: chosen files are checked against these limits but never uploaded.</p> : null}
      {!preview && !ctx.uploads.available ? <p className="iwf-note">File uploads are not available here.</p> : null}

      {files.length || transfers.length ? (
        <ul className="iwf-files" aria-label={`Files for ${field.label || 'this question'}`}>
          {files.map((file, index) => {
            const needsAttention = flagged?.has(index) === true;
            return (
              <li key={file.id} className={cx('iwf-file', needsAttention && 'is-invalid')}>
                <FileGlyph />
                <div className="iwf-file__main">
                  <span className="iwf-file__name">{file.name}</span>
                  <span className="iwf-file__meta">
                    {`${formatLabel(file.contentType)} · ${formatBytes(file.size)}${needsAttention ? ' · Needs attention' : ''}`}
                  </span>
                </div>
                <div className="iwf-file__actions">
                  {ctx.uploads.canOpen ? (
                    <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" onClick={() => ctx.uploads.open(slot, file)}>
                      <span>Open<span className="ts-sr">{` ${file.name}`}</span></span>
                    </button>
                  ) : null}
                  <button type="button" className="ts-btn ts-btn--danger-ghost ts-btn--sm" disabled={ctx.disabled} onClick={() => removeFile(file)}>
                    <span>Remove<span className="ts-sr">{` ${file.name}`}</span></span>
                  </button>
                </div>
              </li>
            );
          })}
          {transfers.map((transfer) => {
            const percent = Math.round(transfer.progress * 100);
            return (
              <li key={transfer.id} className={cx('iwf-file', 'iwf-file--transfer', transfer.status === 'failed' && 'is-failed')}>
                <FileGlyph />
                <div className="iwf-file__main">
                  <span className="iwf-file__name">{transfer.file.name}</span>
                  {transfer.status === 'uploading' ? (
                    <>
                      <span className="iwf-file__meta">{`Uploading · ${percent}% of ${formatBytes(transfer.file.size)}`}</span>
                      <div
                        className="ts-progress ts-progress--sm ts-progress--active iwf-file__progress"
                        role="progressbar"
                        aria-label={`Uploading ${transfer.file.name}`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={percent}
                      >
                        <div className="ts-progress__bar" style={{ width: `${percent}%` }} />
                      </div>
                    </>
                  ) : (
                    <span className="iwf-file__meta iwf-file__problem">{`Not uploaded. ${transfer.error ?? ''}`}</span>
                  )}
                </div>
                <div className="iwf-file__actions">
                  {transfer.status === 'uploading' ? (
                    <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" onClick={() => ctx.uploads.cancel(transfer.id)}>
                      <span>Cancel<span className="ts-sr">{` upload of ${transfer.file.name}`}</span></span>
                    </button>
                  ) : (
                    <>
                      <button type="button" className="ts-btn ts-btn--secondary ts-btn--sm" disabled={ctx.disabled} onClick={() => ctx.uploads.retry(transfer.id)}>
                        <span>Retry<span className="ts-sr">{` ${transfer.file.name}`}</span></span>
                      </button>
                      <button
                        type="button"
                        className="ts-btn ts-btn--danger-ghost ts-btn--sm"
                        onClick={() => {
                          ctx.uploads.dismiss(transfer.id);
                          pendingFocus.current = cid;
                        }}
                      >
                        <span>Remove<span className="ts-sr">{` ${transfer.file.name}`}</span></span>
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {full ? (
        <p className="ts-hint iwf-full">
          {transfers.length
            ? `This question takes ${limits.maxFiles === 1 ? 'one file' : `${limits.maxFiles} files`}. Cancel or remove one to add another.`
            : `${limits.maxFiles === 1 ? 'A file is' : `${limits.maxFiles} files are`} attached, the most allowed. Remove one to add another.`}
        </p>
      ) : (
        <div
          className={cx('ts-drop', 'iwf-drop', dragging && 'is-dragging', blocked && 'is-disabled')}
          onDragOver={(event) => {
            if (blocked) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            if (!dragging) setDragging(true);
          }}
          onDragLeave={(event) => {
            const next = event.relatedTarget;
            if (next instanceof Node && event.currentTarget.contains(next)) return;
            setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!blocked) choose(Array.from(event.dataTransfer.files ?? []));
          }}
        >
          <span className="ts-drop__icon" aria-hidden="true"><UploadGlyph /></span>
          <span className="ts-drop__title" id={dropId}>
            {busy ? 'Add another file' : limits.maxFiles > 1 ? 'Choose files' : 'Choose a file'}
          </span>
          <span className="iwf-drop__or" aria-hidden="true">{`or drop ${limits.maxFiles - used > 1 ? 'them' : 'it'} here`}</span>
          <input
            type="file"
            id={`${cid}-file`}
            data-iwf-primary=""
            accept={limits.accept}
            multiple={limits.maxFiles - used > 1}
            disabled={blocked}
            aria-labelledby={`${legendId} ${dropId}`}
            aria-describedby={describedBy}
            aria-invalid={errors.length > 0 || undefined}
            onChange={(event) => {
              const list = Array.from(event.target.files ?? []);
              event.target.value = '';
              choose(list);
            }}
          />
        </div>
      )}

      {limits.allowRecording && ctx.renderRecorder ? (
        <div className="iwf-recorder">
          {ctx.renderRecorder({ field, disabled: blocked || preview, onRecorded: (file: File) => choose([file]) })}
        </div>
      ) : null}

      {checks.length ? (
        <ul className="iwf-checks" role="status">
          {checks.map((line, index) => <li key={index}>{line}</li>)}
        </ul>
      ) : null}
      {rejections.length ? (
        <div className="ts-error iwf-error" role="alert">
          <span className="iwf-error__mark" aria-hidden="true">!</span>
          <span className="iwf-error__text">
            {rejections.map((line, index) => <span key={index} className="iwf-error__line">{line}</span>)}
          </span>
        </div>
      ) : null}
      <QuestionErrors cid={cid} errors={errors} />
      <p className="ts-sr" role="status" aria-live="polite">{ctx.uploads.notices[slot] ?? ''}</p>
    </fieldset>
  );
}

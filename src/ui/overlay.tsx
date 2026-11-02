import { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { focusElement, focusFirst } from '../nav/spatial';
import { Button, Row, TextRow } from './widgets';

// Promise-based dialogs and toasts. Only one dialog is open at a time; it
// renders inside a nav scope so the remote can't wander behind it.

interface OpenDialog {
  render: (close: (value: unknown) => void) => ComponentChildren;
  resolve: (value: unknown) => void;
  cancelValue: unknown;
  /** Where focus was before the dialog, to return there afterwards. */
  returnFocus: Element | null;
  /** 'sheet' slides in from the right edge; default is a centred card. */
  variant: 'center' | 'sheet';
}

let dialog: OpenDialog | null = null;
let toastState: { text: string; error: boolean; id: number } | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

function open<T>(
  cancelValue: T,
  render: (close: (value: T) => void) => ComponentChildren,
  variant: OpenDialog['variant'] = 'center',
): Promise<T> {
  return new Promise<T>((resolve) => {
    dialog = {
      render: render as OpenDialog['render'],
      resolve: resolve as (v: unknown) => void,
      cancelValue,
      returnFocus: document.activeElement,
      variant,
    };
    notify();
  });
}

function close(value: unknown): void {
  const d = dialog;
  dialog = null;
  notify();
  if (d?.returnFocus instanceof HTMLElement && d.returnFocus.isConnected) {
    requestAnimationFrame(() => focusElement(d.returnFocus as HTMLElement));
  }
  d?.resolve(value);
}

export function isDialogOpen(): boolean {
  return dialog !== null;
}

/** Called by the app's Back handling. */
export function cancelDialog(): void {
  if (dialog) close(dialog.cancelValue);
}

export function confirm(opts: { title: string; message?: string; confirmLabel: string; danger?: boolean }): Promise<boolean> {
  return open(false, (done) => (
    <>
      <h2>{opts.title}</h2>
      {opts.message && <p>{opts.message}</p>}
      <div class="dialog-actions">
        <Button label="Cancel" onClick={() => done(false)} autofocus />
        <Button label={opts.confirmLabel} kind={opts.danger ? 'danger' : 'primary'} onClick={() => done(true)} />
      </div>
    </>
  ));
}

export function choose<T>(opts: {
  title: string;
  message?: string;
  options: { value: T; label: string; hint?: string }[];
  /** Large artwork above the title (shown in the side sheet). */
  art?: ComponentChildren;
}): Promise<T | null> {
  return open<T | null>(
    null,
    (done) => (
      <>
        {opts.art && <div class="sheet-art">{opts.art}</div>}
        <h2>{opts.title}</h2>
        {opts.message && <p>{opts.message}</p>}
        <div class="options">
          {opts.options.map((o, i) => (
            <Row key={o.label} label={o.label} hint={o.hint} autofocus={i === 0} onClick={() => done(o.value)} />
          ))}
        </div>
      </>
    ),
    opts.art ? 'sheet' : 'center',
  );
}

function PromptBody(props: { label: string; initial: string; confirmLabel: string; done: (v: string | null) => void }) {
  const [value, setValue] = useState(props.initial);
  const submit = () => value.trim() && props.done(value.trim());
  return (
    <>
      <div class="options">
        <TextRow label={props.label} value={value} onChange={setValue} onSubmit={submit} autofocus />
      </div>
      <div class="dialog-actions">
        <Button label="Cancel" onClick={() => props.done(null)} />
        <Button label={props.confirmLabel} kind="primary" onClick={submit} />
      </div>
    </>
  );
}

export function prompt(opts: { title: string; label: string; value?: string; confirmLabel: string }): Promise<string | null> {
  return open<string | null>(null, (done) => (
    <>
      <h2>{opts.title}</h2>
      <PromptBody label={opts.label} initial={opts.value ?? ''} confirmLabel={opts.confirmLabel} done={done} />
    </>
  ));
}

/** Shows arbitrary content (e.g. the OneDrive sign-in code) until closed. */
export function showPanel(render: (close: () => void) => ComponentChildren): Promise<void> {
  return open<void>(undefined, (done) => render(() => done(undefined)));
}

export function closePanel(): void {
  close(undefined);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string, error = false): void {
  toastState = { text, error, id: Date.now() };
  notify();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastState = null;
    notify();
  }, error ? 6000 : 3000);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function OverlayHost() {
  const [, force] = useState(0);
  useEffect(() => {
    const update = () => force((n) => n + 1);
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);

  const current = dialog;
  useEffect(() => {
    if (current) requestAnimationFrame(() => focusFirst());
  }, [current]);

  return (
    <>
      {current && (
        <div class={`dialog-backdrop ${current.variant}`} data-nav-scope>
          <div class={`dialog ${current.variant}`}>{current.render(close)}</div>
        </div>
      )}
      {toastState && (
        <div key={toastState.id} class={`toast ${toastState.error ? 'error' : ''}`}>
          {toastState.text}
        </div>
      )}
    </>
  );
}

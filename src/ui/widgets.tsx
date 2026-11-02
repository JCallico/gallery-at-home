import { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { focusElement } from '../nav/spatial';
import { Icon, IconName } from './icons';

// Focusable building blocks. Anything the remote can land on carries
// `data-nav` and is a <button>, so Enter activates it natively.

interface ButtonProps {
  icon?: IconName;
  label?: string;
  kind?: 'primary' | 'danger';
  navId?: string;
  autofocus?: boolean;
  onClick: () => void;
}

export function Button({ icon, label, kind, navId, autofocus, onClick }: ButtonProps) {
  const cls = ['btn', kind, label ? '' : 'icon-only'].filter(Boolean).join(' ');
  return (
    <button class={cls} data-nav data-nav-id={navId} data-nav-autofocus={autofocus || undefined} onClick={onClick}>
      {icon && <Icon name={icon} />}
      {label && <span>{label}</span>}
    </button>
  );
}

interface RowProps {
  label: string;
  hint?: string;
  navId?: string;
  autofocus?: boolean;
  onClick: () => void;
  children?: ComponentChildren;
}

/** A settings-style row: label on the left, value or control on the right. */
export function Row({ label, hint, navId, autofocus, onClick, children }: RowProps) {
  return (
    <button class="row" data-nav data-nav-id={navId ?? label} data-nav-autofocus={autofocus || undefined} onClick={onClick}>
      <span class="row-label">
        {label}
        {hint && <span class="row-hint">{hint}</span>}
      </span>
      {children}
    </button>
  );
}

export function ToggleRow(props: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row label={props.label} hint={props.hint} onClick={() => props.onChange(!props.value)}>
      <span class={`toggle ${props.value ? 'on' : ''}`} />
    </Row>
  );
}

/**
 * Cycles through options with Enter (and Left/Right while focused), the way
 * the TV's picture settings behave.
 */
export function ChoiceRow<T extends string | number>(props: {
  label: string;
  hint?: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  const index = Math.max(0, props.options.findIndex((o) => o.value === props.value));
  const step = (d: number) => {
    const next = props.options[(index + d + props.options.length) % props.options.length];
    props.onChange(next.value);
  };
  return (
    <button
      class="row"
      data-nav
      data-nav-id={props.label}
      data-nav-horizontal-handler
      onClick={() => step(1)}
      onKeyDown={(e) => {
        if (e.keyCode === 37 || e.keyCode === 39) {
          e.preventDefault();
          e.stopPropagation();
          step(e.keyCode === 39 ? 1 : -1);
        }
      }}
    >
      <span class="row-label">
        {props.label}
        {props.hint && <span class="row-hint">{props.hint}</span>}
      </span>
      <span class="row-value">
        <span>{props.options[index].label}</span>
        <Icon name="chevron" />
      </span>
    </button>
  );
}

/**
 * A text field the remote can move over without popping up the on-screen
 * keyboard. Enter starts editing (keyboard appears); Done/Back returns to
 * navigation.
 */
export function TextRow(props: {
  label: string;
  value: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'url';
  autofocus?: boolean;
  onChange: (v: string) => void;
  onSubmit?: () => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (editing) input.current?.focus();
  }, [editing]);

  const stop = () => {
    setEditing(false);
    focusElement(row.current);
  };

  // A div, not a button: an <input> inside a <button> can't be typed into.
  // The app's key handler turns Enter on it into a click.
  return (
    <div
      ref={row}
      class="row"
      tabIndex={0}
      role="button"
      data-nav
      data-nav-id={props.label}
      data-nav-autofocus={props.autofocus || undefined}
      onClick={() => setEditing(true)}
    >
      <span class="row-label row-label-fixed">{props.label}</span>
      <input
        ref={input}
        type={props.type ?? 'text'}
        value={props.value}
        placeholder={props.placeholder}
        tabIndex={-1}
        readOnly={!editing}
        autoComplete="off"
        spellcheck={false}
        onInput={(e) => props.onChange((e.currentTarget as HTMLInputElement).value)}
        onBlur={() => editing && setEditing(false)}
        onKeyDown={(e) => {
          // 65376 = IME "Done", 65385 = IME "Cancel" on Tizen.
          if (e.keyCode === 13 || e.keyCode === 65376) {
            e.preventDefault();
            e.stopPropagation();
            stop();
            props.onSubmit?.();
          } else if (e.keyCode === 65385 || e.keyCode === 10009 || e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            stop();
          } else if (e.keyCode === 38 || e.keyCode === 40) {
            e.preventDefault();
            e.stopPropagation();
            stop();
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function Spinner() {
  return <div class="spinner" />;
}

export function Empty(props: { icon: IconName; title: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <Icon name={props.icon} />
      <h2>{props.title}</h2>
      {props.children}
    </div>
  );
}

export function Legend(props: { items: { key: 'red' | 'green' | 'yellow' | 'blue'; label: string }[] }) {
  return (
    <div class="legend">
      {props.items.map((i) => (
        <span key={i.key}>
          <i class={`key-dot key-${i.key}`} />
          <span>{i.label}</span>
        </span>
      ))}
    </div>
  );
}

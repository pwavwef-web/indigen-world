import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cx } from './primitives';

/* ==========================================================================
   Command palette
   --------------------------------------------------------------------------
   ⌘K / Ctrl-K. A console with ten screens and a dozen privileged actions is
   faster to drive from the keyboard than from the sidebar, and staff who live
   in a terminal already expect this key.
   ========================================================================== */

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: ReactNode;
  trail?: string;
  keywords?: string;
  run: () => void;
}

/** Subsequence match, the same forgiving rule an editor's file finder uses. */
function score(haystack: string, needle: string): number {
  if (!needle) return 1;
  const target = haystack.toLowerCase();
  const query = needle.toLowerCase();
  if (target.includes(query)) return 100 - target.indexOf(query);
  let index = 0;
  let hits = 0;
  for (const character of query) {
    const found = target.indexOf(character, index);
    if (found === -1) return 0;
    hits += found === index ? 2 : 1;
    index = found + 1;
  }
  return hits;
}

export function CommandPalette({
  open,
  onClose,
  commands,
}: {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      // Focus after paint so the dialog is in the tree when focus moves.
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const matches = useMemo(() => {
    const ranked = commands
      .map((command) => ({
        command,
        rank: score(
          `${command.label} ${command.group} ${command.hint ?? ''} ${command.trail ?? ''} ${command.keywords ?? ''}`,
          query.trim(),
        ),
      }))
      .filter((entry) => entry.rank > 0)
      .sort((a, b) => b.rank - a.rank);
    return query.trim() ? ranked.map((entry) => entry.command) : commands;
  }, [commands, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    item?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  if (!open) return null;

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    command.run();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (matches.length === 0 ? 0 : (current + 1) % matches.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => (matches.length === 0 ? 0 : (current - 1 + matches.length) % matches.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      run(matches[active]);
    }
  };

  let lastGroup = '';

  return (
    <div
      className="iwx-pal__backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="iwx-pal"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <div className="iwx-pal__field">
          <span className="iwx-pal__prompt" aria-hidden="true">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Jump to a screen or run an action…"
            aria-label="Search commands"
            aria-controls="command-palette-list"
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setQuery(event.target.value)}
          />
          <span className="kbd">Esc</span>
        </div>

        {matches.length === 0 ? (
          <p className="iwx-pal__empty">No command matches “{query.trim()}”.</p>
        ) : (
          <ul className="iwx-pal__list" id="command-palette-list" ref={listRef} role="listbox" aria-label="Commands">
            {matches.map((command, index) => {
              /* Ranked results interleave groups, so the section headings are
                 a browsing affordance only: while searching, the list is flat. */
              const header = !query.trim() && command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <li key={command.id}>
                  {header ? <p className="iwx-pal__section">{header}</p> : null}
                  <button
                    type="button"
                    className={cx('iwx-pal__item')}
                    data-index={index}
                    role="option"
                    aria-selected={index === active}
                    onMouseMove={() => setActive(index)}
                    onClick={() => run(command)}
                  >
                    {command.icon}
                    <span className="iwx-pal__item-copy">
                      <strong>{command.label}</strong>
                      {command.hint ? <small>{command.hint}</small> : null}
                    </span>
                    {command.trail ? <span className="iwx-pal__trail">{command.trail}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="iwx-pal__foot">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> to move</span>
          <span><span className="kbd">↵</span> to run</span>
          <span><span className="kbd">Esc</span> to dismiss</span>
        </div>
      </div>
    </div>
  );
}

/** Binds ⌘K / Ctrl-K anywhere outside a text field. */
export function useCommandPalette(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return { open, setOpen };
}

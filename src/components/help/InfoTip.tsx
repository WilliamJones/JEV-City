'use client';
import { createContext, useContext } from 'react';

/** Lets any component open the help center at a specific section. */
export const HelpContext = createContext<(section: string) => void>(() => {});

export function InfoTip({ section, label }: { section: string; label: string }) {
  const open = useContext(HelpContext);
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); open(section); }}
      title={label}
      aria-label={`Help: ${label}`}
      className="ml-1 inline-grid h-4 w-4 place-items-center rounded-full text-[10px] font-bold leading-none normal-case tracking-normal"
      style={{ background: 'var(--chip)', color: 'var(--ink-soft)', border: '1px solid var(--panel-border)' }}
    >
      i
    </button>
  );
}

'use client';
import {useEffect, useState} from 'react';
import w from './workspace-layout.module.css';

/** Local task sections retain shareable anchors without changing the workspace route. */
export function useWorkspaceSection(ids: readonly string[], fallback: string) {
  const [section, setSection] = useState(fallback);
  const allowed = ids.join('|');
  useEffect(() => {
    function sync() { const id = window.location.hash.slice(1); setSection(allowed.split('|').includes(id) ? id : fallback); }
    sync(); window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, [allowed, fallback]);
  return section;
}
export function WorkspaceSections({items, current, label}: {items: {id: string; label: string}[]; current: string; label: string}) {
  return <nav className={w.sectionNav} aria-label={label}>{items.map(item => <a key={item.id} href={`#${item.id}`} onClick={event => { event.preventDefault(); window.history.pushState(null, '', `#${item.id}`); window.dispatchEvent(new HashChangeEvent('hashchange')); }} aria-current={current === item.id ? 'location' : undefined}>{item.label}</a>)}</nav>;
}

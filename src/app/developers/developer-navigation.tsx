'use client';

import {useEffect, useState} from 'react';
import s from './developers.module.css';

const sections = [
  {id: 'quickstart', label: 'Quickstart'},
  {id: 'runs', label: 'Run API'},
  {id: 'marketplace', label: 'Marketplace API'},
  {id: 'runner', label: 'Runner setup'},
  {id: 'authentication', label: 'Authentication'},
  {id: 'errors', label: 'Errors and limits'},
];

export function DeveloperNavigation() {
  const [active, setActive] = useState('quickstart');

  useEffect(() => {
    let frame = 0;
    const update = () => {
      let current = sections[0].id;
      for (const section of sections) {
        const element = document.getElementById(section.id);
        if (element && element.getBoundingClientRect().top <= 150) current = section.id;
      }
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) current = sections[sections.length - 1].id;
      setActive(current);
      frame = 0;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, {passive: true});
    window.addEventListener('resize', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  return <nav className={s.navigation} aria-label="Developer guide sections">
    <span className={s.navTitle}>On this page</span>
    <div className={s.sectionLinks}>{sections.map(section => <a key={section.id} href={`#${section.id}`} aria-current={active === section.id ? 'location' : undefined}>{section.label}</a>)}</div>
    <label className={s.mobileNavigation}>Jump to
      <select aria-label="Jump to section" value={active} onChange={event => {
        const id = event.target.value;
        setActive(id);
        window.location.hash = id;
        document.getElementById(id)?.focus({preventScroll: true});
      }}>{sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}</select>
    </label>
    <a className={s.sourceLink} href="https://github.com/saiisback/obolos" target="_blank" rel="noreferrer">View source on GitHub</a>
  </nav>;
}

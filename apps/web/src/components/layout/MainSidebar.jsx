import { NavLink } from 'react-router';

import styles from './MainSidebar.module.css';

export function MainSidebar({ items }) {
  return (
    <aside className={styles.sidebar}>
      <p className={styles.brand}>Album Manager</p>
      <nav aria-label="Main navigation">
        <ul className={styles.links}>
          {items.map(({ to, label, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) => `${styles.link}${isActive ? ` ${styles.active}` : ''}`}
              >
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

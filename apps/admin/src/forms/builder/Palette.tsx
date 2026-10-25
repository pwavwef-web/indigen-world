import { FIELD_TYPES } from '@indigen-world/contracts/forms';
import type { FieldType } from '@indigen-world/contracts/forms';
import { Icon, type IconName } from '../../ui/icons';
import { TYPE_ICON, paletteGroups } from '../model';
import { DRAG_NEW } from './Canvas';

/* The question types, grouped by what they collect. A click adds the type
   after the selected question; pointer users can also drag it into place. */

const GROUPS = paletteGroups();

export function Palette({ onAdd, disabled = false }: { onAdd: (type: FieldType) => void; disabled?: boolean }) {
  return (
    <nav className="afm-palette" aria-label="Question types">
      <p className="ts-hint afm-palette__intro">Adds after the selected question. You can also drag a type into a section.</p>
      {GROUPS.map((group) => (
        <section key={group.family} className="afm-palette__group" aria-labelledby={`afm-family-${group.family}`}>
          <h3 id={`afm-family-${group.family}`} className="afm-palette__title">{group.label}</h3>
          <ul className="afm-palette__list">
            {group.types.map((type) => (
              <li key={type}>
                <button
                  type="button"
                  className="afm-palette__item"
                  draggable={!disabled}
                  disabled={disabled}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_NEW, type);
                    event.dataTransfer.setData('text/plain', FIELD_TYPES[type].label);
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAdd(type)}
                  aria-labelledby={`afm-type-name-${type}`}
                  aria-describedby={`afm-type-${type}`}
                >
                  <span className="afm-palette__icon" aria-hidden="true"><Icon name={TYPE_ICON[type] as IconName} /></span>
                  <span className="afm-palette__copy">
                    <strong id={`afm-type-name-${type}`}><span className="sr-only">Add </span>{FIELD_TYPES[type].label}</strong>
                    <small id={`afm-type-${type}`}>{FIELD_TYPES[type].description}</small>
                  </span>
                  <Icon name="plus" className="afm-palette__plus" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

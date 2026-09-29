import { useRef } from 'react';
import { Icon } from './Icon.jsx';
import { stepNumber } from '../scripts/form-controls.mjs';

export function NumberInput({ onStep, ...props }) {
  const ref = useRef(null);
  const label = props['aria-label'] || 'значение';
  return (
    <span className="number-field">
      <input {...props} ref={ref} type="number" />
      <span className="number-step-buttons">
        {[1, -1].map((direction) => (
          <button
            key={direction}
            type="button"
            disabled={props.disabled || props.readOnly}
            aria-label={`${direction > 0 ? 'Увеличить' : 'Уменьшить'} ${label}`}
            onPointerDown={(e) => e.preventDefault()}
            onClick={(e) => {
              const input = ref.current;
              const value = stepNumber(input, direction, e.shiftKey ? 10 : 1);
              if (onStep) onStep(value);
              else if (!props.onChange && props.onBlur)
                props.onBlur({ target: input, currentTarget: input });
            }}
          >
            <Icon name={direction > 0 ? 'chevronUp' : 'chevron'} />
          </button>
        ))}
      </span>
    </span>
  );
}

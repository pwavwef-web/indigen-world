/**
 * src/features/forms/FormField.tsx
 *
 * One labeled field, rendered as <input>, <textarea> or <select>
 * depending on the `as` prop. Every form on the site renders its
 * fields through this component so label association, error display
 * and touch-target sizing are consistent everywhere.
 */
import type { ReactNode } from "react";

interface BaseFieldProps {
  id: string;
  label: string;
  value: string;
  error?: string;
  hint?: string;
  required?: boolean;
  onChange: (value: string) => void;
}

interface InputFieldProps extends BaseFieldProps {
  as?: "input";
  type?: string;
  autoComplete?: string;
}
interface TextareaFieldProps extends BaseFieldProps {
  as: "textarea";
}
interface SelectFieldProps extends BaseFieldProps {
  as: "select";
  children: ReactNode;
}

type FormFieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps;

export function FormField(props: FormFieldProps) {
  const { id, label, value, error, hint, required, onChange } = props;
  const hasError = Boolean(error);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = hasError ? errorId : hint ? hintId : undefined;

  return (
    <div className={`field ${hasError ? "field--error" : ""}`}>
      <label htmlFor={id}>{label}</label>

      {props.as === "textarea" ? (
        <textarea
          id={id}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={hasError}
          aria-describedby={describedBy}
        />
      ) : props.as === "select" ? (
        <select
          id={id}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={hasError}
          aria-describedby={describedBy}
        >
          {props.children}
        </select>
      ) : (
        <input
          id={id}
          type={props.type ?? "text"}
          autoComplete={props.autoComplete}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={hasError}
          aria-describedby={describedBy}
        />
      )}

      {hint && !hasError && <p className="field__hint" id={hintId}>{hint}</p>}
      {hasError && (
        <p className="field__error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

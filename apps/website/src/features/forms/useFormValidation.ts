/**
 * src/features/forms/useFormValidation.ts
 *
 * One generic hook powers every form on the site (Contact, Get
 * Involved, Newsletter) — none of which existed in the uploaded
 * template (it only had a `mailto:` link in its contact section). The
 * hook is generic over `T extends Record<string, string>`, so each
 * form's field names are type-checked at every call site without this
 * file needing to know which form is using it.
 *
 * The hook delegates delivery to the typed form service boundary. When
 * the reviewed Firebase endpoint is absent, the UI reports that honestly
 * instead of simulating a successful submission.
 */
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import type { FieldValidation } from "../../lib/types";
import type { PublicFormName } from "../../lib/forms";
import { FormServiceError } from "../../lib/forms";
import { ANALYTICS_EVENTS, trackEvent } from "../../lib/analytics";

type Validator = (value: string) => FieldValidation;

export interface FieldConfig {
  required?: boolean;
  validate?: Validator;
}

export type FormStatus = "idle" | "submitting" | "success" | "error";

interface UseFormValidationArgs<T extends object> {
  initialValues: T;
  fields: Partial<Record<keyof T, FieldConfig>>;
  onSubmit: (values: T) => Promise<void>;
  formName: PublicFormName;
  successMessage?: string;
}

interface UseFormValidationResult<T extends object> {
  values: T;
  errors: Partial<Record<keyof T, string>>;
  status: FormStatus;
  handleChange: (name: keyof T, value: string) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => void;
  statusMessage: string;
}

function validateField(value: string, config: FieldConfig | undefined): FieldValidation {
  if (!config) return { valid: true };
  if (config.required && value.trim().length === 0) {
    return { valid: false, message: "This field is required." };
  }
  if (config.validate) return config.validate(value);
  return { valid: true };
}

export function useFormValidation<T extends object>({
  initialValues,
  fields,
  onSubmit,
  formName,
  successMessage = "Thanks — we've received this and will follow up soon.",
}: UseFormValidationArgs<T>): UseFormValidationResult<T> {
  const [values, setValues] = useState<T>(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const [status, setStatus] = useState<FormStatus>("idle");
  const [failureCode, setFailureCode] = useState<FormServiceError["code"] | "validation" | null>(null);
  const hasStarted = useRef(false);
  const submitting = useRef(false);

  const handleChange = (name: keyof T, value: string) => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      if (formName === "get-involved") {
        trackEvent(ANALYTICS_EVENTS.getInvolvedFormStart, { form_name: formName });
      }
    }
    setValues((prev) => ({ ...prev, [name]: value }) as T);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;

    const nextErrors: Partial<Record<keyof T, string>> = {};
    let hasError = false;

    (Object.keys(fields) as Array<keyof T>).forEach((name) => {
      const result = validateField(String(values[name] ?? ""), fields[name]);
      if (!result.valid) {
        nextErrors[name] = result.message;
        hasError = true;
      }
    });

    setErrors(nextErrors);

    if (hasError) {
      setStatus("error");
      setFailureCode("validation");
      trackEvent(ANALYTICS_EVENTS.formSubmissionFailure, {
        form_name: formName,
        reason: "validation",
      });
      return;
    }

    submitting.current = true;
    setFailureCode(null);
    setStatus("submitting");

    onSubmit(values)
      .then(() => {
        setStatus("success");
        setValues(initialValues);
        setErrors({});
        hasStarted.current = false;
        trackEvent(ANALYTICS_EVENTS.formSubmissionSuccess, { form_name: formName });
        if (formName === "newsletter") {
          trackEvent(ANALYTICS_EVENTS.newsletterOptIn, { form_name: formName });
        }
      })
      .catch((error: unknown) => {
        const code = error instanceof FormServiceError ? error.code : "network";
        setFailureCode(code);
        setStatus("error");
        trackEvent(ANALYTICS_EVENTS.formSubmissionFailure, {
          form_name: formName,
          reason: code,
        });
      })
      .finally(() => {
        submitting.current = false;
      });
  };

  const statusMessage =
    status === "submitting"
      ? "Sending…"
      : status === "success"
        ? successMessage
        : status === "error" && failureCode === "unavailable"
          ? "Online submissions are not connected yet. Please try again after the service is enabled."
          : status === "error" && failureCode !== "validation"
            ? "We couldn't send this just now. Please try again."
            : status === "error"
              ? "Please check the highlighted fields and try again."
          : "";

  return { values, errors, status, handleChange, handleSubmit, statusMessage };
}

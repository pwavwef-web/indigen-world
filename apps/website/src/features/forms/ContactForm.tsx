/**
 * src/features/forms/ContactForm.tsx
 *
 * The Contact page's privacy-aware form. Delivery goes through the
 * reviewed public-form service boundary rather than exposing a personal
 * recipient address in client code.
 */
import { useMemo } from "react";
import { useFormValidation } from "./useFormValidation";
import { FormField } from "./FormField";
import { Button } from "../../components/Button";
import type { FieldValidation } from "../../lib/types";
import { submitPublicForm } from "../../lib/forms";

interface ContactFormValues {
  name: string;
  email: string;
  subject: string;
  message: string;
}

const EMPTY_VALUES: ContactFormValues = { name: "", email: "", subject: "", message: "" };
const CORRECTION_SUBJECT = "Publication, correction or takedown request";

function subjectFromLocation(): string {
  if (typeof window === "undefined") return "";

  return new URLSearchParams(window.location.search).get("subject") ===
    "publication-correction-takedown"
    ? CORRECTION_SUBJECT
    : "";
}

function validateEmail(value: string): FieldValidation {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { valid: false, message: "Please enter a valid email address." };
  }
  return { valid: true };
}

async function submitContactForm(values: ContactFormValues): Promise<void> {
  await submitPublicForm("contact", values);
}

export function ContactForm() {
  const initialValues = useMemo<ContactFormValues>(
    () => ({ ...EMPTY_VALUES, subject: subjectFromLocation() }),
    []
  );
  const { values, errors, status, handleChange, handleSubmit, statusMessage } =
    useFormValidation<ContactFormValues>({
      initialValues,
      fields: {
        name: { required: true },
        email: { required: true, validate: validateEmail },
        subject: { required: true },
        message: { required: true },
      },
      onSubmit: submitContactForm,
      formName: "contact",
      unavailableMessage:
        "Online submissions are unavailable right now. Email hi@indigenworld.com instead.",
    });

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <FormField
        id="c-name"
        label="Name"
        value={values.name}
        error={errors.name}
        required
        autoComplete="name"
        onChange={(v) => handleChange("name", v)}
      />
      <FormField
        id="c-email"
        label="Email"
        type="email"
        value={values.email}
        error={errors.email}
        required
        autoComplete="email"
        onChange={(v) => handleChange("email", v)}
      />
      <FormField
        as="select"
        id="c-subject"
        label="Subject"
        value={values.subject}
        error={errors.subject}
        required
        onChange={(v) => handleChange("subject", v)}
      >
        <option value="">Select one</option>
        <option>General question</option>
        <option>Partnership</option>
        <option>Press &amp; media</option>
        <option>{CORRECTION_SUBJECT}</option>
        <option>Something else</option>
      </FormField>
      <FormField
        as="textarea"
        id="c-message"
        label="Message"
        value={values.message}
        error={errors.message}
        required
        onChange={(v) => handleChange("message", v)}
      />

      <Button type="submit" variant="primary" showArrow={false} disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Send message"}
      </Button>

      <p className="form-notice">
        By sending this form, you consent to Indigen World using these details to respond to your
        request. Do not include restricted cultural knowledge or information about minors.
      </p>

      <p className={`form-status form-status--${status}`} role="status" aria-live="polite">
        {statusMessage}
      </p>
    </form>
  );
}

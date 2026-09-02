import { useId } from "react";
import { Button } from "../../components/Button";
import { submitPublicForm } from "../../lib/forms";
import type { FieldValidation } from "../../lib/types";
import { FormField } from "./FormField";
import { useFormValidation } from "./useFormValidation";

interface NewsletterFormValues {
  email: string;
  country: string;
  consent: string;
}

function validateEmail(value: string): FieldValidation {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { valid: false, message: "Please enter a valid email address." };
  }
  return { valid: true };
}

async function subscribe(values: NewsletterFormValues): Promise<void> {
  await submitPublicForm("newsletter", values);
}

export function NewsletterForm() {
  const id = useId();
  const { values, errors, status, handleChange, handleSubmit, statusMessage } =
    useFormValidation<NewsletterFormValues>({
      initialValues: { email: "", country: "", consent: "" },
      fields: {
        email: { required: true, validate: validateEmail },
        consent: { required: true },
      },
      onSubmit: subscribe,
      formName: "newsletter",
      successMessage: "Welcome to Venacula, the Indigen World newsletter — you're on the list.",
    });

  return (
    <form className="form newsletter-form" onSubmit={handleSubmit} noValidate>
      <div className="newsletter-form__row">
        <FormField
          id={`${id}-email`}
          label="Email address"
          type="email"
          value={values.email}
          error={errors.email}
          required
          autoComplete="email"
          onChange={(value) => handleChange("email", value)}
        />
        <FormField
          id={`${id}-country`}
          label="Country (optional)"
          value={values.country}
          autoComplete="country-name"
          onChange={(value) => handleChange("country", value)}
        />
        <Button type="submit" variant="secondary" showArrow={false} disabled={status === "submitting"}>
          {status === "submitting" ? "Joining…" : "Subscribe"}
        </Button>
      </div>

      <div className={`consent-field ${errors.consent ? "consent-field--error" : ""}`}>
        <label>
          <input
            type="checkbox"
            checked={values.consent === "accepted"}
            onChange={(event) => handleChange("consent", event.target.checked ? "accepted" : "")}
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? `${id}-consent-error` : undefined}
          />
          <span>I agree to receive Venacula, the Indigen World newsletter, by email.</span>
        </label>
        {errors.consent && (
          <p className="field__error" id={`${id}-consent-error`}>
            Please confirm that you would like to receive the newsletter.
          </p>
        )}
      </div>

      <p className="form-notice">
        Newsletter delivery is being prepared. When it begins, every email will include an
        unsubscribe link.
      </p>
      <p className={`form-status form-status--${status}`} role="status" aria-live="polite">
        {statusMessage}
      </p>
    </form>
  );
}

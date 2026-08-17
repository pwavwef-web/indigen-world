/**
 * src/features/forms/WaitlistForm.tsx
 *
 * A single-field "notify me" form for people who aren't ready to fill
 * in the full Get Involved form yet. Not built on top of
 * ContactForm/GetInvolvedForm's shape — one field is simple enough
 * that reusing useFormValidation directly is clearer than trying to
 * generalize three different forms into one component.
 */
import { useFormValidation } from "./useFormValidation";
import { FormField } from "./FormField";
import { Button } from "../../components/Button";
import type { FieldValidation } from "../../lib/types";
import { submitPublicForm } from "../../lib/forms";

interface WaitlistFormValues {
  email: string;
  country: string;
}

function validateEmail(value: string): FieldValidation {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { valid: false, message: "Please enter a valid email." };
  }
  return { valid: true };
}

async function submitWaitlistForm(values: WaitlistFormValues): Promise<void> {
  await submitPublicForm("waitlist", values);
}

export function WaitlistForm() {
  const { values, errors, status, handleChange, handleSubmit, statusMessage } =
    useFormValidation<WaitlistFormValues>({
      initialValues: { email: "", country: "" },
      fields: { email: { required: true, validate: validateEmail } },
      onSubmit: submitWaitlistForm,
      formName: "waitlist",
    });

  return (
    <form className="form waitlist-form" onSubmit={handleSubmit} noValidate>
      <div className="waitlist-form__row">
        <FormField
          id="wl-email"
          label="Email"
          type="email"
          value={values.email}
          error={errors.email}
          required
          onChange={(v) => handleChange("email", v)}
        />
        <FormField
          id="wl-country"
          label="Country (optional)"
          value={values.country}
          autoComplete="country-name"
          onChange={(v) => handleChange("country", v)}
        />
        <Button type="submit" variant="secondary" showArrow={false} disabled={status === "submitting"}>
          {status === "submitting" ? "Joining…" : "Notify me"}
        </Button>
      </div>
      <p className="form-notice">
        Opt in to occasional verified project updates. Unsubscribe details will be included before
        public launch.
      </p>
      {statusMessage && (
        <p className={`form-status form-status--${status}`} role="status">
          {statusMessage}
        </p>
      )}
    </form>
  );
}

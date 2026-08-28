/**
 * src/features/forms/GetInvolvedForm.tsx
 *
 * The multi-route "start a conversation" form on the new Get Involved
 * page. `route` is constrained to INTEREST_ROUTES below, so the
 * dropdown's options and the submitted value can never drift apart.
 */
import { useFormValidation } from "./useFormValidation";
import { FormField } from "./FormField";
import { Button } from "../../components/Button";
import { submitPublicForm } from "../../lib/forms";

interface GetInvolvedFormValues {
  name: string;
  contact: string;
  country: string;
  organisation: string;
  route: string;
  note: string;
}

const EMPTY_VALUES: GetInvolvedFormValues = {
  name: "",
  contact: "",
  country: "",
  organisation: "",
  route: "",
  note: "",
};

const INTEREST_ROUTES = [
  "Language contributor",
  "Elder / teacher validator",
  "School or educator",
  "Researcher",
  "Diaspora supporter",
  "Sponsor or cultural partner",
  "Technical volunteer",
] as const;

async function submitGetInvolvedForm(values: GetInvolvedFormValues): Promise<void> {
  await submitPublicForm("get-involved", values);
}

export function GetInvolvedForm() {
  const { values, errors, status, handleChange, handleSubmit, statusMessage } =
    useFormValidation<GetInvolvedFormValues>({
      initialValues: EMPTY_VALUES,
      fields: {
        name: { required: true },
        contact: { required: true },
        country: { required: true },
        route: { required: true },
        note: { required: true },
      },
      onSubmit: submitGetInvolvedForm,
      formName: "get-involved",
      unavailableMessage:
        "Online submissions are unavailable right now. Email hi@indigenworld.com instead.",
    });

  return (
    <form className="form" onSubmit={handleSubmit} noValidate>
      <FormField
        id="gi-name"
        label="Full name"
        value={values.name}
        error={errors.name}
        required
        autoComplete="name"
        onChange={(v) => handleChange("name", v)}
      />
      <FormField
        id="gi-contact"
        label="Email or phone"
        value={values.contact}
        error={errors.contact}
        required
        autoComplete="email"
        onChange={(v) => handleChange("contact", v)}
      />
      <FormField
        id="gi-country"
        label="Country"
        value={values.country}
        error={errors.country}
        required
        autoComplete="country-name"
        onChange={(v) => handleChange("country", v)}
      />
      <FormField
        id="gi-organisation"
        label="Organisation (optional)"
        value={values.organisation}
        onChange={(v) => handleChange("organisation", v)}
      />
      <FormField
        as="select"
        id="gi-route"
        label="I'm reaching out as a…"
        value={values.route}
        error={errors.route}
        required
        onChange={(v) => handleChange("route", v)}
      >
        <option value="">Select one</option>
        {INTEREST_ROUTES.map((route) => (
          <option key={route}>{route}</option>
        ))}
      </FormField>
      <FormField
        as="textarea"
        id="gi-note"
        label="What would you like to do?"
        value={values.note}
        error={errors.note}
        hint="A sentence or two is enough — we'll follow up with next steps."
        required
        onChange={(v) => handleChange("note", v)}
      />

      <Button type="submit" variant="primary" showArrow={false} disabled={status === "submitting"}>
        {status === "submitting" ? "Sending…" : "Submit interest"}
      </Button>

      <p className="form-notice">
        We use these details only to route and answer your request. Do not submit audio, sacred or
        restricted knowledge, detailed cultural records, or information about minors here.
      </p>

      <p className={`form-status form-status--${status}`} role="status" aria-live="polite">
        {statusMessage}
      </p>
    </form>
  );
}

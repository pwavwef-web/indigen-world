/**
 * src/features/forms/GetInvolvedForm.tsx
 *
 * The multi-route "start a conversation" form on the new Get Involved
 * page. `route` is constrained to INTEREST_ROUTES below, so the
 * dropdown's options and the submitted value can never drift apart.
 */
import { useEffect, useMemo, useState } from "react";
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

export const INTEREST_ROUTES = [
  "Indigen mobile app waitlist",
  "Language contributor",
  "Elder / teacher validator",
  "School or educator",
  "Researcher",
  "Diaspora supporter",
  "Sponsor or cultural partner",
  "Technical volunteer",
] as const;

export type InterestRoute = (typeof INTEREST_ROUTES)[number];

const ROUTES_BY_QUERY: Record<string, InterestRoute> = {
  "mobile-app-waitlist": "Indigen mobile app waitlist",
  "language-contributor": "Language contributor",
  validator: "Elder / teacher validator",
  school: "School or educator",
  researcher: "Researcher",
  diaspora: "Diaspora supporter",
  sponsor: "Sponsor or cultural partner",
  "technical-volunteer": "Technical volunteer",
};

const QUERY_BY_ROUTE = Object.fromEntries(
  Object.entries(ROUTES_BY_QUERY).map(([query, route]) => [route, query])
) as Record<InterestRoute, string>;

export function interestRouteFromLocation(): InterestRoute | "" {
  if (typeof window === "undefined") return "";
  const query = new URLSearchParams(window.location.search).get("route") ?? "";
  return ROUTES_BY_QUERY[query] ?? "";
}

export function queryForInterestRoute(route: InterestRoute): string {
  return QUERY_BY_ROUTE[route];
}

function isInterestRoute(value: string): value is InterestRoute {
  return INTEREST_ROUTES.some((route) => route === value);
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value: string): boolean {
  return value.replace(/\D/g, "").length >= 7;
}

async function submitGetInvolvedForm(values: GetInvolvedFormValues): Promise<void> {
  await submitPublicForm("get-involved", values);
}

export function GetInvolvedForm({
  selectedRoute,
  onRouteChange,
}: {
  selectedRoute?: InterestRoute | "";
  onRouteChange?: (route: InterestRoute | "") => void;
}) {
  const [contactMethod, setContactMethod] = useState<"email" | "phone">("email");
  const initialValues = useMemo(
    () => ({ ...EMPTY_VALUES, route: selectedRoute || interestRouteFromLocation() }),
    []
  );
  const { values, errors, status, handleChange, handleSubmit, statusMessage } =
    useFormValidation<GetInvolvedFormValues>({
      initialValues,
      fields: {
        name: { required: true },
        contact: {
          required: true,
          validate: (value) =>
            contactMethod === "email"
              ? validEmail(value)
                ? { valid: true }
                : { valid: false, message: "Please enter a valid email address." }
              : validPhone(value)
                ? { valid: true }
                : { valid: false, message: "Please enter a valid phone number with its country code." },
        },
        country: { required: true },
        route: { required: true },
        note: { required: true },
      },
      onSubmit: submitGetInvolvedForm,
      formName: "get-involved",
      unavailableMessage:
        "Online submissions are unavailable right now. Email hi@indigenworld.com instead.",
    });

  useEffect(() => {
    if (selectedRoute) handleChange("route", selectedRoute);
    // The card selection is the only external route update this form accepts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute]);

  return (
    <form id="get-involved-form" className="form" onSubmit={handleSubmit} noValidate>
      <FormField
        id="gi-name"
        label="Full name"
        value={values.name}
        error={errors.name}
        required
        autoComplete="name"
        onChange={(v) => handleChange("name", v)}
      />
      <fieldset className="contact-method">
        <legend>How should we contact you?</legend>
        <div>
          <label>
            <input
              type="radio"
              name="contact-method"
              value="email"
              checked={contactMethod === "email"}
              onChange={() => {
                setContactMethod("email");
                handleChange("contact", "");
              }}
            />
            Email
          </label>
          <label>
            <input
              type="radio"
              name="contact-method"
              value="phone"
              checked={contactMethod === "phone"}
              onChange={() => {
                setContactMethod("phone");
                handleChange("contact", "");
              }}
            />
            Phone or WhatsApp
          </label>
        </div>
      </fieldset>
      <FormField
        id="gi-contact"
        label={contactMethod === "email" ? "Email address" : "Phone or WhatsApp number"}
        type={contactMethod === "email" ? "email" : "tel"}
        value={values.contact}
        error={errors.contact}
        required
        autoComplete={contactMethod === "email" ? "email" : "tel"}
        hint={
          contactMethod === "email"
            ? "We'll send an automatic acknowledgement here."
            : "Include the international country code, for example +233."
        }
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
        onChange={(v) => {
          handleChange("route", v);
          onRouteChange?.(isInterestRoute(v) ? v : "");
        }}
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

      <p className="form-response-time">
        We aim to acknowledge your interest within five working days. Some routes may take longer
        when community, safeguarding, or rights-holder consultation is needed.
      </p>

      <p className={`form-status form-status--${status}`} role="status" aria-live="polite">
        {statusMessage}
      </p>
    </form>
  );
}

import { useFormValidation } from "./useFormValidation";
import { FormField } from "./FormField";
import { Button } from "../../components/Button";
import { submitPublicForm } from "../../lib/forms";
import type { FieldValidation } from "../../lib/types";

interface TesterRewardClaimValues {
  certificateName: string;
  cardName: string;
  playEmail: string;
  contactEmail: string;
  country: string;
  recognitionChoice: string;
  recognitionName: string;
  profileUrl: string;
  testerConfirmation: string;
  usageConfirmation: string;
  feedbackConfirmation: string;
  honestFeedbackConfirmation: string;
  privacyConsent: string;
  note: string;
}

const EMPTY_VALUES: TesterRewardClaimValues = {
  certificateName: "",
  cardName: "",
  playEmail: "",
  contactEmail: "",
  country: "",
  recognitionChoice: "",
  recognitionName: "",
  profileUrl: "",
  testerConfirmation: "",
  usageConfirmation: "",
  feedbackConfirmation: "",
  honestFeedbackConfirmation: "",
  privacyConsent: "",
  note: "",
};

function validateEmail(value: string): FieldValidation {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? { valid: true }
    : { valid: false, message: "Please enter a valid email address." };
}

function validateProfileUrl(value: string): FieldValidation {
  if (!value.trim()) return { valid: true };
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? { valid: true }
      : { valid: false, message: "Please enter a full web address beginning with https://." };
  } catch {
    return { valid: false, message: "Please enter a full web address beginning with https://." };
  }
}

export function TesterRewardClaimForm() {
  const { values, errors, status, handleChange, handleSubmit, statusMessage } =
    useFormValidation<TesterRewardClaimValues>({
      initialValues: EMPTY_VALUES,
      fields: {
        certificateName: { required: true },
        cardName: { required: true },
        playEmail: { required: true, validate: validateEmail },
        contactEmail: { required: true, validate: validateEmail },
        country: { required: true },
        recognitionChoice: { required: true },
        profileUrl: { validate: validateProfileUrl },
        testerConfirmation: { required: true },
        usageConfirmation: { required: true },
        feedbackConfirmation: { required: true },
        honestFeedbackConfirmation: { required: true },
        privacyConsent: { required: true },
      },
      onSubmit: (claim) => submitPublicForm("tester-reward-claim", claim),
      formName: "tester-reward-claim",
      successMessage:
        "Thank you — your details have been received. We’ll verify your testing participation before preparing your Founding Tester recognition.",
      unavailableMessage:
        "This claim form is temporarily unavailable. Please contact the testing team using the channel that shared this page.",
    });

  const toggle = (name: keyof TesterRewardClaimValues, checked: boolean, checkedValue: string) => {
    handleChange(name, checked ? checkedValue : "");
  };

  const confirmations: Array<[keyof TesterRewardClaimValues, string]> = [
    ["testerConfirmation", "I remained opted into the Google Play test throughout the testing period."],
    ["usageConfirmation", "I used the app on multiple occasions."],
    ["feedbackConfirmation", "I completed the official feedback form."],
    ["honestFeedbackConfirmation", "The feedback I submitted was honest and specific."],
  ];

  return (
    <form className="form tester-claim-form" onSubmit={handleSubmit} noValidate>
      <fieldset className="tester-claim-fieldset">
        <legend>Your recognition details</legend>
        <FormField id="tr-certificate-name" label="Name for your digital certificate" value={values.certificateName} error={errors.certificateName} hint="Enter it exactly as you want it to appear." required autoComplete="name" onChange={(value) => handleChange("certificateName", value)} />
        <FormField id="tr-card-name" label="Name for your Founding Tester card" value={values.cardName} error={errors.cardName} hint="This can be the same as your certificate name." required autoComplete="name" onChange={(value) => handleChange("cardName", value)} />
        <FormField id="tr-play-email" label="Email used for the Google Play test" type="email" value={values.playEmail} error={errors.playEmail} hint="We use this only to verify your participation in the testing cycle." required autoComplete="email" onChange={(value) => handleChange("playEmail", value)} />
        <FormField id="tr-contact-email" label="Best email for receiving your certificate and updates" type="email" value={values.contactEmail} error={errors.contactEmail} required autoComplete="email" onChange={(value) => handleChange("contactEmail", value)} />
        <FormField id="tr-country" label="Country of residence" value={values.country} error={errors.country} required autoComplete="country-name" onChange={(value) => handleChange("country", value)} />
      </fieldset>

      <fieldset className="tester-claim-fieldset">
        <legend>Eligibility confirmation</legend>
        {confirmations.map(([name, label]) => (
          <div className="consent-field" key={name}>
            <label>
              <input type="checkbox" checked={values[name] === "confirmed"} onChange={(event) => toggle(name, event.target.checked, "confirmed")} />
              <span>{label}</span>
            </label>
            {errors[name] ? <p className="field__error">Please confirm this requirement.</p> : null}
          </div>
        ))}
      </fieldset>

      <fieldset className="tester-claim-fieldset">
        <legend>Optional public recognition</legend>
        <p className="field__hint tester-claim-fieldset__intro">Would you like to be listed on the Founding Testers page? This has no effect on your reward eligibility.</p>
        <div className="contact-method">
          <div>
            <label><input type="radio" name="recognition-choice" checked={values.recognitionChoice === "yes"} onChange={() => handleChange("recognitionChoice", "yes")} />Yes, list me</label>
            <label><input type="radio" name="recognition-choice" checked={values.recognitionChoice === "no"} onChange={() => handleChange("recognitionChoice", "no")} />No, keep me private</label>
          </div>
          {errors.recognitionChoice ? <p className="field__error">Please choose yes or no.</p> : null}
        </div>
        {values.recognitionChoice === "yes" ? (
          <>
            <FormField id="tr-recognition-name" label="Public recognition name (optional)" value={values.recognitionName} hint="Leave blank to use your card name." onChange={(value) => handleChange("recognitionName", value)} />
            <FormField id="tr-profile-url" label="Profile or website link (optional)" type="url" value={values.profileUrl} error={errors.profileUrl} hint="Only provide a link you are comfortable making public." onChange={(value) => handleChange("profileUrl", value)} />
          </>
        ) : null}
        <FormField as="textarea" id="tr-note" label="Anything else we should know? (optional)" value={values.note} onChange={(value) => handleChange("note", value)} />
      </fieldset>

      <div className="consent-field">
        <label>
          <input type="checkbox" checked={values.privacyConsent === "accepted"} onChange={(event) => toggle("privacyConsent", event.target.checked, "accepted")} />
          <span>I consent to Indigen World using these details to verify my eligibility and prepare, deliver and administer the tester rewards described on this page.</span>
        </label>
        {errors.privacyConsent ? <p className="field__error">Please confirm before submitting.</p> : null}
      </div>

      <Button type="submit" variant="primary" showArrow={false} disabled={status === "submitting"}>{status === "submitting" ? "Submitting…" : "Submit reward details"}</Button>
      <p className="form-notice">Your details are visible only to authorised Indigen World staff. We do not ask for a positive rating, and critical feedback will never affect eligibility.</p>
      <p className={`form-status form-status--${status}`} role="status" aria-live="polite">{statusMessage}</p>
    </form>
  );
}

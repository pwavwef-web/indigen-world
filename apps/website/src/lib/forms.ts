export type PublicFormName = "contact" | "get-involved" | "waitlist";

export interface PublicFormPayloads {
  contact: {
    name: string;
    email: string;
    subject: string;
    message: string;
  };
  "get-involved": {
    name: string;
    contact: string;
    country: string;
    organisation: string;
    route: string;
    note: string;
  };
  waitlist: {
    email: string;
    country: string;
  };
}

export class FormServiceError extends Error {
  constructor(public readonly code: "unavailable" | "rejected" | "network") {
    super(code);
    this.name = "FormServiceError";
  }
}

/**
 * Boundary for the reviewed shared form endpoint. No Firestore collection
 * names or backend assumptions leak into the website. The endpoint should be
 * a rate-limited Firebase HTTPS Function that validates the same payload.
 */
export async function submitPublicForm<Name extends PublicFormName>(
  form: Name,
  payload: PublicFormPayloads[Name]
): Promise<void> {
  const endpoint = import.meta.env.VITE_PUBLIC_FORMS_ENDPOINT?.trim();
  if (!endpoint) throw new FormServiceError("unavailable");

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form, payload }),
    });

    if (!response.ok) throw new FormServiceError("rejected");
  } catch (error) {
    if (error instanceof FormServiceError) throw error;
    throw new FormServiceError("network");
  }
}

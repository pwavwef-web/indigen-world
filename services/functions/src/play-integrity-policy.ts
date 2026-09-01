/**
 * What a Play Integrity verdict means for us.
 *
 * Deliberately free of Firebase, `fetch` and the Admin SDK so the rules a
 * device is judged by can be read — and tested — on their own. `play-integrity.ts`
 * fetches and decodes; this file decides.
 *
 * ── The seven signals ──────────────────────────────────────────────────────
 * Play Console lists seven "services" under the Play Integrity API, and each
 * one is a single field of the decoded payload. The names in the console and
 * the names in the JSON are not the same words, so both are written here:
 *
 * | Play Console                     | Payload field                                  |
 * | -------------------------------- | ---------------------------------------------- |
 * | Detect unauthorised access       | `accountDetails.appLicensingVerdict`           |
 * | Detect app tampering             | `appIntegrity.appRecognitionVerdict`           |
 * | Detect risky devices             | `deviceIntegrity.deviceRecognitionVerdict`     |
 * | Detect Play Games for PC         | …the same field's `MEETS_VIRTUAL_INTEGRITY`    |
 * | Detect hyperactive devices       | `deviceIntegrity.recentDeviceActivity`         |
 * | Detect known malware             | `environmentDetails.playProtectVerdict`        |
 * | Detect apps with risky permissions | `environmentDetails.appAccessRiskVerdict`    |
 *
 * The last three arrive only after they are switched on in Play Console, and
 * they arrive as `UNEVALUATED` (or missing) until then. `UNEVALUATED` is never
 * treated as a failure anywhere below: a signal nobody enabled is not evidence
 * of anything, and a policy that blocked on it would lock every member out the
 * moment it shipped.
 *
 * ── Why the default mode is `monitor` ─────────────────────────────────────
 * Integrity is a signal about a device, not a judgement about a person. Ghana
 * runs a great many second-hand handsets, custom ROMs and sideloaded builds,
 * and a fair number of them belong to exactly the members this project exists
 * for. Blocking on the first day, on data nobody has looked at yet, would be
 * the wrong trade. So the shipped default records the verdict and lets
 * everything through; `PLAY_INTEGRITY_MODE=enforce` is a decision to take once
 * there are a few weeks of verdicts to look at.
 */

/** How hard the verdict is applied. */
export type IntegrityMode = 'off' | 'monitor' | 'enforce';

/** What the policy concluded. */
export type IntegrityDecision = 'allow' | 'flag' | 'block';

/** The three levels of trust Play's device verdict can express, ranked. */
export type DeviceTrust = 'strong' | 'device' | 'basic' | 'virtual' | 'none';

export interface IntegrityPayload {
  requestDetails?: {
    requestPackageName?: string;
    /** Standard API. Whatever the app put in the request, echoed back. */
    requestHash?: string;
    /** Classic API. Present instead of `requestHash` on classic requests. */
    nonce?: string;
    timestampMillis?: string | number;
  };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
    certificateSha256Digest?: string[];
    versionCode?: string | number;
  };
  deviceIntegrity?: {
    deviceRecognitionVerdict?: string[];
    recentDeviceActivity?: { deviceActivityLevel?: string };
  };
  accountDetails?: { appLicensingVerdict?: string };
  environmentDetails?: {
    playProtectVerdict?: string;
    appAccessRiskVerdict?: {
      appsDetected?: string[];
    };
  };
}

export interface IntegrityPolicy {
  mode: IntegrityMode;
  /** The application id this token must have been minted for. */
  expectedPackageName: string;
  /**
   * Upload/signing certificate digests that count as "our build", base64url of
   * the SHA-256. Empty means the check is skipped — Play App Signing rotates
   * what a device sees, so an unmaintained list here is worse than none.
   */
  expectedCertificateDigests: readonly string[];
  /** How old a token may be before it is treated as replayed. */
  maxTokenAgeMs: number;
  /** The weakest device verdict that still counts as a real device. */
  minimumDeviceTrust: Exclude<DeviceTrust, 'none'>;
  /** Whether Play Games for PC and other virtual devices are welcome. */
  allowVirtualDevices: boolean;
  /** Whether an unlicensed install (sideloaded, not from Play) is refused. */
  requireLicensed: boolean;
  /** Play Protect states that count against a device. */
  blockOnPlayProtect: readonly string[];
  /** `appAccessRiskVerdict.appsDetected` values that count against a device. */
  blockOnAppAccessRisk: readonly string[];
  /** Recent-activity levels treated as hyperactive. */
  flagOnActivityLevels: readonly string[];
}

export const DEFAULT_INTEGRITY_POLICY: IntegrityPolicy = {
  mode: 'monitor',
  expectedPackageName: '',
  expectedCertificateDigests: [],
  // Ten minutes. Long enough for a slow network and a backgrounded app to
  // still finish a purchase; far too short to be worth farming tokens for.
  maxTokenAgeMs: 10 * 60 * 1000,
  // `basic` rather than `device`: MEETS_BASIC_INTEGRITY covers a rooted-but-real
  // handset, and rooting a phone you own is not fraud. The signal is still
  // recorded, so a later decision can be made on evidence.
  minimumDeviceTrust: 'basic',
  // Play Games for PC is a Google product and a legitimate way to run this app.
  allowVirtualDevices: true,
  // Off by default because internal testing tracks, App Bundle sideloads and
  // pre-release builds are all "unlicensed" and all ours.
  requireLicensed: false,
  blockOnPlayProtect: ['HIGH_RISK'],
  // Screen capture and overlay of an unknown app is the pattern behind most
  // on-device purchase fraud, so those two are the ones that count.
  blockOnAppAccessRisk: ['UNKNOWN_CAPTURING', 'UNKNOWN_OVERLAYS'],
  flagOnActivityLevels: ['LEVEL_4'],
};

/** Reads the policy out of the environment, falling back to the defaults. */
export function integrityPolicyFromEnv(
  env: Record<string, string | undefined>,
): IntegrityPolicy {
  const mode = env.PLAY_INTEGRITY_MODE;
  return {
    ...DEFAULT_INTEGRITY_POLICY,
    mode: mode === 'off' || mode === 'monitor' || mode === 'enforce'
      ? mode
      : DEFAULT_INTEGRITY_POLICY.mode,
    expectedPackageName: (env.ANDROID_PACKAGE_NAME ?? '').trim(),
    expectedCertificateDigests: splitList(env.ANDROID_CERTIFICATE_DIGESTS),
    requireLicensed: env.PLAY_INTEGRITY_REQUIRE_LICENSED === 'true',
    allowVirtualDevices: env.PLAY_INTEGRITY_ALLOW_VIRTUAL !== 'false',
    minimumDeviceTrust: deviceTrustFromEnv(env.PLAY_INTEGRITY_MIN_DEVICE_TRUST),
  };
}

function splitList(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function deviceTrustFromEnv(
  raw: string | undefined,
): Exclude<DeviceTrust, 'none'> {
  switch (raw) {
    case 'strong':
    case 'device':
    case 'basic':
    case 'virtual':
      return raw;
    default:
      return DEFAULT_INTEGRITY_POLICY.minimumDeviceTrust;
  }
}

const TRUST_RANK: Record<DeviceTrust, number> = {
  strong: 4,
  device: 3,
  basic: 2,
  virtual: 1,
  none: 0,
};

/**
 * The best trust level a device verdict list expresses.
 *
 * The field is a list because the levels are cumulative — a good phone reports
 * `[MEETS_BASIC_INTEGRITY, MEETS_DEVICE_INTEGRITY, MEETS_STRONG_INTEGRITY]` —
 * so the answer is the strongest entry, not the first.
 */
export function deviceTrustOf(verdicts: readonly string[] | undefined): DeviceTrust {
  const set = new Set(verdicts ?? []);
  if (set.has('MEETS_STRONG_INTEGRITY')) return 'strong';
  if (set.has('MEETS_DEVICE_INTEGRITY')) return 'device';
  if (set.has('MEETS_BASIC_INTEGRITY')) return 'basic';
  if (set.has('MEETS_VIRTUAL_INTEGRITY')) return 'virtual';
  return 'none';
}

/** The seven console signals, flattened into something worth storing. */
export interface IntegritySignals {
  /** Detect unauthorised access. */
  licensing: string;
  /** Detect app tampering. */
  appRecognition: string;
  /** Detect risky devices. */
  deviceTrust: DeviceTrust;
  /** Detect Play Games for PC. */
  virtualDevice: boolean;
  /** Detect hyperactive devices. */
  activityLevel: string;
  /** Detect known malware. */
  playProtect: string;
  /** Detect apps with risky permissions. */
  appsDetected: readonly string[];
  /** The application id the token was actually minted for. */
  packageName: string;
  /** Milliseconds since the epoch, or 0 when Play sent nothing parseable. */
  issuedAtMs: number;
}

export interface IntegrityVerdict {
  decision: IntegrityDecision;
  /** Machine-readable causes, e.g. `device_untrusted`, `stale_token`. */
  reasons: readonly string[];
  signals: IntegritySignals;
  /**
   * Whether the app should be told to stop. False in `monitor` mode even when
   * [reasons] is long — that is the entire difference between the two modes.
   */
  blocked: boolean;
}

/** Pulls the seven signals out of a decoded payload, tolerating every absence. */
export function readSignals(payload: IntegrityPayload): IntegritySignals {
  const device = payload.deviceIntegrity ?? {};
  const verdicts = Array.isArray(device.deviceRecognitionVerdict)
    ? device.deviceRecognitionVerdict
    : [];
  const timestamp = payload.requestDetails?.timestampMillis;
  const issuedAtMs = typeof timestamp === 'number'
    ? timestamp
    : Number.parseInt(String(timestamp ?? ''), 10);

  return {
    licensing: payload.accountDetails?.appLicensingVerdict ?? 'UNEVALUATED',
    appRecognition: payload.appIntegrity?.appRecognitionVerdict ?? 'UNEVALUATED',
    deviceTrust: deviceTrustOf(verdicts),
    virtualDevice: verdicts.includes('MEETS_VIRTUAL_INTEGRITY'),
    activityLevel:
      device.recentDeviceActivity?.deviceActivityLevel ?? 'UNEVALUATED',
    playProtect: payload.environmentDetails?.playProtectVerdict ?? 'UNEVALUATED',
    appsDetected: payload.environmentDetails?.appAccessRiskVerdict?.appsDetected ?? [],
    packageName:
      payload.requestDetails?.requestPackageName
      ?? payload.appIntegrity?.packageName
      ?? '',
    issuedAtMs: Number.isFinite(issuedAtMs) ? issuedAtMs : 0,
  };
}

/**
 * Judges a decoded payload.
 *
 * [expectedHash] is the one-time value this backend issued and the app was
 * asked to bind into its request. Comparing it is what makes a token a proof
 * about *this* request rather than a bearer credential somebody can replay from
 * a different device an hour later; a missing expectation skips the check
 * rather than failing it, so the classic-API shape still evaluates.
 */
export function evaluateIntegrity(input: {
  payload: IntegrityPayload;
  policy: IntegrityPolicy;
  expectedHash?: string;
  now: number;
}): IntegrityVerdict {
  const { payload, policy, expectedHash, now } = input;
  const signals = readSignals(payload);
  const reasons: string[] = [];

  if (
    policy.expectedPackageName
    && signals.packageName
    && signals.packageName !== policy.expectedPackageName
  ) {
    reasons.push('wrong_package');
  }

  if (expectedHash) {
    const seen = payload.requestDetails?.requestHash
      ?? payload.requestDetails?.nonce
      ?? '';
    if (seen !== expectedHash) reasons.push('request_mismatch');
  }

  if (signals.issuedAtMs > 0 && now - signals.issuedAtMs > policy.maxTokenAgeMs) {
    reasons.push('stale_token');
  }

  // `UNEVALUATED` means Play could not judge, which is not the same as judging
  // badly. Only an actual "this is not our build" counts.
  if (signals.appRecognition === 'UNRECOGNIZED_VERSION') {
    reasons.push('app_tampered');
  }

  const digests = payload.appIntegrity?.certificateSha256Digest ?? [];
  if (
    policy.expectedCertificateDigests.length > 0
    && digests.length > 0
    && !digests.some((digest) => policy.expectedCertificateDigests.includes(digest))
  ) {
    reasons.push('wrong_signature');
  }

  if (policy.requireLicensed && signals.licensing === 'UNLICENSED') {
    reasons.push('unlicensed');
  }

  // A device that is *only* virtual is judged by the virtual-device rule, not
  // by the trust floor: Play Games for PC never reports MEETS_DEVICE_INTEGRITY
  // and treating that as a rooted phone would be plainly wrong.
  if (signals.deviceTrust === 'virtual') {
    if (!policy.allowVirtualDevices) reasons.push('virtual_device');
  } else if (TRUST_RANK[signals.deviceTrust] < TRUST_RANK[policy.minimumDeviceTrust]) {
    reasons.push('device_untrusted');
  }

  if (policy.blockOnPlayProtect.includes(signals.playProtect)) {
    reasons.push('play_protect_risk');
  }

  const risky = signals.appsDetected.filter((entry) =>
    policy.blockOnAppAccessRisk.includes(entry),
  );
  if (risky.length > 0) reasons.push('app_access_risk');

  // Hyperactivity never blocks on its own. A shared handset in a compound, or
  // a phone that has been reset and restored, both look hyperactive and neither
  // is fraud — it is a reason to look, not a reason to refuse.
  const hyperactive = policy.flagOnActivityLevels.includes(signals.activityLevel);

  const decision: IntegrityDecision = reasons.length > 0
    ? 'block'
    : hyperactive
      ? 'flag'
      : 'allow';

  return {
    decision,
    reasons: hyperactive ? [...reasons, 'hyperactive_device'] : reasons,
    signals,
    blocked: policy.mode === 'enforce' && decision === 'block',
  };
}

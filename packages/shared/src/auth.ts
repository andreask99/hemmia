import { z } from 'zod';

export const Language = z.enum(['en', 'de']);
export type Language = z.infer<typeof Language>;

export const Role = z.enum(['admin', 'member']);
export type Role = z.infer<typeof Role>;

/** 3–32 characters: letters, digits, dot, dash, underscore. Case-insensitive, unique. */
export const Username = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._-]{3,32}$/);

/** Length rules only; the server also rejects very common passwords. */
export const NewPassword = z.string().min(12).max(256);
/** For login: don't reveal the policy, just bound the size. */
export const AnyPassword = z.string().min(1).max(256);

export const LoginRequest = z.object({ username: Username, password: AnyPassword });
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AcceptInviteRequest = z.object({
  code: z.string().min(16).max(128),
  username: Username,
  password: NewPassword,
});
export type AcceptInviteRequest = z.infer<typeof AcceptInviteRequest>;

export const RecoverRequest = z.object({
  username: Username,
  recoveryCode: z.string().min(20).max(64),
  newPassword: NewPassword,
});
export type RecoverRequest = z.infer<typeof RecoverRequest>;

export const ChangePasswordRequest = z.object({
  currentPassword: AnyPassword,
  newPassword: NewPassword,
});
export type ChangePasswordRequest = z.infer<typeof ChangePasswordRequest>;

export const MeResponse = z.object({
  id: z.string(),
  username: z.string(),
  role: Role,
  restricted: z.boolean(),
  language: Language,
  defaultModelId: z.string().nullable(),
});
export type MeResponse = z.infer<typeof MeResponse>;

/**
 * Error codes the API returns as `{ error: { code } }`. The web app translates them;
 * the server never sends user-facing text or echoes input.
 */
export const ErrorCode = z.enum([
  'bad_request',
  'unauthenticated',
  'forbidden',
  'not_found',
  'invalid_credentials',
  'invite_invalid',
  'username_taken',
  'weak_password',
  'rate_limited',
  'payload_too_large',
  /** The message is longer than the chosen model can read (see ChatModelInfo.maxMessageChars). */
  'too_long',
  'busy',
  /** An admin paused kchat (e.g. to free the Mac for other work). */
  'paused',
  /** Other work on the Mac (not kchat) uses the memory a model needs; try again later. */
  'machine_busy',
  /** The week already has the maximum number of goals in that area. */
  'too_many_goals',
  /** The day already has its must win, or its two other items. */
  'day_full',
  /** No API key for this cloud model's provider, or the provider rejected it. */
  'cloud_key',
  /** The cloud provider can't be reached, is overloaded or limits this key right now. */
  'cloud_unavailable',
  /** The cloud model declined to answer (provider safety rules). */
  'refused',
  /** The user's monthly cloud spending cap is reached. */
  'over_budget',
  /** No chat model is set up yet (a new hub): an admin adds one in Settings → Models. */
  'no_model',
  /** This computer's model engine can't run the model (e.g. Ollama doesn't support it yet). */
  'model_unsupported',
  /** A local model server outside this computer and the home network (P1.7). */
  'address_not_allowed',
  /** A local model server that doesn't answer. */
  'unreachable',
  /** The most allowed of something (e.g. 5 local model servers). */
  'too_many',
  /** Not enough free disk space for a model download. */
  'disk_full',
  /** This build has no relay configured (HEMMIA_RELAY_DOMAIN). */
  'relay_not_configured',
  /** The relay can't be reached or refused (see the remote status for details). */
  'relay_unavailable',
  /** Through the relay: this device isn't paired yet (open an invite or sign-in link). */
  'device_required',
  /** The user has the most devices allowed; remove one in Settings. */
  'too_many_devices',
  /** A link or code that doesn't work: unknown, used, expired or malformed (all the same). */
  'link_invalid',
  'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z.object({
  error: z.object({ code: ErrorCode, retryAfterSeconds: z.number().int().optional() }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const SessionResponse = z.object({ me: MeResponse });
export type SessionResponse = z.infer<typeof SessionResponse>;

/** Account created or recovered: includes the (new) recovery code, shown once. */
export const AccountResponse = z.object({ me: MeResponse, recoveryCode: z.string() });
export type AccountResponse = z.infer<typeof AccountResponse>;

export const SessionInfo = z.object({
  id: z.string(),
  deviceLabel: z.string(),
  createdAt: z.number().int(),
  lastSeenAt: z.number().int(),
  current: z.boolean(),
});
export type SessionInfo = z.infer<typeof SessionInfo>;

export const SessionListResponse = z.object({ sessions: z.array(SessionInfo) });
export type SessionListResponse = z.infer<typeof SessionListResponse>;

export const UpdateMeRequest = z
  .object({ language: Language.optional(), defaultModelId: z.string().nullable().optional() })
  .refine((v) => v.language !== undefined || v.defaultModelId !== undefined, 'nothing to update');
export type UpdateMeRequest = z.infer<typeof UpdateMeRequest>;

// Admin (account metadata only; no endpoint ever returns content)

export const CreateInviteRequest = z.object({
  role: Role.default('member'),
  restricted: z.boolean().default(false),
});
export type CreateInviteRequest = z.infer<typeof CreateInviteRequest>;

/** The invite link is returned once; only its hash is stored. */
export const CreateInviteResponse = z.object({
  link: z.string(),
  expiresAt: z.number().int(),
  /** The invite as a share link (remote access on) and a direct link to the hub, if any. */
  shareLink: z.string().nullable().default(null),
  directLink: z.string().nullable().default(null),
});
export type CreateInviteResponse = z.infer<typeof CreateInviteResponse>;

export const AdminUser = z.object({
  id: z.string(),
  username: z.string(),
  role: Role,
  restricted: z.boolean(),
  createdAt: z.number().int(),
  disabledAt: z.number().int().nullable(),
  lastSeenAt: z.number().int().nullable(),
  sessions: z.number().int(),
});
export type AdminUser = z.infer<typeof AdminUser>;

export const AdminUserListResponse = z.object({ users: z.array(AdminUser) });
export type AdminUserListResponse = z.infer<typeof AdminUserListResponse>;

export const AdminUpdateUserRequest = z
  .object({ disabled: z.boolean().optional(), restricted: z.boolean().optional() })
  .refine((v) => v.disabled !== undefined || v.restricted !== undefined, 'nothing to update');
export type AdminUpdateUserRequest = z.infer<typeof AdminUpdateUserRequest>;

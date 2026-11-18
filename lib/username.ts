// Shared by the browser and the API routes.

// Supabase Auth needs an email address, so each username maps to a
// placeholder on the reserved .invalid TLD (RFC 2606): it can never belong to
// a real mailbox, and nothing is ever sent to it.
export const AUTH_EMAIL_DOMAIN = "users.invalid";

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,31}$/;
export const USERNAME_RULES =
  "3–32 characters: lowercase letters, digits, and _ . - (must start with a letter or digit)";

export const MIN_PASSWORD_LENGTH = 12;

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${AUTH_EMAIL_DOMAIN}`;
}

// Accounts created before usernames still sign in with their real email.
export function loginIdentifierToEmail(identifier: string): string {
  const trimmed = identifier.trim();
  return trimmed.includes("@") ? trimmed : usernameToAuthEmail(trimmed);
}

// Display name for a Supabase auth user.
export function displayName(user: {
  email?: string | null;
  user_metadata?: { username?: string } | null;
}): string {
  return user.user_metadata?.username ?? user.email ?? "";
}

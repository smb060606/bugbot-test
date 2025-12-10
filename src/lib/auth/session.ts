import type { Cookies } from '@sveltejs/kit';
import { getUserByHandle } from '$lib/services/userService';

export type SessionData = {
  userId: string;
  handle: string;
  verifiedAt: string;
};

/**
 * Get the current session from cookies.
 * Returns null if no valid session exists.
 */
export function getSession(cookies: Cookies): SessionData | null {
  try {
    const sessionCookie = cookies.get('session');
    if (!sessionCookie) return null;
    const session = JSON.parse(sessionCookie) as SessionData;
    // Basic validation
    if (!session.userId || !session.handle || !session.verifiedAt) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Clear the session cookie.
 */
export function clearSession(cookies: Cookies): void {
  cookies.delete('session', { path: '/' });
}

/**
 * Get the current authenticated user's handle.
 * Returns null if not authenticated.
 */
export function getCurrentUserHandle(cookies: Cookies): string | null {
  const session = getSession(cookies);
  return session?.handle ?? null;
}


import type { RequestHandler } from '@sveltejs/kit';
import { clearSession } from '$lib/auth/session';

/**
 * POST /api/auth/logout
 * Clears the user session cookie.
 */
export const POST: RequestHandler = async ({ cookies }) => {
  try {
    clearSession(cookies);
    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Successfully logged out'
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        error: 'logout_failed',
        message: e?.message ?? 'An error occurred while logging out'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};


import type { RequestHandler } from '@sveltejs/kit';
import { getChallenge, clearChallenge, verifyPostContainsCode } from '$lib/auth/bskyVerifyStore';
import { getOrCreateUser } from '$lib/services/userService';

/**
 * POST /api/auth/bsky/verify-challenge
 * Body: { handle: string }
 * Verifies that the user posted the issued challenge code on Bluesky recently.
 * If successful, creates/updates user in Supabase, issues a session cookie, and returns user info.
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
  try {
    const body = await request.json().catch(() => ({} as any));
    const handle = (body?.handle ?? '').toString().trim();

    if (!handle) {
      return new Response(JSON.stringify({ error: 'missing_handle', message: 'Bluesky handle is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const ch = getChallenge(handle);
    if (!ch) {
      return new Response(
        JSON.stringify({
          error: 'no_active_challenge',
          message: 'No active verification challenge found. Please create a new challenge first.'
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Verify that the posted content contains the code
    const verify = await verifyPostContainsCode(handle, ch.code, 15);
    if (!verify.ok) {
      return new Response(
        JSON.stringify({
          error: 'verification_failed',
          reason: verify.reason,
          message: `Verification failed: ${verify.reason === 'code_not_found_recent_posts' ? 'Code not found in recent posts. Please post the code and try again.' : 'Unable to verify post.'}`
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Clear the challenge since it's been satisfied
    clearChallenge(handle);

    // Create or update user in Supabase
    const user = await getOrCreateUser(handle);
    if (!user) {
      return new Response(
        JSON.stringify({
          error: 'user_creation_failed',
          message: 'Failed to create user account. Please try again later.'
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Set session cookie (simple approach; in production, consider JWT or Supabase Auth)
    // Cookie contains user ID and handle for session validation
    const sessionData = {
      userId: user.id,
      handle: user.bskyHandle,
      verifiedAt: user.verifiedAt
    };
    cookies.set('session', JSON.stringify(sessionData), {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30 // 30 days
    });

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: user.id,
          handle: user.bskyHandle,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          verifiedAt: user.verifiedAt
        }
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
      }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        error: 'verify_challenge_failed',
        message: e?.message ?? 'An unexpected error occurred during verification'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};

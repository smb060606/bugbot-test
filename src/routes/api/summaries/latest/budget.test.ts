import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from './+server';

// Mock OpenAI SDK
vi.mock('openai', () => {
  class MockChat {
    completions = {
      create: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'Mock summary content.' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      })
    };
  }
  return {
    default: class OpenAI {
      chat = new MockChat();
    }
  };
});

// Mock Bluesky services to generate many posts so prompt exceeds budget
vi.mock('$lib/services/bskyService', () => {
  return {
    selectEligibleAccounts: vi.fn().mockResolvedValue([
      {
        profile: {
          did: 'did:example:1',
          handle: 'user1.example',
          displayName: 'User One'
        },
        eligibility: { eligible: true, reasons: [] }
      }
    ]),
    fetchRecentPostsForAccounts: vi.fn().mockImplementation(async (_accounts, _sinceMin) => {
      const now = Date.now();
      // Generate many posts to exceed any small budget
      const big: any[] = [];
      for (let i = 0; i < 200; i++) {
        big.push({
          uri: `at://did:example:1/app.bsky.feed.post/${i + 1}`,
          cid: `cid${i + 1}`,
          author: { did: 'did:example:1', handle: 'user1.example', displayName: 'User One' },
          text: 'x'.repeat(50), // 50 chars per post
          createdAt: new Date(now - i * 1000).toISOString()
        });
      }
      return big;
    })
  };
});

describe('summaries/latest API - budget preflight trimming', () => {
  let originalFetch: any;

  beforeEach(() => {
    vi.useFakeTimers();
    process.env.OPENAI_API_KEY = 'test-key';

    // Configure small model budget: MODEL_MAX_TOKENS=1000, reserve 600 for completion, 1 char/token => budget ~400 chars
    process.env.SUMMARIES_MODEL_MAX_TOKENS = '1000';
    process.env.SUMMARIES_RESPONSE_TOKENS = '600';
    process.env.SUMMARIES_CHARS_PER_TOKEN = '1';

    // Provide Supabase envs so audit runs; stub fetch to capture audit insert
    process.env.SUPABASE_URL = 'http://localhost:54321';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

    originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.OPENAI_API_KEY;
    delete process.env.SUMMARIES_MODEL_MAX_TOKENS;
    delete process.env.SUMMARIES_RESPONSE_TOKENS;
    delete process.env.SUMMARIES_CHARS_PER_TOKEN;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    (globalThis as any).fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('trims joined prompt to budgetCharLimit (approx tokens->chars) and records trimmed chars_count in audit', async () => {
    const kickoffISO = '2025-10-19T11:30:00.000Z';
    const nowMs = Date.parse('2025-10-19T12:00:00.000Z');
    vi.setSystemTime(nowMs);

    const params = new URLSearchParams({
      matchId: 'TEST-BUDGET',
      kickoff: kickoffISO,
      mode: 'live',
      platform: 'bsky'
    });
    const url = new URL(`http://localhost/api/summaries/latest?${params.toString()}`);
    const req = new Request(url);

    const res = await GET({ url, request: req } as any);
    expect(res.status).toBe(200);

    // Capture audit insert call
    const calls = ((globalThis as any).fetch as any).mock.calls.filter((c: any[]) =>
      String(c[0]).includes('/rest/v1/summary_requests')
    );
    expect(calls.length).toBeGreaterThan(0);
    const body = JSON.parse(calls[calls.length - 1][1].body);
    // Budget per config above: availableTokens = 1000 - 600 = 400 chars
    // Audit should reflect joined length after trimming, so ensure <= 400
    expect(body.chars_count).toBeLessThanOrEqual(400);
    // Posts_count should also be bounded by SUMMARIES_MAX_POSTS default (150)
    expect(body.posts_count).toBeLessThanOrEqual(150);
  });
});

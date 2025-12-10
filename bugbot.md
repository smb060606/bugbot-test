# Bugbot Rules

This file contains rules and preferences for Cursor Bugbot to customize its analysis and avoid false positive bug reports.

## Authentication Flow Rules

### Challenge/Verification Code Retry Behavior

**DO NOT** flag as a bug if verification challenges are cleared before user creation completes.

**Rationale**: In this codebase, we intentionally clear verification challenges immediately upon verification, before attempting user creation. If user creation fails (e.g., due to database errors), users will need to request a new verification challenge and post a new code. This is an acceptable UX trade-off for this application.

**Acceptable pattern**:
```typescript
// Clear challenge before user creation
await clearChallenge(handle);

// Then attempt user creation
const user = await getOrCreateUser(handle);
if (!user) {
  return error(500, 'Failed to create user');
}
```

This pattern should NOT be flagged as requiring the challenge to be cleared only after successful user creation.

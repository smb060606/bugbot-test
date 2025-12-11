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

## File Exclusions

### Database Migration Files

**DO NOT** analyze or report bugs in database migration files.

**Paths to exclude**:
- `supabase/migrations/**/*.sql`
- Any file matching the pattern `**/migrations/**/*.sql`

**Rationale**: Database migration files are intentionally written in a specific format and are version-controlled as historical records. They should not be modified after being applied to production databases. Any issues with migrations should be addressed through new migration files, not by flagging the existing ones.

## Code Style Enforcement

### JavaScript Style Guide Compliance

**DO** check for code style compliance with standard JavaScript style guidelines for `.js` files in the `src/` folder.

**Scope**:
- All `.js` files within `src/**/*.js`

**Style guidelines to enforce**:
- Consistent indentation (2 or 4 spaces, not tabs)
- Semicolon usage (either always or never, consistently)
- Quote style (single or double quotes, used consistently)
- Proper function declaration formatting
- Consistent spacing around operators and keywords
- Proper use of ES6+ features where appropriate
- Consistent naming conventions (camelCase for variables/functions, PascalCase for classes)

**Rationale**: Maintaining consistent code style in JavaScript files improves readability, reduces cognitive load during code reviews, and helps prevent subtle bugs. The `src/` folder contains the core application logic and should adhere to professional coding standards.

## UX and Accessibility Recommendations

### Assistive Technology and Accessibility Improvements

**DO NOT** recommend changes to improve UX for users relying on assistive technologies in this repository.

**Examples of recommendations to avoid**:
- Adding ARIA attributes (role, aria-live, aria-label, etc.)
- Adding screen reader-only text (sr-only classes)
- Keyboard navigation improvements
- Focus management suggestions
- Color contrast or visual accessibility enhancements
- Alternative text for images when not already present

**Rationale**: Accessibility improvements are not a priority for this codebase at this time. While important in general, the team has decided to defer these types of UX enhancements to focus on other development priorities.

# Repository Instructions

## Current Delivery Scope
- Work on the web app only until the user explicitly says otherwise.
- Windows, Linux, and other native desktop apps are paused. Do not develop, build, test, package, release, or deploy them.
- Preserve the existing desktop source for a future restart; do not remove it as part of web work.
- Keep automatic CI and deployment focused on the web app and its required backend services. Do not re-enable desktop workflows without explicit user authorization.

## Working Principles
- Explore only files relevant to the current task.
- Search for symbols and paths before opening files.
- Do not read the entire repository by default.
- Preserve existing architecture and conventions.
- Prefer minimal, targeted changes.

## Context Management
- Avoid repeated reads of unchanged files.
- Do not dump entire files when small sections suffice.
- Do not inspect generated output or dependencies
  unless they are directly relevant.
- Read additional documentation only when necessary.

## Implementation
- Reuse existing components and utilities.
- Avoid unnecessary refactoring.
- Preserve behavior outside the requested scope.
- Complete the requested change before expanding scope.

## Verification
- Run focused tests and checks first.
- Expand validation when the changes justify it.
- Report only relevant errors and warnings.

## Responses
- Keep progress updates concise.
- Summarize changed files and verification results.
- Avoid repeating previously established context.

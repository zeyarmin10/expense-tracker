# Space Full Migration Plan

## Purpose

This document describes when the app is ready to move from the current compatibility-first space model to a fully migrated space-first data model.

Today the app uses:

- `users/{uid}/...` for personal transactional data
- `group_data/{groupId}/...` for group transactional data
- `spaces/{spaceId}` and `space_members/{spaceId}` for space metadata, membership, and switching

This is intentional. It keeps old accounts working while the new personal-plus-group space flow is being stabilized.

## What "Full Migration" Means

Full migration means transactional data also becomes space-native instead of only metadata becoming space-native.

Target direction:

- `space_data/{spaceId}/expenses/{expenseId}`
- `space_data/{spaceId}/incomes/{incomeId}`
- `space_data/{spaceId}/budgets/{budgetId}`
- `space_data/{spaceId}/categories/{categoryId}`

In that model:

- personal data lives under the user's personal space id
- group data lives under the matching group space id
- services read from one canonical path shape
- legacy paths stay read-only for rollback or temporary fallback until cleanup is complete

## Current State

Already done:

- personal space auto-creation
- current space switching
- old-user metadata migration
- `spaces` and `space_members` support in app logic
- fallback support for old personal and group data paths

Not done yet:

- transactional data copy into a canonical `space_data` path
- unified service reads from only one final storage shape
- retirement of old fallback paths

## Readiness Checklist

Do not run full migration until all of the following are true.

### 1. Rules readiness

- Realtime Database rules support both legacy paths and new space paths
- No recurring `permission_denied` warnings for `spaces` or `space_members`
- Create group, join group, switch space, and login all work for old and new users

### 2. Metadata readiness

- Existing users consistently get `personalSpaceId`
- Existing users consistently get `currentSpaceId`
- Existing users consistently get `spaceMemberships`
- Duplicate personal-space entries no longer appear
- Active space is visible in the UI and switching works reliably

### 3. Feature readiness

- Expense flows resolve correctly by current space
- Budget flows resolve correctly by current space
- Income flows resolve correctly by current space
- Category flows resolve correctly by current space
- Group-only screens still hide correctly for personal spaces

### 4. Operational readiness

- A database backup/export process is documented and tested
- A rollback procedure is written and rehearsed
- A way to track migration progress is available
- A way to detect partial failures is available

### 5. Observation window

Wait for a stable observation period after the rules update and metadata migration.

Recommended minimum:

- 3 to 7 days of normal usage without critical space-switching bugs

Recommended stronger threshold:

- 1 to 2 weeks if there are many existing users or many shared groups

## Why We Are Not Full-Migrating Transaction Data Yet

This is not because it is impossible. It is because full migration carries real data risk.

Main risks:

- duplicate records if copy jobs run more than once
- partial migration if network or app execution stops mid-run
- incorrect reads if some services use old paths and others use new paths
- inconsistent reports during the migration window
- difficult rollback if old and new data diverge

The current phased approach lowers those risks by separating:

- metadata migration first
- transactional migration later

## Recommended Rollout Strategy

### Phase 1. Stabilize the compatibility layer

Goal:

- old users keep working
- new space UX is usable
- rules are updated

Exit criteria:

- no blocking space-related production issues

### Phase 2. Introduce canonical `space_data`

Goal:

- add new storage path without removing legacy reads

Work:

- create `space_data/{spaceId}` schema
- update services to support read preference order:
  1. `space_data/{spaceId}`
  2. legacy personal/group paths as fallback
- add write-path abstraction so new writes can later be redirected safely

Exit criteria:

- app can read both canonical and legacy data
- new path is tested end-to-end

### Phase 3. Backfill transactional data

Goal:

- copy historical data into `space_data`

Work:

- generate migration batches per user and per group
- use idempotent copy logic
- mark migration status per space
- compare source and target counts after each batch

Recommended migration status markers:

- `migrationStatus: "pending" | "copying" | "copied" | "verified" | "failed"`
- `lastMigratedAt`
- `lastMigrationError`

Exit criteria:

- all targeted spaces reach `verified`

### Phase 4. Switch reads to canonical-first

Goal:

- use `space_data` as the default source

Work:

- switch all service reads to `space_data` first
- keep legacy fallback only for spaces not yet verified
- verify reports and dashboards against expected totals

Exit criteria:

- no unexplained differences between old and new totals

### Phase 5. Switch writes to canonical-only

Goal:

- stop creating new legacy transactional records

Work:

- route new personal and group writes only to `space_data`
- keep legacy data read-only

Exit criteria:

- all new activity is stored only in canonical paths

### Phase 6. Cleanup legacy paths

Goal:

- retire the old storage model safely

Work:

- remove fallback reads
- simplify services
- archive or delete legacy data only after backup and sign-off

Exit criteria:

- no code depends on `users/{uid}/expenses...` or `group_data/{groupId}/...`

## Canonical Data Mapping

### Personal space

Source:

- `users/{uid}/expenses`
- `users/{uid}/incomes`
- `users/{uid}/budgets`
- `users/{uid}/categories`

Target:

- `space_data/{personalSpaceId}/expenses`
- `space_data/{personalSpaceId}/incomes`
- `space_data/{personalSpaceId}/budgets`
- `space_data/{personalSpaceId}/categories`

### Group space

Source:

- `group_data/{groupId}/expenses`
- `group_data/{groupId}/incomes`
- `group_data/{groupId}/budgets`
- `groups/{groupId}/categories` or the current group category source used by the app

Target:

- `space_data/{groupId}/expenses`
- `space_data/{groupId}/incomes`
- `space_data/{groupId}/budgets`
- `space_data/{groupId}/categories`

Note:

- group space ids should continue matching existing group ids where possible to reduce mapping complexity

## Idempotent Migration Rules

Any migration script must be safe to rerun.

Requirements:

- never generate a second copy for the same logical record
- preserve original record ids where possible
- preserve timestamps and edit history
- log which source path and target path were processed
- skip already verified records or spaces

Recommended safeguards:

- use source ids as target ids
- write a per-space migration marker before and after each batch
- verify record counts after copy
- verify sample record hashes or totals for a subset of records

## Rollback Plan

Before migration:

- export the full database
- document export time and commit hash of deployed app code

If migration fails:

- stop write redirection immediately
- keep reads on legacy paths
- inspect failed spaces using migration markers
- restore from backup only if data divergence cannot be safely repaired

Important:

- do not delete legacy transactional data during the initial migration rollout

## Recommended Success Metrics

- login success rate unchanged
- create-group success rate unchanged
- join-group success rate unchanged
- no rise in missing-record support reports
- dashboard totals match expected pre-migration totals
- no unresolved `permission_denied` errors for normal flows

## Suggested Timeline

### Safe minimum

- Day 0: update rules
- Day 1 to Day 7: monitor real usage and fix space bugs
- Week 2: implement canonical `space_data` support and internal verification tools
- Week 3: dry-run migration on test or copied data
- Week 4: production backfill in batches

### Faster path

Possible only if:

- user count is low
- data volume is small
- team can monitor closely

Then:

- 3 to 7 days of stabilization
- 1 week of migration implementation and dry run
- batched production rollout after verification

## Recommendation For This Project

For this repository, full migration should start only after:

- rules are updated
- old and new accounts both pass login and space switching checks
- no critical issues appear during at least several days of normal use

Practical recommendation:

- treat the current release as the stabilization phase
- start full migration implementation after the app has a clean 3 to 7 day observation window
- use a batched, idempotent migration script rather than a one-shot in-app migration

## Next Implementation Doc

When the team is ready, create a second document for:

- exact `space_data` schema
- migration script input/output contract
- verification queries
- rollback command checklist
- final cleanup checklist

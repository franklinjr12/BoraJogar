# AGENTS.md

# Bora Jogar

## Purpose

This file defines the engineering rules that AI coding agents and human contributors must follow when modifying this repository.

The project is a mobile-first Progressive Web App for organizing beach volleyball games by matching players according to:

* Availability
* Preferred locations
* Skill level
* Playing preferences
* Existing game commitments
* Blocking and safety rules

The initial product targets one city and one sport. It is implemented as a modular monolith using:

* React
* TypeScript
* Vite
* Go
* PostgreSQL
* PostGIS
* `sqlc`
* River background jobs
* OpenAPI
* Docker Compose

The repository prioritizes correctness, maintainability, explicit contracts, strong typing, reliable migrations, and comprehensive automated tests.

---

# 1. Core engineering principles

Every change must follow these principles.

## 1.1 Correctness over speed

Do not implement a shortcut that weakens:

* Data consistency
* Authorization
* Type safety
* Test coverage
* Migration safety
* API contract accuracy
* Background-job idempotency

A smaller correct implementation is preferred over a broad incomplete one.

## 1.2 Tests are part of the implementation

A feature is not complete when only the production code works.

Every meaningful change must include tests appropriate to its risk.

Tests must cover:

* Expected behavior
* Invalid input
* Authorization failures
* Important edge cases
* Concurrency when relevant
* Database constraints
* Retry and idempotency behavior for jobs
* API contract behavior

Do not remove or weaken tests merely to make CI pass.

## 1.3 API contracts are authoritative

The OpenAPI specification is the source of truth for communication between the frontend and backend.

API changes must not be implemented independently on only one side.

When an API changes:

1. Update the OpenAPI specification.
2. Update request and response schemas.
3. Regenerate typed clients and models.
4. Update backend handlers.
5. Update frontend usage.
6. Update contract and integration tests.
7. Verify generated files are current.

Do not duplicate API request or response types manually in the frontend when they can be generated from OpenAPI.

## 1.4 Strong typing is required

Avoid untyped data flows.

Frontend code must use strict TypeScript.

Backend code must use explicit Go types.

Database queries must use typed `sqlc` output where practical.

Avoid:

* TypeScript `any`
* Unchecked type assertions
* Generic `map[string]interface{}`
* Raw JSON blobs for stable domain models
* Stringly typed enums
* Silent null handling
* Untyped API response parsing

Use `unknown` when data is not yet trusted, then validate and narrow it.

## 1.5 Modules must have a single responsibility

Each module should represent one domain responsibility.

Examples:

* Authentication
* Profiles
* Availability
* Locations
* Matchmaking
* Proposals
* Games
* Notifications
* Moderation
* Administration

Do not create large generic modules such as:

* `helpers`
* `common`
* `misc`
* `utils`
* `services`

Small shared utilities are acceptable, but domain behavior must remain inside the domain that owns it.

## 1.6 Database changes must be controlled

All schema changes must use versioned migrations.

Never modify the production schema manually.

Never assume the current database is empty.

Every migration must account for:

* Existing rows
* Deployment order
* Backward compatibility where possible
* Index creation
* Constraint validation
* Rollback strategy
* Lock duration
* Data migration cost

Destructive migrations require explicit justification and careful staging.

## 1.7 The modular monolith must remain modular

The application is intentionally not split into microservices.

Preserve clear internal boundaries without adding network boundaries.

Modules should communicate through:

* Explicit interfaces
* Domain services
* Typed commands or parameters
* Repository abstractions where useful
* Database transactions owned by the operation being performed

Avoid hidden coupling through global variables or direct access to another module’s internal implementation.

---

# 2. Repository structure

The expected repository structure is approximately:

```text
/
├── AGENTS.md
├── BACKLOG.md
├── README.md
├── Makefile
├── .env.example
├── docker-compose.yml
├── web/
│   ├── src/
│   │   ├── app/
│   │   ├── api/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   ├── onboarding/
│   │   │   ├── profile/
│   │   │   ├── locations/
│   │   │   ├── availability/
│   │   │   ├── games/
│   │   │   ├── proposals/
│   │   │   ├── notifications/
│   │   │   └── admin/
│   │   ├── platform/
│   │   ├── service-worker/
│   │   └── test/
│   └── package.json
├── api/
│   ├── cmd/
│   │   ├── server/
│   │   └── worker/
│   ├── internal/
│   │   ├── auth/
│   │   ├── profile/
│   │   ├── location/
│   │   ├── availability/
│   │   ├── game/
│   │   ├── proposal/
│   │   ├── matchmaking/
│   │   ├── notification/
│   │   ├── moderation/
│   │   ├── admin/
│   │   └── platform/
│   ├── migrations/
│   ├── queries/
│   ├── generated/
│   └── openapi/
└── deploy/
```

Respect the existing repository structure. Do not reorganize unrelated modules while implementing a focused feature.

---

# 3. Before making changes

Before editing code:

1. Read `AGENTS.md`.
2. Read the relevant sections of `BACKLOG.md`.
3. Inspect nearby code and tests.
4. Identify the owning domain module.
5. Identify whether the change affects:

   * OpenAPI
   * Generated frontend types
   * SQL queries
   * Database migrations
   * Background jobs
   * Authorization
   * Notifications
   * PWA behavior
6. Run the relevant existing tests before changing behavior.
7. Prefer the smallest coherent implementation that satisfies the requirement.

Do not begin by creating new abstractions before understanding existing ones.

---

# 4. Change scope

Keep changes focused.

A pull request or agent task should ideally address one coherent capability.

Good examples:

* Add proposal-decline support
* Add a venue-distance query
* Add a waitlist promotion transaction
* Add notification preference validation
* Add an availability exception endpoint

Avoid combining unrelated work such as:

* Refactoring authentication
* Redesigning the game screen
* Renaming database tables
* Replacing the map library
* Changing CI

unless the task explicitly requires all of them.

Do not perform opportunistic large-scale refactors.

When a necessary refactor is discovered:

1. Keep it narrowly scoped.
2. Preserve behavior with tests.
3. Explain why it is required.
4. Avoid changing public contracts unless necessary.

---

# 5. Frontend rules

## 5.1 TypeScript

TypeScript must run in strict mode.

Do not introduce `any`.

Prefer:

```ts
function parseResponse(input: unknown): ApiResponse
```

over:

```ts
function parseResponse(input: any): any
```

Use explicit domain types for:

* Skill levels
* Game states
* Proposal states
* Notification types
* Availability rules
* Venue access types
* Attendance statuses

Prefer generated OpenAPI types for API payloads.

## 5.2 Runtime validation

Compile-time types do not validate external data.

Validate:

* Form input
* URL parameters
* Local storage content
* Browser API responses
* Push payloads
* Data not produced by the typed API client

Use Zod for frontend validation where appropriate.

Do not trust persisted browser data merely because it was previously written by the application.

## 5.3 Feature-based organization

Place domain-specific code inside its feature.

Example:

```text
features/games/
├── api/
├── components/
├── hooks/
├── pages/
├── schemas/
├── types/
└── tests/
```

Shared UI components belong in `components/` only when they are genuinely reusable across multiple features.

A component used by only one feature should remain inside that feature.

## 5.4 Components

Components should have one clear responsibility.

Avoid components that simultaneously:

* Fetch data
* Perform complex transformations
* Control several dialogs
* Render unrelated sections
* Contain business rules
* Directly call multiple backend endpoints

Prefer splitting responsibilities into:

* Page-level orchestration
* Feature hooks
* Presentational components
* Form schemas
* API functions
* Pure domain helpers

## 5.5 Server state

Use TanStack Query for server state.

Do not duplicate server state into a global client store unless there is a strong reason.

Use query invalidation deliberately.

After mutations, invalidate or update only the affected queries.

Avoid clearing the entire query cache.

## 5.6 Forms

Use React Hook Form and Zod for non-trivial forms.

Validation rules must align with backend validation.

Frontend validation improves user experience but never replaces backend validation.

Display:

* Field-level errors
* Form-level errors
* API conflict errors
* Loading state
* Disabled state while submitting
* Retry options where appropriate

## 5.7 API access

All API calls must go through the shared typed API layer.

Do not call `fetch` directly from arbitrary components.

The API layer should handle:

* Base URL
* Credentials
* JSON parsing
* Standard error format
* Request IDs
* Unauthorized responses
* Typed request and response models

## 5.8 Routing

Routes must preserve deep-link behavior.

Game and proposal routes must work after:

* Browser refresh
* Authentication redirect
* PWA launch
* Notification click

Do not rely only on in-memory navigation state.

## 5.9 Accessibility

New interfaces must include:

* Semantic form labels
* Keyboard navigation
* Visible focus states
* Accessible error messages
* Adequate touch targets
* Map alternatives
* Loading and empty states

Do not use color as the only indicator of status.

## 5.10 PWA behavior

Critical state-changing actions must not be silently queued offline.

Examples:

* Accepting a proposal
* Joining a game
* Leaving a game
* Cancelling a game

When offline:

* Show the user that current server data may be stale.
* Disable actions requiring immediate confirmation.
* Allow explicit retry after reconnection.

---

# 6. Backend rules

## 6.1 Domain ownership

Business rules belong in the owning domain module.

Examples:

* Availability overlap belongs in `availability`.
* Proposal state transitions belong in `proposal`.
* Joining capacity rules belong in `game`.
* Candidate scoring belongs in `matchmaking`.
* Delivery retries belong in `notification`.

HTTP handlers must not contain substantial domain logic.

Handlers should primarily:

1. Parse and validate input.
2. Resolve the authenticated user.
3. Call a domain operation.
4. Map domain errors to API responses.
5. Return the response.

## 6.2 Explicit dependencies

Construct dependencies explicitly.

Prefer:

```go
type Service struct {
    games         GameRepository
    notifications NotificationPublisher
    clock         Clock
}
```

Avoid package-level mutable globals.

Do not access environment variables from arbitrary domain code.

Configuration must be loaded once and passed to the components that need it.

## 6.3 Context

Pass `context.Context` as the first argument for operations that may:

* Access the database
* Perform network I/O
* Run in a job
* Depend on request cancellation

Do not store `context.Context` in structs.

## 6.4 Errors

Use explicit domain errors.

Examples:

* `ErrGameFull`
* `ErrProposalExpired`
* `ErrForbidden`
* `ErrConflictingGame`
* `ErrVenueInactive`
* `ErrDuplicateAvailability`

Do not inspect error message strings to determine behavior.

Use `errors.Is` and `errors.As`.

Map domain errors consistently to HTTP status codes.

## 6.5 Time

Do not call `time.Now()` throughout domain code.

Use an injectable clock where time affects behavior.

Examples:

* Proposal expiration
* Minimum notice
* Late cancellation
* Reminder scheduling
* Session expiration

Store timestamps in UTC.

Use user time zones only when converting recurring local schedules or displaying values.

## 6.6 Identifiers

Use UUIDs for public domain identifiers unless an existing module explicitly uses another strategy.

Do not expose sequential internal identifiers where they may reveal resource counts or make URLs guessable.

Share tokens and invitation codes must be cryptographically random.

Store sensitive tokens as hashes when the original token does not need to be recovered.

## 6.7 Authorization

Authorization must be enforced in backend domain operations or service boundaries.

Frontend visibility is not authorization.

Every resource operation must verify:

* Authentication
* Ownership
* Participation
* Admin privileges
* Visibility rules
* Blocking restrictions where relevant

Tests must cover unauthorized and forbidden cases.

---

# 7. API contract rules

## 7.1 OpenAPI-first changes

For new endpoints or contract changes, update OpenAPI before or alongside implementation.

The contract must specify:

* Path
* HTTP method
* Authentication
* Request body
* Query parameters
* Path parameters
* Response body
* Error responses
* Validation rules
* Enum values
* Nullability
* Date and time formats

## 7.2 Stable error format

All API errors must follow the standard shape:

```json
{
  "error": {
    "code": "proposal_expired",
    "message": "This proposal has expired.",
    "fields": {}
  },
  "requestId": "..."
}
```

Rules:

* `code` is stable and machine-readable.
* `message` is understandable to a user.
* `fields` contains field-specific validation details when relevant.
* `requestId` allows support and log correlation.

Do not expose:

* SQL errors
* Stack traces
* Internal file paths
* Secret values
* Database schema details

## 7.3 HTTP status conventions

Use statuses consistently.

Typical mapping:

* `200 OK`: successful read or update
* `201 Created`: successful resource creation
* `204 No Content`: successful operation without a response body
* `400 Bad Request`: malformed request
* `401 Unauthorized`: authentication required
* `403 Forbidden`: authenticated but not allowed
* `404 Not Found`: resource unavailable or intentionally hidden
* `409 Conflict`: state conflict
* `422 Unprocessable Entity`: validation failure
* `429 Too Many Requests`: rate limit
* `500 Internal Server Error`: unexpected failure

Use `409 Conflict` for domain-state conflicts such as:

* Game already full
* Proposal already resolved
* Proposal expired
* Conflicting confirmed game
* Duplicate active availability rule

## 7.4 API compatibility

Avoid breaking existing clients without an explicit migration plan.

Breaking changes include:

* Renaming fields
* Changing field types
* Removing enum values
* Making optional fields required
* Changing status semantics
* Changing endpoint paths

Prefer additive changes.

If a breaking change is necessary:

1. Document it.
2. Update all clients in the same change.
3. Update contract tests.
4. Consider a new API version.

## 7.5 Generated code

Generated code must not be edited manually.

This includes:

* OpenAPI-generated TypeScript types
* OpenAPI-generated clients
* `sqlc` output
* Generated mocks, when used

Change the source definition and regenerate.

CI must verify generated code is current.

---

# 8. Database rules

## 8.1 Migrations are mandatory

Every database schema change requires a migration.

Migrations must be:

* Versioned
* Committed
* Deterministic
* Reviewable
* Safe to apply exactly once
* Tested against a database with existing data

Do not change an old migration after it has been used in a shared or production environment.

Create a new migration instead.

## 8.2 Migration naming

Use descriptive names.

Examples:

```text
20260730120000_create_match_proposals.sql
20260730121500_add_game_visibility.sql
20260730123000_index_availability_occurrences.sql
```

Avoid vague names such as:

```text
update.sql
fix.sql
changes.sql
```

## 8.3 Forward and rollback strategy

Every migration must have a documented rollback strategy.

A down migration is preferred when safe.

For irreversible data migrations, explain:

* Why reversal is unsafe
* How recovery would occur
* What backup is required
* Whether the change must be staged

## 8.4 Safe schema evolution

For risky changes, use expand-and-contract migrations.

Example for renaming a populated column:

1. Add the new column.
2. Write both old and new columns.
3. Backfill existing rows.
4. Read from the new column.
5. Stop writing the old column.
6. Remove the old column in a later deployment.

Avoid long table locks.

Create large indexes concurrently when supported and operationally appropriate.

## 8.5 Constraints

Use database constraints to protect invariants where practical.

Examples:

* Unique active invitation usage constraints
* Valid skill level ranges
* End time after start time
* Positive game capacity
* Unique participant per proposal
* Unique user per game
* Unique block relationship
* Geographic SRID consistency

Application validation does not replace database constraints.

## 8.6 Transactions

Use transactions for operations that change multiple related records.

Examples:

* Joining a game
* Promoting a waitlisted player
* Accepting the final proposal response
* Creating a game from a proposal
* Creating a notification and scheduling delivery
* Cancelling a game and cancelling reminders

The transaction boundary should match the domain operation.

Do not keep transactions open while:

* Sending email
* Calling push endpoints
* Making external HTTP calls
* Performing slow unrelated calculations

## 8.7 Concurrency

Concurrency-sensitive operations must use database-level protection.

Possible strategies:

* Row locks
* Unique constraints
* Advisory locks
* Serializable transactions
* Atomic conditional updates

Do not rely on a prior read followed by an unprotected write.

Required concurrency test areas include:

* Final game slot
* Final proposal acceptance
* Duplicate matching run
* Waitlist promotion
* Duplicate notification scheduling

## 8.8 SQL and `sqlc`

Prefer explicit SQL with generated typed access through `sqlc`.

Queries should:

* Select only needed columns
* Use stable ordering
* Avoid N+1 patterns
* Use appropriate indexes
* Clearly express locking behavior
* Include comments when the query is non-obvious

Avoid dynamically concatenated SQL.

Use parameters for all user-controlled values.

## 8.9 PostGIS

Geographic data must use consistent SRID 4326.

Use geography types for meter-based distance queries where appropriate.

Spatial queries must be tested against real PostGIS.

Ensure spatial indexes are used for:

* Venue lookups
* Preferred-area matching
* Distance ordering

Do not calculate important geographic distances only in application memory when PostgreSQL/PostGIS can perform the query accurately.

---

# 9. Background job rules

## 9.1 Jobs must be idempotent

Every job must be safe to retry.

A retry must not:

* Create duplicate games
* Send duplicate notifications
* Promote multiple waitlisted players
* Regenerate duplicate availability occurrences
* Confirm the same proposal twice

Use:

* Unique keys
* Database constraints
* State checks
* Idempotency tokens
* Transactional job insertion

## 9.2 Transactional scheduling

When a domain change requires a job, schedule the job in the same database transaction when supported.

Example:

* Create notification event.
* Insert notification delivery job.
* Commit both together.

Do not allow a domain operation to commit while losing the required job due to a process crash.

## 9.3 Retry behavior

Distinguish:

* Temporary errors
* Permanent errors
* Invalid data
* Already completed work

Temporary failures may retry with backoff.

Permanent failures should be recorded and stopped.

Examples of permanent failures:

* Invalid push subscription
* Deleted user
* Cancelled game
* Resolved proposal
* Invalid recipient address

## 9.4 Job observability

Every job log should include:

* Job ID
* Job kind
* Attempt number
* Relevant domain resource ID
* Duration
* Final status
* Error classification

Do not log secrets or full push subscription values.

## 9.5 Scheduled jobs

Recurring jobs must use locking or deduplication.

Examples:

* Matchmaking runs
* Proposal expiration
* Availability expansion
* Finished game completion
* Session cleanup

Two workers must not perform the same global recurring operation simultaneously unless the operation is explicitly partitioned.

---

# 10. Testing requirements

## 10.1 General expectations

Every behavior change must include tests.

Do not claim a feature is complete without tests unless the change is exclusively documentation or trivial static content.

Tests should be deterministic.

Do not use arbitrary sleeps to wait for asynchronous behavior.

Use controllable clocks and explicit synchronization.

Every new feature or significant commit added MUST have test coverage, either adding new tests or updating existing ones.

## 10.2 Test pyramid

Use the appropriate test level.

### Unit tests

Use for:

* Pure domain rules
* Validation
* Scoring
* Time calculations
* State transitions
* Formatting
* Small React components
* Hooks with isolated behavior

### Database integration tests

Use for:

* SQL queries
* Transactions
* Constraints
* Locking
* PostGIS behavior
* Migration behavior
* Concurrent operations

### API tests

Use for:

* Request validation
* Authentication
* Authorization
* Status codes
* Error formats
* Response contracts

### End-to-end tests

Use for critical user journeys across frontend and backend.

## 10.3 Backend test coverage

Backend tests must cover, where relevant:

* Happy path
* Validation failure
* Unauthenticated access
* Forbidden access
* Missing resource
* State conflict
* Transaction rollback
* Concurrency
* Idempotency
* Time-boundary behavior

High-risk modules requiring especially strong coverage:

* Authentication
* Availability expansion
* Matchmaking
* Proposals
* Game joining
* Waitlists
* Notifications
* Moderation
* Database migrations

## 10.4 Frontend test coverage

Frontend tests must cover:

* Form validation
* API success
* API errors
* Loading state
* Empty state
* Permission state
* Mobile interaction
* Proposal expiration
* Game capacity
* Offline behavior
* Notification permission behavior

Avoid snapshots as the primary test for behavior.

Prefer assertions on visible behavior and user interaction.

## 10.5 End-to-end coverage

Maintain Playwright scenarios for:

* Invited user login
* Onboarding completion
* Preferred-area creation
* Availability creation
* Manual game creation
* Shared-link join flow
* Full game waitlist
* Waitlist promotion
* Match proposal acceptance
* Proposal expiration
* Game cancellation
* Notification navigation
* Blocking behavior
* Admin authorization

When fixing a user-visible regression, add an end-to-end or integration test that would have detected it when practical.

## 10.6 Coverage expectations

Do not optimize only for a numeric coverage target.

Coverage must reflect meaningful behavior.

As a baseline:

* New domain logic should have direct unit tests.
* New SQL should have database integration tests.
* New API endpoints should have handler or API tests.
* Critical user flows should have Playwright coverage.
* Bug fixes should include regression tests.

A high line-coverage percentage does not compensate for missing state, concurrency, or authorization tests.

## 10.7 Test data

Use explicit factories or builders.

Test data should make relevant differences visible.

Avoid giant fixtures containing unrelated fields.

Tests must not depend on execution order.

Each test must create and clean up its own state or run inside isolated transactions.

---

# 11. Matchmaking-specific rules

The matchmaking engine must remain deterministic and explainable.

## 11.1 Hard filters

Hard filters should be applied before scoring.

Examples:

* Compatible availability
* Compatible location
* Compatible skill range
* No conflicting game
* No blocking relationship
* Matchmaking enabled
* Proposal frequency limits
* Minimum notice

Do not encode hard eligibility rules only as score penalties.

## 11.2 Scoring

Scoring functions should be pure where practical.

Input and output types must be explicit.

The score should expose individual components.

Example:

```go
type MatchScore struct {
    Total               float64
    TimeOverlap         float64
    VenuePreference     float64
    Distance            float64
    SkillCompatibility  float64
    StyleCompatibility  float64
    Reliability         float64
    RecentPairingPenalty float64
}
```

Do not hide scoring inputs inside global configuration.

Pass configuration explicitly.

## 11.3 Determinism

When scores are equal, use stable deterministic tie-breakers.

Examples:

* Venue ID
* User ID
* Start time
* Creation time

Do not depend on map iteration order.

## 11.4 Explainability

Store enough score information for administrators to understand why a proposal was produced.

Do not expose sensitive internal scoring details publicly.

User-facing explanations should remain simple and respectful.

## 11.5 New users

New users must not be disadvantaged by missing history.

Reliability scoring must remain neutral until enough data exists.

---

# 12. Security and privacy rules

## 12.1 Sensitive data

Never log or expose:

* Session tokens
* OAuth tokens
* Invitation tokens
* Share tokens
* VAPID private keys
* Push authentication secrets
* Raw preferred-area coordinates in public responses
* Email addresses of other players
* Full IP addresses unless operationally required

## 12.2 Location privacy

Preferred areas are private.

Other players may see:

* Selected game venue
* Public venue information
* Approximate context required for the game

Other players must not receive:

* Preferred-area center
* Search radius
* Home-related labels
* Historical location preference data

## 12.3 Authentication

Use secure HTTP-only cookies.

Do not place authentication tokens in:

* Local storage
* Session storage
* URL query parameters
* Frontend logs

Validate OAuth state and redirect destinations.

## 12.4 Input validation

Validate all input server-side.

Apply:

* Length limits
* Enum validation
* Date validation
* Coordinate bounds
* Radius bounds
* Capacity bounds
* Text sanitization
* Request body size limits

## 12.5 Authorization tests

Every new protected endpoint requires tests for:

* Unauthenticated access
* Authenticated unauthorized access
* Authorized access

Do not assume shared route middleware is sufficient without endpoint-level verification.

---

# 13. Logging and observability

Use structured logging.

Include relevant identifiers:

* Request ID
* User ID
* Game ID
* Proposal ID
* Venue ID
* Job ID
* Matchmaking run ID

Logs must explain failures without exposing secrets.

Unexpected errors should preserve the original error internally while returning a safe response externally.

Avoid noisy logs inside tight loops unless using debug level.

Do not log every candidate score in production by default. Store summarized diagnostic data or enable detailed logs explicitly.

---

# 14. Documentation requirements

Update documentation when a change affects:

* Setup
* Environment variables
* API behavior
* Database schema
* Background jobs
* Deployment
* User-visible flows
* Operational procedures

New environment variables must be added to:

* `.env.example`
* Configuration validation
* Deployment configuration
* README or deployment documentation

New migrations must be described in the change summary.

New jobs must document:

* Trigger
* Inputs
* Retry behavior
* Idempotency strategy
* Failure handling

---

# 15. Common commands

Use repository commands when available.

Expected commands include:

```bash
make dev
make dev-web
make dev-api
make dev-worker
make test
make test-integration
make lint
make typecheck
make generate
make migrate
make migrate-down
make db-reset
make build
```

Before declaring work complete, run the relevant subset and preferably:

```bash
make lint
make typecheck
make test
make test-integration
make build
```

For frontend-only changes, also run the relevant Playwright tests when the user flow changes.

For schema changes, run migrations against:

1. A clean database.
2. A database representing the previous schema with existing rows.

---

# 16. Generated artifacts

Generated artifacts must remain reproducible.

Common generated artifacts include:

* `sqlc` Go code
* OpenAPI TypeScript types
* OpenAPI API clients
* Test mocks
* Embedded frontend assets during build

Do not manually patch generated output.

When generated files change unexpectedly:

1. Check the source schema or query.
2. Check tool versions.
3. Regenerate.
4. Review the resulting diff.
5. Commit source and generated changes together.

Pin generator versions where practical.

---

# 17. Dependency rules

Do not add a dependency when the standard library or an existing dependency is sufficient.

Before adding a dependency, consider:

* Maintenance activity
* Security history
* License
* Bundle size
* Transitive dependencies
* Long-term stability
* Whether the feature can be implemented simply in-house

Avoid replacing established project libraries without a clear requirement.

New dependencies must be limited to the module that needs them.

---

# 18. Refactoring rules

Refactoring must preserve behavior unless the task explicitly changes behavior.

Before refactoring:

* Identify existing tests.
* Add characterization tests when behavior is insufficiently covered.
* Keep the refactor separate from feature behavior where practical.

Do not combine:

* Large renames
* Directory moves
* API changes
* Database changes
* Behavioral changes

in one unstructured change.

Prefer small, reviewable steps.

---

# 19. Prohibited patterns

Do not introduce:

* Microservices
* Kubernetes
* Kafka
* RabbitMQ
* Redis without a demonstrated need
* GraphQL without a project decision
* Event sourcing
* Hidden global state
* Untyped frontend API responses
* Business logic inside React components
* Business logic inside HTTP handlers
* Raw production schema edits
* Mutable old migrations
* Unbounded background retries
* Arbitrary retry loops
* Silent error swallowing
* Duplicate domain models across frontend and backend
* Tests that depend on execution order
* Sleeps used as synchronization
* Public exposure of private location preferences
* Machine-learning matchmaking in the MVP

---

# 20. Definition of done

A change is complete only when all applicable items are satisfied.

## Implementation

* [ ] The requirement is fully implemented.
* [ ] The owning module has a clear single responsibility.
* [ ] No unrelated refactor was introduced.
* [ ] Errors are handled explicitly.
* [ ] Authorization is enforced.
* [ ] Logging is appropriate.
* [ ] User-visible loading, empty, success, and error states exist.

## Types and contracts

* [ ] TypeScript remains strict.
* [ ] No new `any` was introduced.
* [ ] Go types are explicit.
* [ ] OpenAPI is updated.
* [ ] Generated API types are updated.
* [ ] API errors follow the standard contract.
* [ ] Enum and nullability behavior are documented.

## Database

* [ ] Schema changes use a new migration.
* [ ] Existing migrations were not modified.
* [ ] Migration works against existing data.
* [ ] Constraints and indexes are appropriate.
* [ ] Rollback strategy is documented.
* [ ] `sqlc` output is regenerated.
* [ ] Transaction and concurrency behavior are tested.

## Tests

* [ ] Unit tests cover domain behavior.
* [ ] API tests cover validation and authorization.
* [ ] Database integration tests cover SQL and transactions.
* [ ] Background-job tests cover idempotency and retry behavior.
* [ ] Playwright tests cover changed critical user flows.
* [ ] Regression tests exist for bug fixes.
* [ ] Existing tests still pass.

## Documentation and operations

* [ ] Relevant documentation is updated.
* [ ] New environment variables are documented.
* [ ] New jobs are documented.
* [ ] Deployment implications are described.
* [ ] No secrets or private data were committed.
* [ ] Generated files are current.
* [ ] CI passes.
* [ ] Production build succeeds.

---

# 21. Agent response expectations

When completing a coding task, provide a concise summary containing:

1. What changed
2. Important design decisions
3. Tests added or updated
4. Migrations added
5. API contract changes
6. Commands run
7. Remaining limitations or risks

Be explicit when a command was not run or a behavior was not verified.

Do not claim that tests passed unless they were actually executed successfully.

Do not hide incomplete work behind optimistic language.

---

# 22. Priority order when rules conflict

When implementation choices conflict, use this priority:

1. Security and privacy
2. Data integrity
3. Correct domain behavior
4. API contract consistency
5. Migration safety
6. Testability
7. Type safety
8. Module boundaries
9. Operational simplicity
10. Developer convenience
11. Delivery speed

The goal is not merely to make the feature work once. The goal is to create a codebase that can safely organize real games, handle real users, and evolve without losing control of its data or contracts.

# 23. Must do after finishing changes

Validate you have added test coverage for any code modified. Code changes without tests wont be approved for commits.

## 23.1 Mandatory agent completion gate

Every coding task MUST end with this sequence before the agent reports completion:

1. Inspect `git diff --stat` and list every production file changed.
2. For each changed production package/module, add or update a test covering the changed behavior, including failure, authorization, and edge cases where applicable.
3. Run `make test-coverage` for backend changes. Run `npm --prefix web run test -- --run` for frontend changes.
4. Run `make agent-check` when practical. If any command cannot run, report the exact command and blocker.
5. Do not claim completion when changed backend code has no corresponding test file or when coverage was not checked.

Test coverage is a required deliverable, not a final optional cleanup step. Re-open changed code after tests pass and verify new branches are covered.

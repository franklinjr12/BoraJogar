---
name: implement-from-backlog
description: Load and implement exactly one milestone from a large docs/backlog.md file without reading the entire backlog into context. Use when the user asks Codex to implement, inspect, summarize, or work from a named backlog milestone such as "Milestone M0-E01 — Project Architecture"; extract only that milestone's section by finding its "## Milestone ..." header and stopping before the next "## Milestone ..." header.
---

# Implement From Backlog

Use this skill before reading backlog content for a named milestone. You should read only the section the user asked from the file `docs\backlog.md` and once you shall work on it. Finally after completing your work ensure you have added test coverage for the new code or updates you did.

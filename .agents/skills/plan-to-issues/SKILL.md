---
name: plan-to-issues
description: Split this repo's plan.md into GitHub issues with gh, one per unit of work, after a human has reviewed the split. Use when a plan is ready and has no issues yet.
---

# plan-to-issues

Turns `plan.md` into GitHub issues that workers can pick up cold. Easiest with `gh`, authenticated,
in a shell this agent can run.

## Steps

1. Read `plan.md`, `AGENTS.md` and `docs/adr/`.
2. Draft the split as a table: title · plan section · scope · done when · blocked by.
   One issue per unit of work.
3. **Stop and show the table to the human.** Publish nothing until they approve it.
4. Ask the human what every issue here must carry (fields, labels, wording), unless it is
   already written down in this session or in the repo (see "What every issue here carries").
5. Create each issue in dependency order, so blocked-by can cite real numbers:

   ```sh
   gh issue create --title "<title>" --body-file <tmp.md> --label "plan:<plan>"
   ```

6. Record every issue URL from gh's output (not from memory) and reply with the list.

Closing one, with the closing comment from AGENTS.md:

```sh
gh issue close <n> -c "<closing comment>"
```

## What every issue here carries

The human approved this shape on 2026-10-30 (plan morning-digest). Use it for every plan until
they change it here.

- Title: what the issue delivers, in a few words.
- Label: `plan:<plan>`, the `plan:` value from the plan's frontmatter.
- Body, in this order, the first line exactly so:

  ```
  Source: plan.md § <n>

  Scope: <the plan section's scope, in its words>

  Done when: <the section's Done when, word for word>
  Blocked by: <#n and what exactly, an outside event such as the reviewer's look, or —>
  Worker: <strongest model (logic) · cheaper model (views, tests) · main session (needs the human)>
  ```

An issue that waits on someone outside (a reviewer, a host, the human) names it under
`Blocked by` and stays open until they have acted, not until the work was sent (AGENTS.md rule 5).

## No `gh`

Steps 1–4 hold either way. GitHub reachable another way (a connector, the REST API, the web UI):
the same issues, made that way. GitHub issues out of reach altogether: write them as files in
`docs/issues/`, format in ADR 0004, then commit and push.

## Don'ts

- Don't paste the whole plan into one issue, and don't keep issues only in chat.
- Don't invent sections the plan doesn't have. If the plan is unclear, ask.

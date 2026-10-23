# BigTime Project Builder — Design Specification (DRAFT)

**Author:** Tim Purdie, PM Practice Lead
**Status:** Draft for internal review
**Date:** 21 October 2026

---

## 1. The problem this solves

Standing up a project in BigTime for forecasting is slow. A project manager who runs a full team has to create the project, add every iteration (task) one at a time, open the Rates/Staffing tab to register each person or role, then open the Allocation Wizard and hand-enter hours cell by cell, week by week, horizontally scrolling across the calendar for every resource. For a multi-person engagement across a multi-week span this is dozens of manual grid entries that must be repeated whenever the plan changes. Every PM at the firm faces the same scenario on every new engagement.

The builder collapses that into one guided request. The PM describes the project once ("create Tim-Test with these five iterations, these dates, these people at 40 hours a week from the start of sprinting"), reviews a complete preview, and approves a single commit. The builder then performs the create and the allocations through BigTime's API in the correct order, and sets the budget hours as part of the same operation.

It is one tool with two flows: **Create** (stand up a new project) and **Revise** (change an existing one — add a person, extend a sprint, re-amortize).

---

## 2. Safety and trust model (read first)

This is the part the firm will care about most, so it leads.

- **Nothing is written to BigTime until the PM approves a dry-run preview.** The builder assembles the full plan — project, iterations, resources, rates, and the complete week-by-week allocation grid — and presents it for review first. No project is created, no allocation is written, until the PM says go. One approval, then the commit runs.
- **The commit is an explicit, human-approved action.** The builder never submits a change to the live system on its own. This mirrors how the firm already works and keeps a person in the loop on every write to production.
- **Firm-sponsored, not personal.** Because every PM needs this, the builder is intended to run against a firm-issued API credential scoped and governed by the firm, with the human-approval gate on every commit. It is a firm tool, not a side channel.
- **Revise is non-destructive by default.** The Revise flow adds and amends. It does not delete iterations or resources that already carry logged time; BigTime itself blocks deletion of anything with transactions against it, and the builder respects that.

---

## 3. The canonical scenario (Tim-Test)

This is the worked example the whole design is validated against:

> Create a project titled **Tim-Test** with three billable iterations — **00 - Governance**, **01 - Sprinting**, **02 - Hypercare** — and two non-billable iterations — **03 - Travel**, **04 - Onboarding/Ramp up**. Ask for a date range for each iteration. Put them all in **In Process** status. Allocate specific people to the project and amortize each team member **40 hours per week from the beginning of sprinting for the duration of the sprint**.

Refinements from the requirements pass:

- **Governance** spans the **entire project timeline** (it is the PM's own forecasted oversight time).
- **Sprinting** covers **every person/role except the PM**, and spans **one or more sprints** (start with a single sprint for simplicity).
- Amortization spreads **40 hours per week per resource**, applied to each week in the iteration's span.
- Dates key off the **project start and end**, which are known at creation; iterations are **waterfall / date-driven** within that outer span.

---

## 4. What the builder asks the PM

The builder collects these inputs conversationally. Anything the PM doesn't supply falls back to the standard default so the flow never stalls.

1. **Client** — defaults to the **Xede** reference for internal/test projects; otherwise the named client. (Existing client is resolved; a brand-new client is the "Add Client + Project" path.)
2. **Project name** — e.g. `Tim-Test`. (Project code auto-numbers, mirroring the UI; see §6.)
3. **Project start and end dates** — the outer span everything keys off.
4. **Iteration set** — offered as the standard five (below) to **accept, modify, or add/remove**. If the builder can't take that input inline in a given run, it uses the standard set as-is and the PM revises later.
5. **Per-iteration date ranges** — within the project span, waterfall by default.
6. **Resources** — named people and/or placeholder roles, and which iterations each is on.
7. **Weekly load** — defaults to 40 h/week per resource across each resource's iteration span.
8. **Rate** — defaults to the **$200/hour** starter (a placeholder figure the PM and Finance adjust later).

### The standard iteration set (selectable default)

| # | Iteration | Billable | Default span |
|---|-----------|----------|--------------|
| 00 | Governance | Yes | Whole project |
| 01 | Sprinting | Yes | One sprint (within project) |
| 02 | Hypercare | Yes | Tail of project |
| 03 | Travel | No | Whole project (as needed) |
| 04 | Onboarding / Ramp up | No | Front of project |

---

## 5. Order of operations (why sequence matters)

BigTime requires the scaffolding to exist before hours can hang off it. The Rates/Staffing tab must be populated **before** a person can be allocated inside an iteration — this is a real constraint in the tool, and the builder honors it:

```
1. Resolve (or create) the client
2. Create the project  ──► gets a ProjectSid
3. Set the project's starter rate ($200/hr)
4. Register resources on the project (people + placeholder roles) — the "Rates/Staffing tab" step
5. Create the iterations (tasks), each date-bounded, status In Process
6. Amortize: write weekly allocations per resource per iteration
7. Set each iteration's budget hours/fees to match the allocations
8. (All of 2–7 shown in the preview first; committed only on approval)
```

---

## 6. Operation sequence mapped to the BigTime API

Base URL: `https://iq.bigtime.net/BigtimeData/api/v2`. All calls carry `X-Auth-Token` and `X-Auth-Realm` headers.

| Step | Action | API call | Key fields |
|---|---|---|---|
| 1 | Resolve client "Xede" | `GET /project` (or client list) to find the existing `ClientId`; "Add Client + Project" creates a new one | `ClientId` |
| 2 | Create project | `POST /project/detail` | `Nm` = "Tim-Test", `ProjectCode` (auto-next, mirrors UI), `ClientId`, `StartDt`, `EndDt`, `StatusProd` = In-Process value |
| 2a | Add PM to team | `POST /project/team/{sid}` | `StaffSID` (Tim), `TeamLead` = true |
| 3 | Starter rate | `POST /project/detail/{sid}` with `BaseRateStyle` flat + `BasicRate` = 200 (project-level), and/or per-resource rows via `POST /project/rate` | `BasicRate` = 200 |
| 4 | Register resources (Rates/Staffing tab) | `POST /project/team/{sid}` | array of `StaffSID` (named) + `ContactRole` (placeholder roles) |
| 5 | Create each iteration | `POST /task/detail` (one per iteration) | `ProjectSid`, `TaskNm` = "00 - Governance" …, `StartDt`, `DueDt`, `NoCharge` (TRUE for 03/04, FALSE for 00/01/02), `CurrentStatusName` = "In Process", `TypeSid`/`TaskTypeName` |
| 6 | Amortize weekly allocations | **Allocation write endpoint — see Open Item A** | per resource × per week × per iteration = 40 h |
| 7 | Set iteration budget | `POST /task/detail/{taskSid}` | `BudgetHours` = Σ allocations, `BudgetFees` = hours × rate |
| — | Read-back / verify | `GET /task/BudgetStatusByProject/{ProjectSid}`, `GET /staff/staffAllocations` | confirm the commit matches the preview |

**Note on billable:** BigTime has no "billable" field; it uses `NoCharge`, which works in reverse — `NoCharge = TRUE` means non-billable. So Travel and Onboarding get `NoCharge = TRUE`; Governance, Sprinting, Hypercare get `NoCharge = FALSE`.

**Note on dates:** a task carries `StartDt` and `DueDt` (there is no separate "end" field — `DueDt` is the end).

---

## 7. Amortization logic

For each resource on each iteration:

```
weeks = list of Mon–Fri work-weeks overlapping [iteration.StartDt, iteration.DueDt]
for each week:
    allocate weekly_load (default 40h) to that resource for that week
iteration.BudgetHours = Σ all resource-weeks on the iteration
iteration.BudgetFees  = iteration.BudgetHours × rate
```

- **Governance** → the PM only, across the whole project span.
- **Sprinting** → every resource **except the PM**, across the sprint span, 40 h/week each.
- **Hypercare / Travel / Onboarding** → allocated only if the PM puts resources on them.
- Placeholder roles amortize exactly like named people; they're swapped for names later via the Revise flow.

### Worked numbers (illustrative)

Project span **Mon 3 Nov 2026 → Fri 30 Jan 2027**. Sprinting = **3 Nov – 12 Dec 2026** (6 work-weeks). Three named resources + one placeholder role on Sprinting at 40 h/week:

- Per resource on Sprinting: 6 weeks × 40 h = **240 h** → at $200 = **$48,000**
- Sprinting total: 4 resources × 240 h = **960 h** → **$192,000**
- Governance (PM, whole 13-week span at, say, 4 h/week) = **52 h** → **$10,400**

These roll into each iteration's `BudgetHours`/`BudgetFees` and the project budget, set as part of the same approved commit.

---

## 8. The dry-run preview (what the PM approves)

Before any write, the builder shows:

- The project header: name, client, code, start/end, status.
- The iteration table: each iteration, billable flag, start/due.
- The resource roster: named people + placeholder roles, with the $200 rate.
- The full allocation grid: resource × week, with per-iteration and project totals in hours and fees.
- A one-line summary of exactly which API calls will run, in order.

The PM approves once. The builder then executes steps 1–7 and reads the result back (step —) to confirm the live state matches the preview. If anything diverges, it reports the difference rather than silently continuing.

---

## 9. Create vs. Revise

**Create** — the full sequence above, for a new project.

**Revise** — operates on an existing `ProjectSid`:

- *Add a person* → `POST /project/team` to register, then allocate + update budget.
- *Swap a placeholder role for a named person* → register the name, move that role's allocations onto the person.
- *Extend or re-date a sprint* → `POST /task/detail/{taskSid}` to change `DueDt`, then re-amortize the added weeks.
- *Re-amortize* → recompute the grid and write the delta.

Revise shows the same before/after preview and the same single-approval commit. It never deletes iterations or resources carrying logged time.

---

## 10. Open items to confirm at build

**A. Allocation write endpoint.** The public v2 API documents **reading** allocations (`GET /staff/staffAllocations`) but the write path used by the Allocation Wizard is not in the published Project/Task/Staff help. This is the one endpoint to confirm from the live network trace of a Wizard save, or from BigTime support, before the builder can commit allocations. Everything else in §6 is public, documented API. *This is the single technical dependency that gates the allocation step; the create/iteration/rate/budget steps do not depend on it.*

**B. Status value for "In Process."** Confirm the exact `StatusProd` / `CurrentStatusName` string BigTime expects for In-Process so iterations land in the right state.

**C. Project code auto-numbering.** The UI auto-assigns the next code (e.g. `000685`); the API requires `ProjectCode`. Decide whether the builder reads the current max and increments, or the firm supplies a code scheme.

**D. Rates tab vs. custom rate rows.** Confirm whether the starter $200 is best set as the project `BasicRate` (flat) or as per-resource `/project/rate` rows (which additionally require `CatSid` and `TaskSid`, i.e. after iterations exist). The flat `BasicRate` keeps the sequence clean and is the recommended default.

**E. Authentication & governance.** Confirm the firm-issued credential, its scope, and who administers it — consistent with the firm-sponsored, human-approved-commit model in §2.

---

## 11. Rollout

- **First cut: for Tim.** Built and proven against Tim's own login and the Xede reference client, with the Tim-Test scenario as the acceptance test.
- **Then: generic to the signed-in user.** Once proven, the PM identity, team, and rates are parameterized so any PM runs it as themselves — same flow, same preview, same approval gate.

---

*Draft for review. The operation sequence in §6 is grounded in BigTime's published v2 API (Project, Task, Staff help); Open Item A is the one write path still to confirm before the allocation step can run.*

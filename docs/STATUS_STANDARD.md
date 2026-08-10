# Status Standard

## Purpose

This document standardizes user-facing status terminology for the current WMS workflows.

Stored backend values must not be changed for display terminology. The UI maps stored values to user-facing labels.

## General Rules

- Do not expose raw lowercase or snake_case values in the UI.
- Use title case labels.
- Preserve stored database values.
- Keep list filter labels, list badges, detail badges, and steppers aligned.
- Do not expose compatibility statuses in filters unless records can still use them.
- Cancelled and terminal statuses must take priority over derived workflow states.

## Status Badge Rules

Status badges are text-only.

Do not render decorative dots inside status badges.

Badge colors remain status-specific:

- Blue: created, open, ready, assigned, or active starting state.
- Orange/yellow: in progress, receiving, processing, dispatched where appropriate.
- Green: completed, closed, posted, packed, picked.
- Red: cancelled, rejected, exception, error-like terminal states.
- Gray: draft, pending, inactive, or neutral states.

Workflow stepper circles and timeline dots are not status badges and may retain their indicators.

## Inbound ASN

| Stored value | User-facing label |
|---|---|
| draft | Draft |
| pending | Pending |
| in_transit | In Transit |
| arrived | Arrived |
| closed | Closed |
| cancelled | Cancelled |

User-facing workflow:

Draft -> Pending -> In Transit -> Arrived -> Closed

## Inbound GRN

| Stored value | User-facing label |
|---|---|
| draft | Draft |
| receiving | Receiving |
| completed | Completed |
| posted | Posted |
| cancelled | Cancelled |

User-facing workflow:

Draft -> Receiving -> Completed -> Posted

## Putaway

| Stored value | User-facing label |
|---|---|
| pending | Pending |
| assigned | Assigned |
| in_progress | In Progress |
| completed | Completed |
| exception | Exception |

User-facing workflow:

Pending -> Assigned -> In Progress -> Completed

Exception is an alternate outcome from an active state.

## Picking

| Stored value | User-facing label |
|---|---|
| open | Open |
| assigned | Assigned |
| in_progress | In Progress |
| picking | In Progress |
| picked | Picked |
| done | Picked |
| completed | Picked |
| packed | Packed |
| shipped | Shipped |
| cancelled | Cancelled |

Picking completion should display as Picked, not generic Completed, because Packing follows it.

## Packing

| Stored value | User-facing label |
|---|---|
| pending | Pending |
| draft | Pending |
| carton_generated | In Progress |
| in_progress | In Progress |
| packed | Packed |
| completed | Packed |
| shipped | Shipped |
| cancelled | Cancelled |
| exception | Exception |

User-facing workflow:

Pending -> In Progress -> Packed -> Shipped

## Shipping

| Stored value | User-facing label |
|---|---|
| planned | Pending |
| pending | Pending |
| packed | Ready to Dispatch |
| carton_generated | Ready to Dispatch |
| dispatched | Dispatched |
| closed | Closed |
| cancelled | Cancelled |

Shipping starts after Packing. The initial active Shipping status should communicate dispatch readiness, not physical packing.

Preferred user-facing label:

Ready to Dispatch

## Returns

The Returns list uses a display-layer workflow status derived from Return status and linked RMA status.

Stored Return status values remain unchanged.

| Return status | Linked RMA status | User-facing Returns list label |
|---|---|---|
| closed | any | Closed |
| cancelled | any | Cancelled |
| created | none | Return Created |
| created | created | RMA Opened |
| created | open | RMA Opened |
| created | processing | RMA Processing |
| created | completed | RMA Completed |
| created | cancelled | Cancelled label according to current cancellation rules |

Return lifecycle stepper:

Return Created -> RMA Opened -> Closed

`RMA Opened` is a display step derived from the existence of a linked RMA. It is not a database status.

## RMA

| Stored value | User-facing label |
|---|---|
| created | Opened |
| open | Opened |
| processing | Processing |
| completed | Completed |
| cancelled | Cancelled |

Initial RMA status must display as Opened, not Created.

## Inventory: Cycle Count

Current user-facing status labels include:

- Draft
- Assigned where supported.
- In Progress.
- Submitted.
- Approved.
- Rejected.
- Cancelled.

If `counting` is not produced by the active workflow, it should not appear as a visible filter option. Compatibility mapping may remain for legacy data.

## Inventory: Adjustments

| Stored value | User-facing label |
|---|---|
| draft | Draft |
| submitted | Submitted |
| approved | Approved |
| rejected | Rejected |
| cancelled | Cancelled |

Adjustment workflow:

Draft -> Submitted -> Approved

or:

Submitted -> Rejected

or:

Draft / Submitted -> Cancelled

## Empty Value Standard

All empty or missing values in the Portal UI should display:

-

Use `-` for:

- null
- undefined
- empty string
- whitespace-only string
- replacement character
- text values equal to `null`, `undefined`, or `NaN`

Do not display:

- blank text
- N/A
- Not provided
- undefined
- null
- NaN
- replacement character

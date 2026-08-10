# UI Guidelines

## Purpose

This document captures the current agreed UI standards for the Portal and Mobile surfaces.

Portal is the visual reference for management and monitoring pages.

Mobile is optimized for warehouse execution, scanning, and task completion.

## Typography Standard: Portal

Portal uses the existing global font family:

Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif

The current Portal typography scale is the Enterprise Compact scale.

| Element | Size | Weight | Line height |
|---|---:|---:|---:|
| Page Title | 22px | 700 | 30px |
| Page Description | 13px | 400 | 20px |
| Card Title | 15px | 600 | 22px |
| Section Heading | 13px | 600 | 20px |
| Field Label | 12px | 500 | 16px |
| Field Value | 13px | 400 | 20px |
| Primary Document ID / Link | 13px | 500 | 20px |
| Table Header | 12px | 600 | 16px |
| Table Body | 13px | 400 | 20px |
| Button | 13px | 500 | 20px |
| Input / Select / Date Input | 13px | 400 | 20px |
| Tabs | 13px | 500 | 20px |
| Status Badge | 12px | 500 | 16px |
| Helper Text | 12px | 400 | 16px |
| Validation / Error Text | 12px | 500 | 16px |
| Modal Title | 15px | 600 | 22px |
| Modal Body | 13px | 400 | 20px |

Do not reduce text below 12px for regular UI text.

## Portal Detail Page Pattern

Document detail pages should follow a consistent pattern:

1. Document header with document number and status badge.
2. Workflow stepper where the workflow uses one.
3. Information cards.
4. Items table.
5. Bottom action area.

Action buttons should not be duplicated in both the list table and the detail page.

For document modules such as ASN, GRN, Returns, and RMA:

- List tables should stay clean.
- Workflow actions belong in the detail action area.
- The detail action area should appear below the last detail section.

## Information Cards

Information cards should use:

- Consistent card padding.
- Consistent border radius.
- Uppercase section titles.
- Label/value grid layout.
- Field labels using field-label typography.
- Field values using field-value typography.

Do not invent fields to make sections look balanced.

Only display fields already available in current data.

## Tables

Tables should use:

- Consistent table header typography.
- Consistent table body typography.
- Stable column labels.
- `-` for missing values.
- Human-readable user and product display values when available.

Do not expose internal line IDs unless they are meaningful to users.

## Status Badges

Status badges are text-only.

Rules:

- No decorative dot inside status badges.
- Keep status-specific colors.
- Keep badge typography at 12px, medium weight, 16px line height.
- Do not change stored status values for display.
- Use display mappings from `STATUS_STANDARD.md`.

Do not remove circles from:

- Workflow steppers.
- Timelines.
- Radio buttons.
- Checkboxes.
- Notification indicators.

## Priority Badges

Priority badges may retain their existing style.

Do not change priority badge semantics when changing status badges.

## Empty Values

Display missing values as:

-

Do not use:

- N/A
- Not provided
- blank text
- undefined
- null
- NaN
- replacement character

Notes and long text fields also use `-` when empty.

## User Display

Where user name data is available, display:

Name (UserID)

Example:

Sarah Manager (USR000002)

If the name is not available, fall back to the raw user ID.

Do not remove the raw user ID from display because it is useful for audit and support.

## Confirmation Dialog Standards

Use custom confirmation dialogs.

Do not use JavaScript `alert()` or `confirm()` for workflow actions.

Confirmation dialogs should include:

- Clear title.
- Clear action message.
- Supporting text for irreversible or downstream effects.
- Explicit cancel button.
- Explicit confirm button matching the action label.
- Required reason input when the workflow requires a reason.

Examples:

### Close Return

Title:

Close Return

Message:

Are you sure you want to close this Return?

Supporting text:

This action indicates that the return process has been completed and cannot be reopened.

Buttons:

- Cancel
- Close Return

### Cancel Return

Title:

Cancel Return

Message:

Are you sure you want to cancel this Return?

Supporting text:

The linked RMA will also be cancelled if it is still active.

Reason is required.

Buttons:

- Keep Return
- Cancel Return

## Portal vs Mobile UI Responsibilities

Portal UI should emphasize:

- Search and filtering.
- List/detail navigation.
- Workflow visibility.
- Assignment.
- Approval.
- Cancellation.
- Monitoring and audit.

Mobile UI should emphasize:

- Assigned work.
- Scan actions.
- Quantity entry.
- Physical confirmation.
- Exception reporting.
- Large touch targets.
- Short, direct execution wording.

## Module-Specific UI Rules

### Returns and RMA

Returns detail should make the Return lifecycle clear:

Return Created -> RMA Opened -> Closed

RMA status remains separate in the RMA Information card.

Linked navigation should connect Return and RMA records when both are available.

### Picking

Portal should show assignment and monitoring.

Mobile should show scan, pick, manual pick, undo, and complete actions.

Picking completion should display as Picked in user-facing labels.

### Packing

Packing execution centers on carton generation, carton scan, packaging type, weight, and confirmation.

Carton ID should display `-` until generated or scanned.

Only the assigned operator should be able to execute packing.

### Shipping

Shipping initial active status should display as Ready to Dispatch.

Do not call a Shipping record Packed in the user-facing Shipping UI, because Packed is the Packing completion status.

Mobile Shipping is currently view-only.

## Responsive Behavior

Portal controls should keep consistent wrapping behavior:

- Search, status, and date filters align in one toolbar where space allows.
- Toolbars may wrap on smaller widths.
- Controls should not clip labels.
- Buttons should not wrap text unless unavoidable.

Mobile screens may use compact cards and bottom action areas suited to touch execution.

## Source Code Boundary

UI guidelines should be implemented through shared components where practical.

Do not change workflow, RBAC, API behavior, tenant isolation, or database schema as part of UI-only work.

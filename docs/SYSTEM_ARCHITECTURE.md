# System Architecture

## Purpose

This document describes the current agreed architecture for the Warehouse Management System.

The system is split into three application surfaces:

- Portal: management, monitoring, administration, approvals, and workflow control.
- Mobile: warehouse floor execution.
- Backend: API, workflow validation, persistence, RBAC, tenant isolation, and transaction control.

No module should rely on frontend hiding alone for business rules. Backend validation remains the source of truth.

## Application Surfaces

### Portal

Portal is the management and monitoring application.

Portal responsibilities include:

- User authentication and warehouse context selection.
- Master data management.
- Tenant-aware administrative workflows.
- Document creation and lifecycle control.
- Assignment of operational work.
- Approval and rejection workflows.
- Cancellation workflows where the action is managerial or administrative.
- Monitoring execution progress.
- Running list/detail views, filters, and audit/history review.

### Mobile

Mobile is the warehouse execution application.

Mobile responsibilities include:

- Viewing assigned work.
- Scanning physical labels and barcodes.
- Capturing execution quantities.
- Confirming physical completion of warehouse tasks.
- Reporting execution exceptions.
- Capturing execution evidence where supported.

Mobile should not become the primary management application. Management actions that currently appear on Mobile should be treated as responsibility exceptions unless explicitly approved as part of an execution workflow.

### Backend

Backend responsibilities include:

- Exposing versioned APIs.
- Enforcing RBAC.
- Enforcing tenant and warehouse isolation.
- Validating state transitions.
- Preserving workflow invariants.
- Running transactional updates.
- Preventing duplicate posting or duplicate downstream task creation.
- Returning display enrichment such as user names and product names where the frontend cannot derive them safely.

## Module Responsibilities

### Inbound: ASN

Portal owns ASN creation, workflow actions, cancellation, and document monitoring.

Mobile ASN is currently read-only. Mobile displays ASN status and detail information, with inbound actions managed from Portal.

Current ASN user-facing workflow:

Draft -> Pending -> In Transit -> Arrived -> Closed

Cancelled is supported only where already implemented.

### Inbound: GRN

Portal owns GRN creation, receiving workflow control, posting, cancellation where supported, and document monitoring.

Mobile GRN is currently read-only. Mobile displays GRN status, detail information, and line information.

Current GRN user-facing workflow:

Draft -> Receiving -> Completed -> Posted

Cancelled is supported only where already implemented.

### Putaway

Portal owns putaway monitoring and management actions such as assignment.

Mobile owns physical execution:

- Complete Putaway.
- Mark Exception when execution fails.

Current user-facing workflow:

Pending -> Assigned -> In Progress -> Completed

Exception is an alternate outcome, not part of the happy path.

### Inventory: Cycle Count

Portal owns count planning, assignment, approval, rejection, and administrative cancellation.

Mobile owns count execution:

- Add Count Entry.
- Submit count after execution where currently supported.

Current workflow should distinguish planning/control from floor counting. Approval remains a management responsibility.

### Inventory: Adjustments

Portal owns approval, rejection, administrative cancellation, and monitoring.

Mobile may create and submit adjustment requests when a warehouse user discovers a stock discrepancy on the floor.

Maker-checker remains required:

- The requester must not approve or reject their own adjustment.
- Backend enforcement remains mandatory.

### Outbound Sales Orders

Portal owns sales order creation, release, monitoring, and management-level outbound workflow control.

Picking, Packing, and Shipping are downstream operational modules.

Current outbound flow:

Sales Order -> Release -> Picking -> Packing -> Shipping -> Close -> Sales Order Completed

### Picking

Portal owns monitoring and operator assignment.

Mobile owns picking execution:

- Scan units.
- Manual pick when required.
- Undo scan.
- Complete Pick List.
- Complete with short-pick reason where supported.

Assignment should be Portal responsibility. Any Mobile assignment behavior should be treated as an exception to review.

### Packing

Mobile owns packing execution:

- Generate Carton Label.
- Scan Carton QR.
- Select packaging type.
- Enter weight.
- Confirm Packing.

Portal may monitor Packing. If Portal exposes packing execution, that is a current implementation capability, but the agreed responsibility split treats Mobile as the primary execution surface.

### Shipping

Portal owns Shipping execution and workflow control in the current system:

- Dispatch Shipment.
- Close Shipment.
- Cancel Shipment.

Mobile Shipping is currently view-only and tells users that shipping actions are managed from the web portal.

## Cross-Module Business Rules

### Returns and RMA

Current agreed flow:

Return Created -> Create RMA -> RMA Opened -> RMA Processing -> RMA Completed -> Close Return -> Return Closed

Rules:

- One Return can only have one active RMA.
- Return cancellation is allowed before linked RMA completion.
- Cancelling a Return also cancels any unfinished linked RMA.
- A Return with a Completed RMA cannot be cancelled.
- Closing a Return after RMA completion is a one-click user-facing action.
- Backend must reject invalid Return and RMA transitions.
- Cancelled linked RMAs remain visible for historical display.

### Ownership Rules

Execution ownership must be enforced by the backend.

Examples:

- Picking execution mutations must be performed by the assigned operator for operator execution roles.
- Packing confirmation must be performed by the assigned packing operator.
- Managers may view and assign where allowed, but should not bypass execution ownership controls.

### Idempotency Rules

Downstream handoffs must be idempotent:

- Completing Picking must not create duplicate Packing Tasks.
- Confirming Packing must not create duplicate shipment handoff records.
- Dispatching Shipping must not double-post inventory.

## Data and Display Enrichment

Backend should preserve raw IDs while also providing display fields where needed.

Examples:

- `created_by` remains the raw user ID.
- `created_by_name` and `created_by_display` are returned where implemented.
- Product names should be exposed or derivable from the relevant item/SKU data.

The UI should display human-readable values when available and fall back safely when not available.

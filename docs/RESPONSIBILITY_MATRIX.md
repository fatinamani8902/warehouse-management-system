# Responsibility Matrix

## Principle

Portal is the management and monitoring application.

Mobile is the warehouse execution application.

Backend enforces all workflow, RBAC, tenant, warehouse, and ownership rules.

## Legend

- Portal only: the action belongs in Portal.
- Mobile only: the action belongs on Mobile.
- Both: the action is valid on both surfaces.
- Backend only: the action is not directly user-facing.

## Responsibility Matrix

| Module | Action | Responsibility | Business justification |
|---|---|---:|---|
| Auth | Login | Both | Users must authenticate from both Portal and Mobile. |
| Auth | Select warehouse context | Both | Users need the correct warehouse context before work. |
| Auth | Logout | Both | Session action, not a workflow mutation. |
| ASN | Create ASN | Portal only | ASN creation is planning/document management. |
| ASN | Submit / progress ASN workflow | Portal only | ASN status movement is document control. |
| ASN | Cancel ASN | Portal only | Cancellation is administrative workflow control. |
| ASN | View ASN | Both | Mobile may view inbound context; Portal manages it. |
| GRN | Create GRN | Portal only | GRN document creation is management/control. |
| GRN | Receive / complete / post GRN | Portal only | Current Mobile GRN is read-only. |
| GRN | Update GRN lines | Portal only | Current active mobile flow does not execute receiving. |
| GRN | Cancel GRN | Portal only | Cancellation is administrative workflow control. |
| GRN | View GRN | Both | Mobile may view receipt context; Portal manages it. |
| Putaway | Assign Putaway Task | Portal only | Assignment is management work. |
| Putaway | Recompute Bin | Portal only | Bin recomputation is planning/control logic. |
| Putaway | Complete Putaway | Mobile only | Operator confirms physical placement. |
| Putaway | Mark Exception | Both | Operators report execution issues; managers may review or resolve. |
| Putaway | View Putaway | Both | Portal monitors; Mobile executes. |
| Cycle Count | Create Count Plan | Portal only | Count planning is management work. |
| Cycle Count | Add Count Entry | Mobile only | Physical counting belongs on Mobile. |
| Cycle Count | Submit Count Plan | Both | Mobile can submit execution results; Portal can submit administrative counts. |
| Cycle Count | Approve Count Plan | Portal only | Approval is management control. |
| Cycle Count | Reject Count Plan | Portal only | Rejection is management control. |
| Cycle Count | Cancel Count Plan | Portal only | Cancellation is administrative workflow control. |
| Adjustments | Create Adjustment | Both | Operators may request adjustments from the floor; Portal may create administrative requests. |
| Adjustments | Submit Adjustment | Both | Request submission may happen where the request is created. |
| Adjustments | Approve Adjustment | Portal only | Approval is maker-checker management control. |
| Adjustments | Reject Adjustment | Portal only | Rejection is approval control. |
| Adjustments | Cancel Adjustment | Both | Requester withdrawal can be Mobile; administrative cancellation can be Portal. |
| Outbound Order | Create Sales Order | Portal only | Sales order creation is management/order control. |
| Outbound Order | Release Sales Order | Portal only | Release starts downstream operational workflow. |
| Outbound Order | Cancel Sales Order | Portal only | Cancellation is administrative workflow control. |
| Picking | Assign / Reassign Pick List | Portal only | Assignment is management work. |
| Picking | Scan Pick Units | Mobile only | Physical scan execution belongs on Mobile. |
| Picking | Manual Pick Line | Mobile only | Physical exception fallback during execution. |
| Picking | Undo Pick Scan | Mobile only | Execution correction at point of work. |
| Picking | Complete Pick List | Mobile only | Operator confirms physical picking completion. |
| Picking | Complete Short Pick | Mobile only | Operator reports physical shortage during execution. |
| Picking | Cancel Pick List | Portal only | Cancellation is workflow control unless explicitly approved as an operator exception. |
| Packing | Generate Carton Label | Mobile only | Carton reservation is part of physical packing execution. |
| Packing | Scan Carton QR | Mobile only | Physical carton verification belongs on Mobile. |
| Packing | Select Packaging Type | Mobile only | Physical packing capture belongs on Mobile. |
| Packing | Enter Weight | Mobile only | Physical packing capture belongs on Mobile. |
| Packing | Confirm Packing | Mobile only | Operator confirms physical packing completion. |
| Packing | View Packing | Both | Portal monitors; Mobile executes. |
| Shipping | Dispatch Shipment | Portal only | Current workflow manages dispatch from Portal. |
| Shipping | Close Shipment | Portal only | Current workflow finalizes shipment from Portal. |
| Shipping | Cancel Shipment | Portal only | Cancellation is administrative workflow control. |
| Shipping | View Shipping | Both | Mobile Shipping is currently view-only. |
| Returns | Create Return | Portal only | Return creation is business document management. |
| Returns | Create RMA from Return | Portal only | RMA creation is workflow control. |
| Returns | Cancel Return | Portal only | Return cancellation affects linked RMA and must be controlled. |
| Returns | Close Return | Portal only | Return closure is business workflow completion. |
| RMA | Process RMA | Portal only | RMA processing is management/workflow control in current implementation. |
| RMA | Complete RMA | Portal only | RMA completion gates Return closure. |
| RMA | Cancel RMA | Portal only | RMA cancellation is workflow control. |
| Master Data | Create / update / deactivate | Portal only | Master data is administrative. |
| User Management | Create / update users and roles | Portal only | Security administration is Portal-only. |
| Audit Log / Trace | View | Portal only | Audit and trace are management observability surfaces. |

## Current Responsibility Exceptions

The current Mobile code exposes some management actions. These should be reviewed before UAT if strict responsibility separation is required.

Known exceptions:

- Mobile Putaway exposes Assign and Recompute Bin.
- Mobile Picking exposes Assign Pick List.
- Mobile Picking exposes Cancel Pick List.
- Mobile Cycle Count exposes Create, Approve, Reject, and Cancel.
- Mobile Adjustment exposes Approve and Reject.
- Portal Packing exposes Generate Carton Label and Confirm Packing even though the agreed split treats Mobile as the primary packing execution surface.

These are documented as current implementation facts, not as recommended future features.

## Backend Enforcement

Even where an action is hidden in a UI, the backend must enforce:

- RBAC.
- Tenant isolation.
- Warehouse isolation.
- Status transition rules.
- Ownership rules.
- Duplicate mutation prevention.
- Transactional handoff integrity.

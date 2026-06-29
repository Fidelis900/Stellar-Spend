# Recurring Payroll & Scheduled Disbursements

## Overview

The payroll feature extends recurring payments to support multi-beneficiary scheduled disbursements with approval workflows, funding checks, and per-recipient status tracking.

## Features

### Payroll Templates

- Create reusable templates with multiple recipients
- Configure amounts and cadence (daily/weekly/monthly)
- Track total disbursement amount
- Pause/resume templates

### Multi-Recipient Support

- Add multiple recipients per template
- Each recipient has: institution, account identifier, account name, amount
- Per-recipient status tracking in run history

### Approval Workflow (Future)

- Pending approval before each run
- Approve/reject with audit trail
- 24-hour expiration for pending approvals

### Run History (Future)

- Track all payroll run executions
- Per-recipient disbursement status
- Partial success handling
- Retry failed disbursements

## Architecture

### Storage

- `PayrollTemplateStorage`: LocalStorage-based template persistence
- `PayrollRunStorage`: Run history persistence

### Data Models

Located in `src/lib/payroll/types.ts`:

- `PayrollTemplate`: Template configuration
- `PayrollRecipient`: Individual recipient details
- `PayrollRun`: Execution instance with status tracking

### Components

- `PayrollTemplateManager`: Template CRUD interface

## Usage

```typescript
import PayrollTemplateManager from "@/components/PayrollTemplateManager";

<PayrollTemplateManager userAddress={userAddress} />
```

## Next Steps

1. Integrate with scheduling service
2. Implement approval workflow
3. Add funding validation
4. Build run execution engine
5. Create run history UI
6. Add notifications

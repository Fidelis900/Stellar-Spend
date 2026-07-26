import { NextResponse } from "next/server";
import { getDueRecords, updateRecord } from "@/lib/webhook/delivery-store";
import * as dispatcher from "@/lib/webhook/dispatcher";
import * as dlq from "@/lib/webhook/dlq";
import * as alertService from "@/lib/webhook/alert-service";
import { scheduleNext, hasRemainingAttempts } from "@/lib/webhook/retry-scheduler";
import type { DeliveryRecord } from "@/lib/webhook/types";
import { ErrorHandler } from "@/lib/error-handler";

interface RecordResult {
    id: string;
    outcome: "delivered" | "retryScheduled" | "failed";
    attemptCount: number;
    error?: string;
}

/**
 * Processes a single due delivery record sequentially.
 * Prevents concurrent delivery of the same record (Requirement 1.4) by
 * processing records one at a time in a sequential loop.
 */
async function processRecord(record: DeliveryRecord): Promise<RecordResult> {
    const result = await dispatcher.attempt(record);

    if (result.success) {
        await dispatcher.markDelivered(record.id, record.attemptCount + 1);
        return { id: record.id, outcome: "delivered", attemptCount: record.attemptCount + 1 };
    }

    // Failure path: check if retryable and has remaining attempts
    const updatedRecord: DeliveryRecord = {
        ...record,
        attemptCount: record.attemptCount + 1,
    };

    if (result.retryable && hasRemainingAttempts(updatedRecord)) {
        const scheduled = await scheduleNext(updatedRecord);
        await updateRecord(record.id, {
            nextAttemptAt: scheduled.nextAttemptAt,
            attemptCount: updatedRecord.attemptCount,
        });
        return { id: record.id, outcome: "retryScheduled", attemptCount: updatedRecord.attemptCount };
    }

    // Non-retryable or max attempts reached
    await dispatcher.markFailed(updatedRecord);
    const dlqEntry = await dlq.write(updatedRecord);
    await alertService.notify(dlqEntry);

    return {
        id: record.id,
        outcome: "failed",
        attemptCount: updatedRecord.attemptCount,
        error: result.errorType ?? `HTTP ${result.httpStatus}`,
    };
}

async function runRetries() {
    const dueRecords = await getDueRecords();

    const results: RecordResult[] = [];

    // Process sequentially to prevent concurrent delivery of the same record (Requirement 1.4)
    for (const record of dueRecords) {
        try {
            const result = await processRecord(record);
            results.push(result);
        } catch (err) {
            results.push({
                id: record.id,
                outcome: "failed",
                attemptCount: record.attemptCount,
                error: err instanceof Error ? err.message : String(err),
            });
        }
    }

    return {
        processed: results.length,
        delivered: results.filter((r) => r.outcome === "delivered").length,
        retryScheduled: results.filter((r) => r.outcome === "retryScheduled").length,
        failed: results.filter((r) => r.outcome === "failed").length,
        records: results,
    };
}

export async function GET() {
    try {
        const summary = await runRetries();
        return NextResponse.json({ ok: true, ...summary });
    } catch (err) {
        return ErrorHandler.serverError(err);
    }
}

export async function POST() {
    try {
        const summary = await runRetries();
        return NextResponse.json({ ok: true, ...summary });
    } catch (err) {
        return ErrorHandler.serverError(err);
    }
}

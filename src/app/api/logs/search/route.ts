import { type NextRequest, NextResponse } from 'next/server';
import { ErrorHandler } from '@/lib/error-handler';
import { ApiError, ErrorType } from '@/lib/error-types';
import {
  CloudWatchLogsClient,
  StartQueryCommand,
  GetQueryResultsCommand,
  type ResultField,
} from '@aws-sdk/client-cloudwatch-logs';

/**
 * POST /api/logs/search
 *
 * Runs a CloudWatch Logs Insights query against the application log group.
 * Polls until the query completes (max 30s) then returns results.
 *
 * Body:
 *   query      string   Logs Insights query string (required)
 *   startTime  number   Unix epoch seconds (default: 1 hour ago)
 *   endTime    number   Unix epoch seconds (default: now)
 *   limit      number   Max results 1–1000 (default: 100)
 *
 * Requires AWS credentials in the runtime environment:
 *   AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * or an ECS task role with logs:StartQuery + logs:GetQueryResults.
 */

export const maxDuration = 30;

const LOG_GROUP = process.env.CW_LOG_GROUP ?? `/ecs/stellar-spend-${process.env.ENVIRONMENT ?? 'production'}`;
const REGION    = process.env.AWS_REGION ?? 'us-east-1';

const client = new CloudWatchLogsClient({ region: REGION });

function rowToObject(fields: ResultField[]): Record<string, string> {
  return Object.fromEntries(fields.map((f) => [f.field ?? '', f.value ?? '']));
}

async function runQuery(
  queryString: string,
  startTime: number,
  endTime: number,
  limit: number,
): Promise<Record<string, string>[]> {
  const { queryId } = await client.send(new StartQueryCommand({
    logGroupName: LOG_GROUP,
    queryString,
    startTime,
    endTime,
    limit,
  }));

  if (!queryId) throw new Error('Failed to start query');

  // Poll up to 25s (Insights queries typically complete in 1–5s)
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
    const result = await client.send(new GetQueryResultsCommand({ queryId }));
    const status = result.status;
    if (status === 'Complete') {
      return (result.results ?? []).map(rowToObject);
    }
    if (status === 'Failed' || status === 'Cancelled') {
      throw new Error(`Query ${status.toLowerCase()}`);
    }
    // status === 'Running' | 'Scheduled' — keep polling
  }
  throw new Error('Query timed out');
}

export async function POST(request: NextRequest) {
  // Require internal auth — same admin token used for api-keys management
  const adminToken = process.env.API_KEY_ADMIN_TOKEN;
  if (adminToken) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${adminToken}`) {
      return ErrorHandler.unauthorized('Unauthorized');
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ErrorHandler.validation('Invalid JSON');
  }

  const { query, startTime, endTime, limit } = body;

  if (typeof query !== 'string' || !query.trim()) {
    return ErrorHandler.validation('query is required');
  }

  const now = Math.floor(Date.now() / 1000);
  const start = typeof startTime === 'number' ? startTime : now - 3600;
  const end   = typeof endTime   === 'number' ? endTime   : now;
  const lim   = typeof limit     === 'number' ? Math.min(Math.max(limit, 1), 1000) : 100;

  try {
    const results = await runQuery(query, start, end, lim);
    return NextResponse.json({ results, count: results.length, logGroup: LOG_GROUP });
  } catch (err) {
    return ErrorHandler.handle(new ApiError(ErrorType.EXTERNAL_SERVICE, err instanceof Error ? err.message : 'Search failed'));
  }
}

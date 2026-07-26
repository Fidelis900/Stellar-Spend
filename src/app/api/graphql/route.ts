import { graphql, parse, validate, visit, type DocumentNode, type ValidationRule } from "graphql";
import { schema } from "../../../../lib/graphql/schema";
// Resolvers are now split by domain under src/lib/graphql/resolvers/
// The re-export from resolvers.ts keeps this import path unchanged.
import { resolvers } from "../../../../lib/graphql/resolvers";
import { buildContext } from "../../../../lib/graphql/context";
import { MAX_DEPTH, validateQueryDepth, resetNodeCount, GraphQLError } from "../../../../lib/graphql/auth-guards";

const PLAYGROUND_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>GraphQL Playground</title>
  <meta charset=utf-8/>
  <meta name="viewport" content="user-scalable=no, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, minimal-ui">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/css/index.css"/>
  <link rel="shortcut icon" href="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/favicon.png"/>
  <script src="https://cdn.jsdelivr.net/npm/graphql-playground-react/build/static/js/middleware.js"></script>
</head>
<body>
  <div id="root"></div>
  <script>
    window.addEventListener('load', function() {
      GraphQLPlayground.init(document.getElementById('root'), {
        endpoint: '/api/graphql',
        settings: { 'editor.theme': 'dark' }
      });
    });
  </script>
</body>
</html>`;

// ─── Depth / complexity validation rule ────────────────────────────────────────

const complexityRule: ValidationRule = (ctx) => ({
  Field(node) {
    const depth = getDepth(node);
    if (depth > MAX_DEPTH) {
      ctx.reportError(
        new (require("graphql").GraphQLError)(
          `Query exceeds maximum depth of ${MAX_DEPTH}`,
          { nodes: node },
        ),
      );
    }
  },
});

function getDepth(node: any, d = 0): number {
  if (!node.selectionSet) return d;
  return Math.max(
    ...node.selectionSet.selections.map((s: any) => getDepth(s, d + 1)),
    d,
  );
}

// ─── Error formatting (aligned with REST middleware) ───────────────────────────

function formatError(err: any): Record<string, unknown> {
  // Align with StandardErrorResponse from error-handler.middleware.ts
  const code =
    err instanceof GraphQLError
      ? (err.extensions?.code as string) ?? "SERVER_ERROR"
      : "SERVER_ERROR";

  return {
    error: code,
    message: err.message || "Internal server error",
    ...(process.env.NODE_ENV !== "production" && err.stack
      ? { details: { stack: err.stack } }
      : {}),
  };
}

// ─── Handlers ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    return new Response(PLAYGROUND_HTML, {
      headers: { "Content-Type": "text/html" },
    });
  }
  return new Response(JSON.stringify({ message: "GraphQL endpoint. Use POST." }), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: Request) {
  let body: { query?: string; variables?: Record<string, unknown>; operationName?: string };

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ errors: [{ message: "Invalid JSON body" }] }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { query, variables, operationName } = body;

  if (!query) {
    return new Response(JSON.stringify({ errors: [{ message: "Missing query" }] }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Parse
  let document: DocumentNode;
  try {
    document = parse(query);
  } catch (err) {
    return new Response(
      JSON.stringify({ errors: [{ message: `Parse error: ${(err as Error).message}` }] }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Validate with depth/complexity limits
  const validationErrors = validate(schema, document, [complexityRule]);
  if (validationErrors.length > 0) {
    const formatted = validationErrors.map((e) => ({
      error: "VALIDATION_ERROR",
      message: e.message,
    }));
    return new Response(JSON.stringify({ errors: formatted }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  resetNodeCount();
  const context = buildContext(request);

  try {
    const result = await graphql({
      schema,
      source: query,
      rootValue: resolvers,
      contextValue: context,
      variableValues: variables,
      operationName,
    });

    // Format any errors in the result using REST-aligned structure
    if (result.errors) {
      const formatted = result.errors.map(formatError);
      return new Response(JSON.stringify({ ...result, errors: formatted }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const formatted = formatError(err);
    return new Response(JSON.stringify({ errors: [formatted] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

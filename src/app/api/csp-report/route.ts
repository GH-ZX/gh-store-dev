import { NextResponse } from "next/server";
import { log } from "@/lib/logging/logger";

/**
 * Collector for Content-Security-Policy violation reports.
 *
 * The report-only policy in `response-headers.ts` asks browsers to send here
 * every load that the future enforced policy would have blocked. This endpoint
 * is what makes that header a sensor rather than a decoration: without a
 * collector the reports go nowhere, and the enforcement decision would rest on
 * a guess again.
 *
 * Browsers post two shapes, both JSON: the legacy `report-uri` body wraps its
 * fields in a `csp-report` object, and the modern `report-to` delivery posts an
 * array of reports whose CSP payload sits in `body`. Both are accepted and
 * normalized, because the storefront's visitors answer the header question with
 * whatever browser they brought.
 *
 * Reports are evidence, not instructions: every string is truncated before it
 * reaches the log, and nothing here is ever rendered. A flood of forged reports
 * can at worst add noise to the log — they are never read by any code path,
 * only by the person deciding whether to tighten the policy.
 */

export const dynamic = "force-dynamic";

/** Reports are small documents; a larger body is not a browser. */
const MAX_BODY_BYTES = 16_384;

/** Longest string kept from any single report field. */
const FIELD_MAX = 300;

function truncate(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  return value.length > FIELD_MAX ? value.slice(0, FIELD_MAX) : value;
}

/** The fields worth keeping, whichever shape the browser sent. */
type Violation = {
  directive: string | undefined;
  blocked: string | undefined;
  documentUri: string | undefined;
  sourceFile: string | undefined;
  lineNumber: number | undefined;
  sample: string | undefined;
  disposition: string | undefined;
  statusCode: number | undefined;
};

function readLegacy(payload: Record<string, unknown>): Violation {
  const report = payload["csp-report"];
  const fields =
    report && typeof report === "object" && !Array.isArray(report)
      ? (report as Record<string, unknown>)
      : {};

  return {
    directive: truncate(fields["effective-directive"] ?? fields["violated-directive"]),
    blocked: truncate(fields["blocked-uri"]),
    documentUri: truncate(fields["document-uri"]),
    sourceFile: truncate(fields["source-file"]),
    lineNumber: typeof fields["line-number"] === "number" ? fields["line-number"] : undefined,
    sample: truncate(fields["sample"]),
    disposition: truncate(fields["disposition"]),
    statusCode: typeof fields["status-code"] === "number" ? fields["status-code"] : undefined,
  };
}

function readModern(payload: unknown): Violation {
  const first = Array.isArray(payload) ? payload[0] : payload;
  const report =
    first && typeof first === "object" && !Array.isArray(first)
      ? (first as Record<string, unknown>)
      : {};
  const body =
    report.body && typeof report.body === "object" && !Array.isArray(report.body)
      ? (report.body as Record<string, unknown>)
      : {};

  return {
    directive: truncate(body["effectiveDirective"] ?? body["violatedDirective"]),
    blocked: truncate(body["blockedURL"] ?? body["blockedUri"]),
    documentUri: truncate(body["documentURL"] ?? body["documentUri"]),
    sourceFile: truncate(body["sourceFile"]),
    lineNumber: typeof body["lineNumber"] === "number" ? body["lineNumber"] : undefined,
    sample: truncate(body["sample"]),
    disposition: truncate(body["disposition"]),
    statusCode: typeof body["statusCode"] === "number" ? body["statusCode"] : undefined,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  const length = Number(request.headers.get("content-length") ?? "0");

  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    // A body that is not JSON carries nothing worth keeping.
    return new NextResponse(null, { status: 204 });
  }

  const violation =
    payload !== null &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    "csp-report" in (payload as Record<string, unknown>)
      ? readLegacy(payload as Record<string, unknown>)
      : readModern(payload);

  log.warn("security", "csp_violation_reported", {
    directive: violation.directive,
    blocked: violation.blocked,
    documentUri: violation.documentUri,
    sourceFile: violation.sourceFile,
    lineNumber: violation.lineNumber,
    sample: violation.sample,
    disposition: violation.disposition,
    statusCode: violation.statusCode,
  });

  // 204 rather than a body: nothing here is ever rendered anywhere.
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

/** Explicit JSON-less answer for probes: this endpoint speaks only reports. */
export function GET(): NextResponse {
  return NextResponse.json({ ok: false, error: "method_not_allowed" }, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}

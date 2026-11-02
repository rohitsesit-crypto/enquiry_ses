// =============================================================================
// app/api/apps-script/route.ts   —  SERVER-SIDE APPS SCRIPT PROXY
// =============================================================================
// Why this exists: APPS_SCRIPT_URL has no NEXT_PUBLIC_ prefix, so it is a
// server-only variable and must never be shipped to the browser. This route
// runs on the server, reads the variable, and forwards the call to the Apps
// Script Web App.
//
// Apps Script specifics handled here:
//   * the body must be text/plain (application/json triggers a CORS preflight
//     that Apps Script refuses)
//   * the response is a 302 redirect, so redirect: 'follow' is required
//   * a misconfigured deployment answers with an HTML page, which is converted
//     into a readable JSON error instead of crashing the client
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Upstream call budget. Large attachment uploads need the longer window. */
const UPSTREAM_TIMEOUT_MS = 60_000;

function appsScriptUrl(): string {
  return (process.env.APPS_SCRIPT_URL || "").trim();
}

function missingUrlResponse() {
  return NextResponse.json(
    {
      success: false,
      message:
        "APPS_SCRIPT_URL is not configured on the server. Add it to .env.local " +
        "(or the deployment's environment variables) and restart the app.",
    },
    { status: 503 }
  );
}

export async function POST(request: NextRequest) {
  const url = appsScriptUrl();
  if (!url) return missingUrlResponse();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });

    const text = await upstream.text();

    try {
      return NextResponse.json(JSON.parse(text));
    } catch {
      return NextResponse.json(
        {
          success: false,
          message:
            "Apps Script did not return JSON. Re-deploy the Web App with " +
            '"Execute as: Me" and "Who has access: Anyone", then confirm ' +
            "APPS_SCRIPT_URL points at the /exec URL.",
        },
        { status: 502 }
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timedOut = /abort|timeout/i.test(message);
    return NextResponse.json(
      {
        success: false,
        message: timedOut
          ? "The Apps Script call timed out. Please try again."
          : `Could not reach Apps Script: ${message}`,
      },
      { status: 502 }
    );
  }
}

/** Health check: confirms the server can see the configured URL. */
export async function GET() {
  const url = appsScriptUrl();
  return NextResponse.json({
    success: true,
    configured: Boolean(url),
    message: url
      ? "Apps Script proxy is ready."
      : "APPS_SCRIPT_URL is not configured on the server.",
  });
}

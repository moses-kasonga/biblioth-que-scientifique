import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "bibliotheque-scientifique-web",
      timestamp: new Date().toISOString(),
      database: {
        configured: Boolean(process.env.DATABASE_URL),
        connected: false,
        note: "Database connectivity is not enabled in this foundation release."
      }
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

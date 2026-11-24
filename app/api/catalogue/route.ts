export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    {
      code: "CATALOGUE_NOT_CONNECTED",
      available: false,
      message:
        "The catalogue is not connected to its documentary database yet. No records are being returned."
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

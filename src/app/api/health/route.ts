import { checkDatabase } from "@/server/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await checkDatabase();
  return Response.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

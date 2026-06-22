import { NextResponse } from "next/server";
import { listJobs } from "../../../src/jobs";

// Lightweight read of background-job status for the UI indicator.
export async function GET() {
  try {
    const jobs = listJobs().map((j) => ({
      id: j.id,
      tool: j.tool,
      status: j.status,
      startedAt: j.startedAt,
      finishedAt: j.finishedAt,
    }));
    return NextResponse.json({ jobs });
  } catch (e: any) {
    return NextResponse.json({ jobs: [], error: e?.message }, { status: 200 });
  }
}

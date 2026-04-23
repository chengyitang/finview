import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDriveData, putDriveData } from "@/lib/drive";

export async function GET() {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const data = await getDriveData(session.accessToken);
  return NextResponse.json(data ?? {});
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  await putDriveData(body, session.accessToken);
  return NextResponse.json({ ok: true });
}

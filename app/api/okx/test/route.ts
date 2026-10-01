import { NextRequest, NextResponse } from "next/server";
import { OKX_BASE, okxHeaders, credsFromReq } from "@/lib/okx";

// Temporary debug endpoint — shows what the server received and what OKX returned
export async function GET(req: NextRequest) {
  const { key, secret, passphrase } = credsFromReq(req);

  const debug = {
    received: {
      keyLength: key.length,
      keyFirst4: key.slice(0, 4),
      keyLast4: key.slice(-4),
      secretLength: secret.length,
      passphraseLength: passphrase.length,
    },
    okxResponse: null as unknown,
  };

  if (!key || !secret || !passphrase) {
    return NextResponse.json({ ...debug, error: "Missing credentials" }, { status: 400 });
  }

  try {
    const path = "/api/v5/account/balance";
    const res = await fetch(OKX_BASE + path, {
      headers: okxHeaders("GET", path, key, secret, passphrase),
    });
    const data = await res.json();
    debug.okxResponse = data;
    return NextResponse.json(debug);
  } catch (err) {
    return NextResponse.json({ ...debug, error: err instanceof Error ? err.message : "fetch failed" });
  }
}

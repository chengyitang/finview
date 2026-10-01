import { createHmac } from "crypto";

export const OKX_BASE = "https://us.okx.com";

export function okxHeaders(
  method: string,
  path: string,
  key: string,
  secret: string,
  passphrase: string,
  body = ""
) {
  const ts = new Date().toISOString();
  const sign = createHmac("sha256", secret)
    .update(ts + method + path + body)
    .digest("base64");
  return {
    "OK-ACCESS-KEY": key,
    "OK-ACCESS-SIGN": sign,
    "OK-ACCESS-TIMESTAMP": ts,
    "OK-ACCESS-PASSPHRASE": passphrase,
    "Content-Type": "application/json",
  };
}

export function credsFromReq(req: Request) {
  return {
    key: (req.headers.get("x-okx-key") ?? "").trim(),
    secret: (req.headers.get("x-okx-secret") ?? "").trim(),
    passphrase: (req.headers.get("x-okx-passphrase") ?? "").trim(),
  };
}

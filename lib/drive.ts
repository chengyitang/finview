import { google } from "googleapis";

const FILE_NAME = "finview-data.json";
const SPACES = "appDataFolder";

function driveClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

async function findFile(drive: ReturnType<typeof google.drive>, name: string) {
  const res = await drive.files.list({
    spaces: SPACES,
    q: `name = '${name}'`,
    fields: "files(id)",
  });
  return res.data.files?.[0]?.id ?? null;
}

export async function getDriveData(accessToken: string): Promise<Record<string, unknown> | null> {
  const drive = driveClient(accessToken);
  const fileId = await findFile(drive, FILE_NAME);
  if (!fileId) return null;
  const res = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  return new Promise((resolve, reject) => {
    let raw = "";
    (res.data as NodeJS.ReadableStream).on("data", (chunk: Buffer) => { raw += chunk.toString(); });
    (res.data as NodeJS.ReadableStream).on("end", () => {
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    (res.data as NodeJS.ReadableStream).on("error", reject);
  });
}

export async function putDriveData(data: unknown, accessToken: string): Promise<void> {
  const drive = driveClient(accessToken);
  const body = JSON.stringify(data);
  const media = { mimeType: "application/json", body };
  const fileId = await findFile(drive, FILE_NAME);
  if (fileId) {
    await drive.files.update({ fileId, media });
  } else {
    await drive.files.create({
      requestBody: { name: FILE_NAME, parents: [SPACES] },
      media,
    });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createBackupClient } from "@/lib/supabase/backupAdmin";
import { SupabaseClient } from "@supabase/supabase-js";

// Vercel Cron hits this once a day (see vercel.json) to mirror every file in
// Storage (child-documents, entry-photos, household-documents) into a
// wholly separate Supabase project. Supabase's own daily database backups
// (Database > Backups) explicitly exclude Storage -- this is the only copy
// of uploaded documents/photos that exists outside the main project.
export const dynamic = "force-dynamic";

const BUCKETS = ["child-documents", "entry-photos", "household-documents"];

type Entry = { path: string; size: number };

// Storage .list() is one folder level at a time and paginated -- this walks
// every folder (every path here is "<userId>/<filename>", but written to
// cope with deeper nesting too) and returns every actual file, not folder,
// as a flat list of paths relative to the bucket root.
async function listAllFiles(client: SupabaseClient, bucket: string, prefix = ""): Promise<Entry[]> {
  const out: Entry[] = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit, offset });
    if (error) throw error;
    if (!data?.length) break;
    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // A folder entry has no id and no metadata.size; Supabase's own
      // convention for telling the two apart in a .list() result.
      if (item.id === null) {
        out.push(...(await listAllFiles(client, bucket, path)));
      } else {
        out.push({ path, size: item.metadata?.size ?? -1 });
      }
    }
    if (data.length < limit) break;
    offset += limit;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (!process.env.BACKUP_SUPABASE_URL || !process.env.BACKUP_SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, error: "Backup project not configured" }, { status: 500 });
  }

  const source = createAdminClient();
  const backup = createBackupClient();

  const { data: existingBuckets } = await backup.storage.listBuckets();
  const existingNames = new Set((existingBuckets ?? []).map((b) => b.name));

  const results: Record<string, { copied: number; skipped: number; failed: number }> = {};

  for (const bucket of BUCKETS) {
    if (!existingNames.has(bucket)) {
      await backup.storage.createBucket(bucket, { public: false });
    }

    const [sourceFiles, destFiles] = await Promise.all([listAllFiles(source, bucket), listAllFiles(backup, bucket)]);
    const destByPath = new Map(destFiles.map((f) => [f.path, f.size]));

    let copied = 0;
    let skipped = 0;
    let failed = 0;
    for (const file of sourceFiles) {
      // Same path and size already present -- nothing changed, no need to
      // re-transfer it tonight. Uploaded documents/photos are never edited
      // in place (every edit path writes a brand new path -- see
      // childDocuments.ts/photos.ts/householdDocuments.ts), so this is a
      // safe stand-in for a real content hash.
      if (destByPath.get(file.path) === file.size) {
        skipped++;
        continue;
      }
      try {
        const { data: blob, error: downloadError } = await source.storage.from(bucket).download(file.path);
        if (downloadError || !blob) throw downloadError || new Error("empty download");
        const { error: uploadError } = await backup.storage.from(bucket).upload(file.path, blob, {
          contentType: blob.type || undefined,
          upsert: true,
        });
        if (uploadError) throw uploadError;
        copied++;
      } catch {
        failed++;
      }
    }
    results[bucket] = { copied, skipped, failed };
  }

  return NextResponse.json({ ok: true, results });
}

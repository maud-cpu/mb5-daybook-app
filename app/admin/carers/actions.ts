"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

function randomPassword() {
  const words = [
    "otter", "maple", "harbor", "cedar", "willow", "amber", "granite", "meadow",
    "orbit", "quartz", "ember", "birch", "coral", "flint", "hazel", "linen",
  ];
  const pick = () => words[Math.floor(Math.random() * words.length)];
  return `${pick()}-${pick()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function createCarer(formData: FormData) {
  await requireAdmin();

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") || "").trim();
  if (!email) return { error: "Email is required." };

  const password = randomPassword();
  const admin = createAdminClient();

  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName || email.split("@")[0] },
  });

  if (error) return { error: error.message };

  revalidatePath("/admin/carers");
  return { success: true, email, password };
}

export async function removeCarer(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/carers");
  return { success: true };
}

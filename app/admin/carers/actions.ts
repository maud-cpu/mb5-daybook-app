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
  const { user, profile } = await requireAdmin();

  const email = String(formData.get("email") || "").trim().toLowerCase();
  const displayName = String(formData.get("displayName") || "").trim();
  const independentHousehold = formData.get("independentHousehold") === "on";
  if (!email) return { error: "Email is required." };

  const password = randomPassword();
  const admin = createAdminClient();

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName || email.split("@")[0] },
  });

  if (error) return { error: error.message };

  // The new-user trigger already created a bare profile row (role
  // 'carer', no household) -- for a co-carer that's exactly right, since
  // the column default only exists on the *shared* tables, not profiles
  // itself. An independent household needs its own admin role and to own
  // itself rather than the creating admin.
  if (independentHousehold) {
    await admin
      .from("profiles")
      .update({ household_owner_id: data.user!.id, role: "admin" })
      .eq("id", data.user!.id);
  } else {
    await admin
      .from("profiles")
      .update({ household_owner_id: profile.household_owner_id ?? user.id })
      .eq("id", data.user!.id);
  }

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

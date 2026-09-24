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
  const setup = String(formData.get("setup") || "cocarer");
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
  // 'carer', no household/content owner) -- for a co-carer that's exactly
  // right, since the column defaults only exist on the *shared* tables,
  // not profiles itself.
  //
  // household_owner_id decides who manages this person's carer list
  // (admin_carer_overview). content_owner_id decides whose shared
  // rates/training/rota/news they see -- the two only ever differ for
  // "ownHouseholdSharedContent": a separate family, running their own
  // household with their own admin, but still on the creating admin's
  // Surrey rates/training/rota rather than starting their own from
  // scratch. Migration 0053's write policies further require the literal
  // content owner's own auth.uid() to edit that shared content, so being
  // "admin" here never lets this person change rates/training/rota/news
  // that belong to someone else's content group -- only their own carers.
  const myHouseholdOwnerId = profile.household_owner_id ?? user.id;
  const myContentOwnerId = profile.content_owner_id ?? user.id;

  if (setup === "independent") {
    const newContentOwnerId = data.user!.id;
    await admin
      .from("profiles")
      .update({ household_owner_id: data.user!.id, content_owner_id: newContentOwnerId, role: "admin" })
      .eq("id", data.user!.id);

    // Not on Surrey's own rates/rota, so those start blank for them to
    // fill in themselves -- but the training catalogue is mostly generic
    // (safer caring, PACE, general fostering skills) and worth keeping,
    // minus whatever's specifically Surrey's own mandatory-training policy.
    await admin.from("shared_rates").insert({
      household_owner_id: newContentOwnerId,
      label: "Add your own rates",
      mileage: 0,
      daily_deduct: 0,
      hour_first: 0,
      hour_add: 0,
      day_first: { "0-4": 0, "5-10": 0, "11-13": 0, "14-18": 0 },
      day_add: { "0-4": 0, "5-10": 0, "11-13": 0, "14-18": 0 },
      overnight: { "0-4": 0, "5-10": 0, "11-13": 0, "14-18": 0 },
    });

    const { data: sharedCourses } = await admin
      .from("shared_training_catalog")
      .select(
        "group_key, group_label, title, how, platform, url, length, description, external_rating, external_rating_note, is_face_to_face, sort_order, archived",
      )
      .eq("household_owner_id", myContentOwnerId)
      .eq("surrey_only", false);
    if (sharedCourses?.length) {
      await admin
        .from("shared_training_catalog")
        .insert(sharedCourses.map((c) => ({ ...c, household_owner_id: newContentOwnerId, session_date: null })));
    }
  } else if (setup === "ownHouseholdSharedContent") {
    await admin
      .from("profiles")
      .update({ household_owner_id: data.user!.id, content_owner_id: myContentOwnerId, role: "admin" })
      .eq("id", data.user!.id);
  } else {
    await admin
      .from("profiles")
      .update({ household_owner_id: myHouseholdOwnerId, content_owner_id: myContentOwnerId })
      .eq("id", data.user!.id);
  }

  revalidatePath("/admin/carers");
  return { success: true, email, password };
}

export async function resetCarerPassword(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const password = randomPassword();
  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) return { error: error.message };
  return { success: true, password };
}

export async function removeCarer(userId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };
  revalidatePath("/admin/carers");
  return { success: true };
}

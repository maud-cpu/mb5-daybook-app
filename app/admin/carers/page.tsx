import { requireAdmin } from "@/lib/auth";
import AddCarerForm from "@/components/AddCarerForm";
import CarerList from "@/components/CarerList";

export default async function CarersPage() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.rpc("admin_all_accounts");

  return (
    <div style={{ marginTop: 12 }}>
      <AddCarerForm />
      {error ? (
        <p className="empty">Couldn&apos;t load the carer list: {error.message}</p>
      ) : (
        <CarerList carers={data ?? []} />
      )}
    </div>
  );
}

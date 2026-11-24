"use client";
import { RecordDisclosure } from "@/components/RecordDisclosure";
import { createApiClient } from "@/lib/api/client";
import { getAuthenticatedUser } from "@/modules/auth/services/auth-service";
export function AccountStatus() {
  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2">
      <RecordDisclosure
        label="My account"
        queryKey={["account", "me"]}
        load={getAuthenticatedUser}
      />
      <RecordDisclosure
        label="Service status"
        queryKey={["health"]}
        load={() => createApiClient().get("/health")}
      />
    </section>
  );
}

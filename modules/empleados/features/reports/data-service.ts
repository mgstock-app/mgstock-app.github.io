import type { SupabaseClient } from "@supabase/supabase-js";
import type { BrowserScope } from "@/utils/browser-scope";
import type { AppUser } from "@/types/access";
import { allowed } from "@/utils/permissions";
import { readReportCollection } from "@/utils/read-report-collection";
type Data = Record<string, unknown>;
type Snapshot = ReturnType<typeof snapshot>;
interface CollectionResult {
  docs: Snapshot[];
  empty: boolean;
  metadata: { fromCache: boolean };
}
interface Collection {
  doc: (id?: string) => DocumentRef;
  add: (data: Data) => Promise<DocumentRef>;
  orderBy: (key: string, direction?: string) => Collection;
  limit: (count: number) => Collection;
  get: () => Promise<CollectionResult>;
  onSnapshot: (
    callback: (data: CollectionResult) => void,
    onError?: (error: unknown) => void,
  ) => () => void;
}
interface DocumentRef {
  id: string;
  get: () => Promise<Snapshot>;
  set: (data: Data) => Promise<void>;
  update: (data: Data) => Promise<void>;
  delete: () => Promise<void>;
  onSnapshot: (
    callback: (data: Snapshot) => void,
    onError?: (error: unknown) => void,
  ) => () => void;
}
function snapshot(path: string, data?: Data) {
  return { id: path.split("/").at(-1)!, exists: !!data, data: () => data };
}
export function createReportServices(
  client: SupabaseClient,
  scope: BrowserScope,
  user: AppUser,
  organizationId: string,
) {
  if (user.role !== "admin" && user.role !== "owner")
    throw new Error(
      "El colaborador solo tiene acceso a la imagen de su reporte.",
    );
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  function watch<T>(
    read: () => Promise<T>,
    callback: (data: T) => void,
    onError?: (error: unknown) => void,
  ) {
    let active = true,
      busy = false;
    async function run() {
      if (!active || busy) return;
      busy = true;
      try {
        const data = await read();
        if (active) callback(data);
      } catch (error) {
        if (active) onError?.(error);
      } finally {
        busy = false;
      }
    }
    listeners.add(run);
    void run();
    const timer = scope.setInterval(run, 10000);
    const stop = () => {
      active = false;
      scope.clearInterval(timer);
      listeners.delete(run);
    };
    scope.onDispose(stop);
    return stop;
  }
  function doc(path: string) {
    const settings = path.startsWith("ajustes/");
    const table = settings ? "rm_app_settings" : "rm_test_documents";
    const identity = settings
      ? { owner_id: user.user_id, organization_id: organizationId, path }
      : { path, organization_id: organizationId };
    const stored = (data: Data) =>
      path.startsWith("copias/") ? { ...data, owner_id: user.user_id } : data;
    return {
      id: path.split("/").at(-1)!,
      async get() {
        const { data, error } = await client
          .from(table)
          .select("data")
          .match(identity)
          .maybeSingle();
        if (error) throw new Error("No se pudo consultar el reporte.");
        return snapshot(path, data?.data);
      },
      async set(data: Data) {
        const result = await client
          .from(table)
          .upsert(
            { ...identity, data: stored(data) },
            { onConflict: settings ? "owner_id,organization_id,path" : "path" },
          )
          .select("path")
          .single();
        if (result.error)
          throw new Error("No tenés permiso para guardar esta información.");
        notify();
      },
      async update(patch: Data) {
        const current = await this.get();
        if (!current.exists)
          throw new Error("La hoja no existe o no tenés acceso.");
        const result = await client
          .from(table)
          .update({ data: stored({ ...current.data(), ...patch }) })
          .match(identity)
          .select("path")
          .single();
        if (result.error)
          throw new Error(
            "No se pudo guardar. Actualizá la hoja y revisá tus permisos.",
          );
        notify();
      },
      async delete() {
        const { error, data } = await client
          .from(table)
          .delete()
          .match(identity)
          .select("path");
        if (error || !data?.length)
          throw new Error("No tenés permiso para eliminar este registro.");
        notify();
      },
      onSnapshot(
        callback: (data: ReturnType<typeof snapshot>) => void,
        onError?: (error: unknown) => void,
      ) {
        return watch(() => this.get(), callback, onError);
      },
    };
  }
  function collection(
    path: string,
    sort?: string,
    direction = "asc",
    limit = Number.POSITIVE_INFINITY,
  ): Collection {
    return {
      doc: (id = crypto.randomUUID().replaceAll("-", "")) =>
        doc(`${path}/${id}`),
      async add(data: Data) {
        const ref = this.doc();
        await ref.set(data);
        return ref;
      },
      orderBy: (key: string, dir = "asc") => collection(path, key, dir, limit),
      limit: (count: number) => collection(path, sort, direction, count),
      async get() {
        const rows = await readReportCollection(client, path, organizationId);
        if (sort)
          rows.sort((a, b) => {
            const x = (a.data[sort] ?? "") as string | number,
              y = (b.data[sort] ?? "") as string | number;
            return (
              (x < y ? -1 : x > y ? 1 : 0) * (direction === "desc" ? -1 : 1)
            );
          });
        const docs = rows
          .slice(0, limit)
          .map((row) => snapshot(row.path, row.data));
        return { docs, empty: !docs.length, metadata: { fromCache: false } };
      },
      onSnapshot(
        callback: (data: CollectionResult) => void,
        onError?: (error: unknown) => void,
      ) {
        return watch(() => this.get(), callback, onError);
      },
    };
  }
  const downloads = {
    async save({ filename, data }: { filename: string; data: BlobPart }) {
      if (
        !allowed(
          user.role,
          filename.endsWith(".json") ? "backups" : "export_reports",
        )
      )
        throw new Error("Descarga no habilitada.");
      const url = URL.createObjectURL(
        new Blob([data], {
          type: filename.endsWith(".pdf")
            ? "application/pdf"
            : filename.endsWith(".png")
              ? "image/png"
              : "application/json",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      scope.onDispose(() => URL.revokeObjectURL(url));
      scope.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
  return {
    async use(name: string) {
      if (name === "db") return { doc, collection };
      if (name === "downloads") return downloads;
      if (name === "user")
        return {
          isOwner: async () => true,
          canEdit: async () => true,
          can: async () => true,
        };
      if (name === "comments") return null;
      throw new Error("Servicio no disponible.");
    },
    async restore(copy: unknown) {
      const { error } = await client.rpc("rm_app_restore_organization", {
        p_copy: copy,
        p_org: organizationId,
      });
      if (error) throw new Error("No se pudo restaurar la copia.");
      notify();
    },
  };
}

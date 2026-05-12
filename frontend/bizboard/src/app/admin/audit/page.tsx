"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Clock,
  User as UserIcon,
} from "lucide-react";
import { api, ApiError } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { getErrorMessage } from "@/lib/errors";
import type { AuditLog, PagedResponse } from "@/types";

const PAGE_SIZE = 50;

export default function AdminAuditPage() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);

  const [page, setPage] = useState(0);
  const [data, setData] = useState<PagedResponse<AuditLog> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actorId, setActorId] = useState("");
  const [businessId, setBusinessId] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Sadece admin'lerin erisimine izin ver — backend zaten kontrol ediyor.
  useEffect(() => {
    if (profile && profile.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [profile, router]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("size", String(PAGE_SIZE));
    if (actorId) params.set("actor_id", actorId);
    if (businessId) params.set("business_id", businessId);
    if (action) params.set("action", action);
    if (entityType) params.set("entity_type", entityType);
    if (from) params.set("from", `${from}T00:00:00`);
    if (to) params.set("to", `${to}T23:59:59`);
    return params.toString();
  }, [page, actorId, businessId, action, entityType, from, to]);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get<PagedResponse<AuditLog>>(`/admin/audit-logs?${query}`);
        if (alive) setData(res);
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError) {
          setError(getErrorMessage(err));
        } else if (err instanceof Error) {
          setError(getErrorMessage(err));
        } else {
          setError("Audit log yuklenemedi");
        }
        logger.error("api", "Audit log fetch failed", undefined, err);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => {
      alive = false;
    };
  }, [query]);

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setPage(0);
  }

  function exportCsv() {
    if (!data) return;
    const header = [
      "occurred_at",
      "actor_username",
      "action",
      "entity_type",
      "entity_id",
      "business_id",
      "ip",
      "trace_id",
    ].join(",");
    const rows = data.items.map((r) =>
      [
        r.occurred_at,
        csvEscape(r.actor_username ?? ""),
        csvEscape(r.action),
        csvEscape(r.entity_type ?? ""),
        r.entity_id ?? "",
        r.business_id ?? "",
        csvEscape(r.ip ?? ""),
        r.trace_id ?? "",
      ].join(",")
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-[100dvh] bg-surface-900 text-white">
      <header className="sticky top-0 z-40 bg-surface-800/95 backdrop-blur-lg border-b border-surface-700">
        <div className="flex items-center gap-3 px-4 py-3 max-w-7xl mx-auto">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-2 rounded-xl hover:bg-surface-700"
            aria-label="Geri"
          >
            <ArrowLeft size={18} className="text-surface-300" />
          </button>
          <h1 className="text-lg font-bold">Audit Log</h1>
          <span className="ml-2 text-xs text-surface-400">
            {data?.total_elements != null ? `${data.total_elements} kayit` : ""}
          </span>
          <div className="ml-auto">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!data || data.items.length === 0}
              className="text-xs px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50"
            >
              CSV indir
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-4 max-w-7xl mx-auto">
        <form
          onSubmit={applyFilters}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mb-4"
        >
          <input
            type="text"
            placeholder="Actor user id"
            value={actorId}
            onChange={(e) => setActorId(e.target.value)}
            className="input-sm"
          />
          <input
            type="text"
            placeholder="Business id"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className="input-sm"
          />
          <input
            type="text"
            placeholder="Action (orn. user.login)"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="input-sm"
          />
          <input
            type="text"
            placeholder="Entity type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="input-sm"
          />
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="input-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-sm"
          />
          <button
            type="submit"
            className="col-span-1 sm:col-span-2 lg:col-span-6 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium flex items-center justify-center gap-2"
          >
            <Filter size={14} />
            Filtrele
          </button>
        </form>

        {error && (
          <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="border border-surface-700 rounded-xl overflow-hidden">
          <div className="bg-surface-800 text-[11px] text-surface-400 uppercase grid grid-cols-12 gap-2 px-3 py-2 border-b border-surface-700">
            <div className="col-span-3">Tarih</div>
            <div className="col-span-2">Aktör</div>
            <div className="col-span-3">Aksiyon</div>
            <div className="col-span-2">Hedef</div>
            <div className="col-span-2">IP</div>
          </div>

          {loading && (
            <div className="flex items-center justify-center py-10 text-surface-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          )}

          {!loading && data && data.items.length === 0 && (
            <p className="text-center text-surface-400 py-10 text-sm">
              Kayit bulunamadi
            </p>
          )}

          {!loading &&
            data?.items.map((r) => (
              <div key={r.id}>
                <button
                  type="button"
                  onClick={() => setExpanded((p) => (p === r.id ? null : r.id))}
                  className="w-full text-left grid grid-cols-12 gap-2 px-3 py-2 text-xs text-surface-200 hover:bg-surface-800 border-b border-surface-700"
                >
                  <div className="col-span-3 flex items-center gap-1.5">
                    <Clock size={12} className="text-surface-400" />
                    <span className="font-mono">{formatDt(r.occurred_at)}</span>
                  </div>
                  <div className="col-span-2 flex items-center gap-1.5 truncate">
                    <UserIcon size={12} className="text-surface-400" />
                    <span className="truncate">{r.actor_username ?? "—"}</span>
                  </div>
                  <div className="col-span-3 font-mono truncate">{r.action}</div>
                  <div className="col-span-2 truncate">
                    {r.entity_type ? `${r.entity_type}` : "—"}
                    {r.entity_id ? ` / ${shortId(r.entity_id)}` : ""}
                  </div>
                  <div className="col-span-2 font-mono text-surface-400 truncate">{r.ip ?? "—"}</div>
                </button>
                {expanded === r.id && (
                  <div className="bg-surface-800/60 border-b border-surface-700 px-4 py-3 text-xs">
                    <pre className="whitespace-pre-wrap break-all text-surface-300">
                      {JSON.stringify(
                        {
                          id: r.id,
                          trace_id: r.trace_id,
                          actor_user_id: r.actor_user_id,
                          business_id: r.business_id,
                          user_agent: r.user_agent,
                          metadata: r.metadata,
                        },
                        null,
                        2
                      )}
                    </pre>
                  </div>
                )}
              </div>
            ))}
        </div>

        {data && data.total_pages > 1 && (
          <div className="flex items-center justify-between mt-3 text-sm">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50"
            >
              <ChevronLeft size={14} />
              Onceki
            </button>
            <span className="text-xs text-surface-400">
              Sayfa {data.page + 1} / {data.total_pages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!data.has_next || loading}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-700 hover:bg-surface-600 disabled:opacity-50"
            >
              Sonraki
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function formatDt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes('"') || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

"use client";

/**
 * Ledger v2 (Faz C, §3.4 / TODO 3) — ADMIN Kâr-Payı Yönetimi.
 *
 * <p>İki bölüm: (1) Global config (sahip baz% / Fatih marj% / Tuncay spread%),
 * (2) Kâr-payı kuralları (listele / oluştur / düzenle / sil). Backend
 * {@code AdminProfitShareController} ({@code /admin/profit-share/**}) tüketilir;
 * yeni backend yok. İşletme-başına scope ({@code business_id} query-param).</p>
 *
 * <p>ADMIN-only (sayfa-içi guard + backend SecurityConfig + servis admin doğrular).
 * Çift tema (Daxa v2: v2-card / v2-token / .input), loading/empty/error, a11y.</p>
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  Percent,
  PlusCircle,
  Loader2,
  Building2,
  Sliders,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/errors";
import {
  listProfitShareRules,
  deleteProfitShareRule,
  getProfitShareConfig,
  updateProfitShareConfig,
} from "@/lib/api/profit-share";
import { ProfitShareRuleModal } from "@/components/admin/ProfitShareRuleModal";
import { PctField, RuleRow } from "@/components/admin/ProfitShareRuleRow";
import { ruleTypeLabel } from "@/components/admin/profit-share-meta";
import type {
  BankAccountListItem,
  Business,
  Counterpart,
  PosDeviceListItem,
  ProfitShareConfig,
  ProfitShareRule,
} from "@/types";

export default function AdminProfitSharePage() {
  const router = useRouter();
  const { profile } = useAppStore();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Kurallar + config (seçili işletme).
  const [rules, setRules] = useState<ProfitShareRule[]>([]);
  const [config, setConfig] = useState<ProfitShareConfig | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Lookup'lar (kural form'u için).
  const [counterparts, setCounterparts] = useState<Counterpart[]>([]);
  const [accounts, setAccounts] = useState<BankAccountListItem[]>([]);
  const [devices, setDevices] = useState<PosDeviceListItem[]>([]);

  // Config form (string input → parse on save).
  const [ownerPct, setOwnerPct] = useState("");
  const [fatihPct, setFatihPct] = useState("");
  const [tuncayPct, setTuncayPct] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Modal + silme onayı.
  const [modalRule, setModalRule] = useState<ProfitShareRule | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProfitShareRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = profile?.role === "admin";

  // Admin değilse yönlendir.
  useEffect(() => {
    if (profile && profile.role !== "admin") router.push("/dashboard");
  }, [profile, router]);

  // İşletme listesi.
  useEffect(() => {
    api
      .get<Business[]>("/businesses")
      .then((list) => {
        setBusinesses(list || []);
        if (list && list.length > 0) setSelectedId(list[0].id);
      })
      .catch((e) => toast.error(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const loadForBusiness = useCallback(async (businessId: string) => {
    setLoadingData(true);
    setDataError(null);
    try {
      const [rulesData, configData, cpData, acctData, devData] = await Promise.all([
        listProfitShareRules(businessId),
        getProfitShareConfig(businessId),
        api
          .get<Counterpart[]>(
            `/counterparts?businessId=${encodeURIComponent(businessId)}`,
          )
          .catch(() => [] as Counterpart[]),
        api
          .get<BankAccountListItem[]>("/bank-accounts")
          .catch(() => [] as BankAccountListItem[]),
        api
          .get<PosDeviceListItem[]>("/pos-devices")
          .catch(() => [] as PosDeviceListItem[]),
      ]);
      setRules(rulesData || []);
      setConfig(configData);
      setOwnerPct(configData?.owner_base_pct != null ? String(configData.owner_base_pct) : "");
      setFatihPct(configData?.fatih_margin_pct != null ? String(configData.fatih_margin_pct) : "");
      setTuncayPct(configData?.tuncay_spread_pct != null ? String(configData.tuncay_spread_pct) : "");
      setCounterparts(cpData || []);
      // Hedef kâr-merkezi kasası seçili işletmeye ait olmalı (backend de doğrular).
      setAccounts(
        (acctData || []).filter(
          (a) => a.business_id == null || a.business_id === businessId,
        ),
      );
      setDevices((devData || []).filter((d) => d.is_active));
    } catch (e) {
      setDataError(getErrorMessage(e));
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadForBusiness(selectedId);
  }, [selectedId, loadForBusiness]);

  function parsePct(raw: string, label: string): number | null {
    const parsed = Number(raw.replace(",", "."));
    if (raw.trim() === "" || !Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      toast.error(`${label} 0 ile 100 arasında geçerli bir sayı olmalı.`);
      return null;
    }
    return parsed;
  }

  async function handleSaveConfig() {
    if (!selectedId) return;
    const owner = parsePct(ownerPct, "Sahip baz oranı");
    if (owner == null) return;
    const fatih = parsePct(fatihPct, "Fatih marj oranı");
    if (fatih == null) return;
    const tuncay = parsePct(tuncayPct, "Tuncay spread oranı");
    if (tuncay == null) return;

    setSavingConfig(true);
    try {
      const saved = await updateProfitShareConfig(selectedId, {
        owner_base_pct: owner,
        fatih_margin_pct: fatih,
        tuncay_spread_pct: tuncay,
      });
      setConfig(saved);
      setOwnerPct(String(saved.owner_base_pct));
      setFatihPct(String(saved.fatih_margin_pct));
      setTuncayPct(String(saved.tuncay_spread_pct));
      toast.success("Kâr-payı config kaydedildi");
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || !selectedId) return;
    setDeleting(true);
    try {
      await deleteProfitShareRule(selectedId, deleteTarget.id);
      toast.success("Kural silindi");
      setDeleteTarget(null);
      loadForBusiness(selectedId);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  function openCreate() {
    setModalRule(null);
    setShowModal(true);
  }

  function openEdit(rule: ProfitShareRule) {
    setModalRule(rule);
    setShowModal(true);
  }

  const configDirty = useMemo(() => {
    if (!config) return false;
    return (
      ownerPct !== String(config.owner_base_pct) ||
      fatihPct !== String(config.fatih_margin_pct) ||
      tuncayPct !== String(config.tuncay_spread_pct)
    );
  }, [config, ownerPct, fatihPct, tuncayPct]);

  if (!isAdmin) return null;

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => router.push("/admin")}
          className="v2-icon-btn"
          aria-label="Admin paneline dön"
        >
          <ChevronLeft size={20} className="text-accent-strong dark:text-accent" />
        </button>
        <div className="flex items-center gap-2.5">
          <Percent size={24} className="text-accent-strong dark:text-accent" />
          <h1 className="text-2xl v2-display">Kâr-Payı Yönetimi</h1>
        </div>
      </div>
      <p className="text-sm text-[rgb(var(--v2-muted))] mb-6 ml-12">
        POS kâr-payı kuralları ve global oran config&apos;i (sahip% / Fatih% /
        Tuncay%). İşletme-başına yönetilir; sadece admin değiştirebilir.
      </p>

      {loading ? (
        <div className="py-10 flex justify-center">
          <Loader2 size={20} className="animate-spin text-[rgb(var(--v2-muted))]" />
        </div>
      ) : businesses.length === 0 ? (
        <div className="v2-card p-8 text-center text-[rgb(var(--v2-muted))]">
          İşletme bulunamadı.
        </div>
      ) : (
        <div className="space-y-5">
          {/* İşletme seçimi */}
          <div className="v2-card p-5">
            <label className="block text-sm font-medium text-[rgb(var(--v2-ink))] mb-2" htmlFor="ps-business">
              <span className="inline-flex items-center gap-2">
                <Building2 size={15} className="text-[rgb(var(--v2-muted))]" /> İşletme
              </span>
            </label>
            <select
              id="ps-business"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="input w-full"
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {dataError && (
            <div
              className="p-4 rounded-xl border border-status-danger/40 bg-status-danger/10 text-status-danger text-sm"
              role="alert"
            >
              {dataError}
            </div>
          )}

          {loadingData ? (
            <div className="py-8 flex justify-center">
              <Loader2 size={18} className="animate-spin text-[rgb(var(--v2-muted))]" />
            </div>
          ) : (
            <>
              {/* ── Global config ──────────────────────────── */}
              <div className="v2-card p-5">
                <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))] mb-1 inline-flex items-center gap-2">
                  <Sliders size={16} className="text-accent-strong dark:text-accent" /> Global Oran Config
                </h2>
                <p className="text-[11px] text-[rgb(var(--v2-muted))] mb-4 leading-relaxed">
                  Kuralda override girilmezse bu oranlar kullanılır. Tümü yüzde
                  (0–100).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <PctField
                    id="ps-owner"
                    label="Sahip Baz %"
                    hint="RATE_SPREAD/MARGIN_PCT marj temeli"
                    value={ownerPct}
                    onChange={setOwnerPct}
                  />
                  <PctField
                    id="ps-fatih"
                    label="Fatih Marj %"
                    hint="MARGIN_PCT çarpanı"
                    value={fatihPct}
                    onChange={setFatihPct}
                  />
                  <PctField
                    id="ps-tuncay"
                    label="Tuncay Spread %"
                    hint="OWNER_COMMISSION baz oranı"
                    value={tuncayPct}
                    onChange={setTuncayPct}
                  />
                </div>

                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig || !configDirty}
                  className="mt-4 w-full v2-btn v2-btn--accent v2-press !py-2.5"
                >
                  {savingConfig && <Loader2 size={16} className="animate-spin" />}
                  {savingConfig ? "Kaydediliyor..." : "Config Kaydet"}
                </button>
              </div>

              {/* ── Kurallar ──────────────────────────────── */}
              <div className="v2-card overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-[rgb(var(--v2-border))]">
                  <div className="flex items-center gap-2.5">
                    <Percent size={18} className="text-accent-strong dark:text-accent" />
                    <h2 className="text-sm font-bold text-[rgb(var(--v2-ink))]">
                      Kâr-Payı Kuralları
                    </h2>
                    <span className="text-xs text-[rgb(var(--v2-muted))]">({rules.length})</span>
                  </div>
                  <button
                    onClick={openCreate}
                    className="v2-btn v2-btn--accent v2-press !py-2 !px-3 text-sm"
                  >
                    <PlusCircle size={16} /> Yeni Kural
                  </button>
                </div>

                {rules.length === 0 ? (
                  <div className="p-8 text-center text-[rgb(var(--v2-muted))] text-sm">
                    Bu işletmede henüz kâr-payı kuralı yok. &quot;Yeni Kural&quot; ile
                    ekleyin.
                  </div>
                ) : (
                  <ul className="divide-y divide-[rgb(var(--v2-border))]">
                    {rules.map((rule) => (
                      <RuleRow
                        key={rule.id}
                        rule={rule}
                        onEdit={() => openEdit(rule)}
                        onDelete={() => setDeleteTarget(rule)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Kural modal'ı */}
      {showModal && selectedId && (
        <ProfitShareRuleModal
          open={showModal}
          businessId={selectedId}
          rule={modalRule}
          counterparts={counterparts}
          accounts={accounts}
          devices={devices}
          onClose={() => setShowModal(false)}
          onSaved={() => loadForBusiness(selectedId)}
        />
      )}

      {/* Silme onayı */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Kuralı sil onayı"
        >
          <div className="modal-surface rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-[rgb(var(--v2-ink))] mb-2">Kuralı Sil</h3>
            <p className="text-[rgb(var(--v2-muted))] text-sm mb-6">
              <span className="text-[rgb(var(--v2-ink))] font-medium">
                {ruleTypeLabel(String(deleteTarget.rule_type))}
              </span>
              {deleteTarget.operator_name ? ` · ${deleteTarget.operator_name}` : ""} kuralını
              silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 v2-btn v2-press !py-2.5 border border-[rgb(var(--v2-border))] bg-[rgb(var(--v2-sunken))] text-[rgb(var(--v2-ink))] hover:border-accent/50"
              >
                İptal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 v2-btn v2-press !py-2.5 bg-status-danger hover:bg-status-danger/90 text-white"
              >
                {deleting && <Loader2 size={15} className="animate-spin" />}
                Sil
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

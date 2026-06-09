"use client";

import { useState, useEffect } from "react";
import {
  Plus, Users, X, Loader2, Phone, CreditCard, Calendar,
  ChevronRight, UserMinus, UserCheck, Trash2, Edit3,
  AlertTriangle, Briefcase, Shield,
} from "lucide-react";
import { api } from "@/lib/api/client";
import { logger } from "@/lib/logger";
import { useAppStore } from "@/lib/store";
import { formatMoneyInput, parseMoneyInput } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";
import type { Employee, EmployeeSummary } from "@/types";

function formatMoney(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("tr-TR", {
    day: "numeric", month: "long", year: "numeric",
  });
}

interface Props {
  businessId: string;
  currency?: string;
}

export function PersonnelModule({ businessId, currency = "TRY" }: Props) {
  const { refreshKey, triggerRefresh } = useAppStore();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [summary, setSummary] = useState<EmployeeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Employee | null>(null);
  const [editTarget, setEditTarget] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    fetchData();
  }, [businessId, refreshKey]);

  async function fetchData() {
    setLoading(true);
    try {
      const [empData, sumData] = await Promise.all([
        api.get<Employee[]>(`/businesses/${businessId}/employees`),
        api.get<EmployeeSummary>(`/businesses/${businessId}/employees/summary`),
      ]);
      setEmployees(empData || []);
      setSummary(sumData || null);
    } catch (err) {
      logger.error("api", "Personnel fetch error", undefined, err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = showInactive
    ? employees
    : employees.filter((e) => e.is_active);

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surface-600 rounded-xl" />
          ))}
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-surface-600 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <>
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          <div className="p-3 bg-blue-500/15 border border-blue-500/30 rounded-xl text-center">
            <p className="text-[10px] text-blue-300 uppercase tracking-wider font-medium">Personel</p>
            <p className="text-lg font-bold text-blue-300 mt-0.5">
              {summary.active_employees}
              {summary.total_employees !== summary.active_employees && (
                <span className="text-xs font-normal text-blue-400">
                  /{summary.total_employees}
                </span>
              )}
            </p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center">
            <p className="text-[10px] text-amber-300 uppercase tracking-wider font-medium">Maas</p>
            <p className="text-sm font-bold text-amber-400 mt-0.5">
              {formatMoney(summary.total_salary)} {currency}
            </p>
          </div>
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-center">
            <p className="text-[10px] text-red-300 uppercase tracking-wider font-medium">Toplam</p>
            <p className="text-sm font-bold text-red-400 mt-0.5">
              {formatMoney(summary.total_cost)} {currency}
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showInactive
                ? "bg-surface-600 text-surface-200"
                : "bg-surface-700 text-surface-400"
            }`}
          >
            {showInactive ? "Tumunu Goster" : "Sadece Aktif"}
          </button>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors"
        >
          <Plus size={16} />
          Personel Ekle
        </button>
      </div>

      {/* Employee List */}
      {filtered.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <Users size={32} className="mx-auto text-surface-300 mb-2" />
          <p className="text-surface-400 text-sm">Henuz personel eklenmemis</p>
          <p className="text-surface-400 text-xs mt-1">
            Ilk personeli eklemek icin yukaridaki butonu kullanin
          </p>
        </div>
      ) : (
        <div className="glass-card divide-y divide-surface-700">
          {filtered.map((emp) => (
            <div
              key={emp.id}
              onClick={() => setDetailTarget(emp)}
              className="flex items-center gap-3 p-4 hover:bg-surface-700 transition-colors cursor-pointer group"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                emp.is_active ? "bg-blue-500/15" : "bg-surface-700"
              }`}>
                <Users size={18} className={emp.is_active ? "text-blue-300" : "text-surface-400"} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium truncate ${
                    emp.is_active ? "text-white" : "text-surface-400 line-through"
                  }`}>
                    {emp.full_name}
                  </p>
                  {!emp.is_active && (
                    <span className="px-1.5 py-0.5 bg-surface-700 text-surface-400 text-[10px] rounded-full">
                      Pasif
                    </span>
                  )}
                </div>
                <p className="text-xs text-surface-400 mt-0.5">
                  {emp.position || "Pozisyon belirtilmemis"}
                  {emp.start_date && ` · ${formatDate(emp.start_date)}`}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-white">
                  {formatMoney(emp.total_cost)} {currency}
                </p>
                <p className="text-[10px] text-surface-400">
                  Maas: {formatMoney(emp.salary)}
                </p>
              </div>

              <ChevronRight size={16} className="text-surface-300 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreateEmployeeModal
          businessId={businessId}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchData(); triggerRefresh(); }}
        />
      )}

      {/* Detail Modal */}
      {detailTarget && (
        <EmployeeDetailModal
          employee={detailTarget}
          currency={currency}
          onClose={() => setDetailTarget(null)}
          onEdit={() => { setDetailTarget(null); setEditTarget(detailTarget); }}
          onToggleActive={async () => {
            try {
              await api.patch(`/employees/${detailTarget.id}/toggle-active`);
              toast.success("Personel durumu güncellendi");
              setDetailTarget(null);
              fetchData();
              triggerRefresh();
            } catch (err) {
              logger.error("api", "Personnel toggle-active failed", undefined, err);
              toast.error(err);
            }
          }}
          onDelete={() => { setDetailTarget(null); setDeleteTarget(detailTarget); }}
        />
      )}

      {/* Edit Modal */}
      {editTarget && (
        <CreateEmployeeModal
          businessId={businessId}
          employee={editTarget}
          onClose={() => setEditTarget(null)}
          onCreated={() => { setEditTarget(null); fetchData(); triggerRefresh(); }}
        />
      )}

      {/* Delete Modal */}
      {deleteTarget && (
        <DeleteEmployeeModal
          employee={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); fetchData(); triggerRefresh(); }}
        />
      )}
    </>
  );
}

// ── Employee Detail Modal ──────────────────────────────────
function EmployeeDetailModal({
  employee,
  currency,
  onClose,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  employee: Employee;
  currency: string;
  onClose: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-700">
          <h3 className="text-lg font-semibold text-white">Personel Detayi</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-700 transition-colors">
            <X size={18} className="text-surface-400" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Name & Status Banner */}
          <div className={`rounded-xl p-5 text-center ${
            employee.is_active
              ? "bg-blue-500/15 border border-blue-500/30"
              : "bg-surface-700 border border-surface-600"
          }`}>
            <p className={`text-xl font-bold ${employee.is_active ? "text-blue-300" : "text-surface-400"}`}>
              {employee.full_name}
            </p>
            <p className="text-sm text-surface-400 mt-1">
              {employee.position || "Pozisyon belirtilmemis"}
            </p>
            {!employee.is_active && (
              <span className="inline-block mt-2 px-2 py-0.5 bg-surface-600 text-surface-400 text-xs rounded-full">
                Pasif Personel
              </span>
            )}
          </div>

          {/* Cost Breakdown */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 bg-amber-500/10 rounded-xl text-center">
              <p className="text-[10px] text-amber-300 uppercase tracking-wider font-medium">Maas (Brut)</p>
              <p className="text-sm font-bold text-amber-400 mt-0.5">
                {formatMoney(employee.salary)} {currency}
              </p>
            </div>
            <div className="p-3 bg-purple-500/10 rounded-xl text-center">
              <p className="text-[10px] text-purple-300 uppercase tracking-wider font-medium">SGK</p>
              <p className="text-sm font-bold text-purple-300 mt-0.5">
                {formatMoney(employee.insurance_cost)} {currency}
              </p>
            </div>
            <div className="p-3 bg-red-500/10 rounded-xl text-center">
              <p className="text-[10px] text-red-300 uppercase tracking-wider font-medium">Toplam</p>
              <p className="text-sm font-bold text-red-400 mt-0.5">
                {formatMoney(employee.total_cost)} {currency}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="space-y-3">
            {employee.tc_no && (
              <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                <CreditCard size={16} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">TC Kimlik No</p>
                  <p className="text-sm text-white font-medium">{employee.tc_no}</p>
                </div>
              </div>
            )}

            {employee.phone && (
              <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                <Phone size={16} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Telefon</p>
                  <p className="text-sm text-white font-medium">{employee.phone}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                <Calendar size={14} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Ise Baslama</p>
                  <p className="text-sm text-white font-medium">
                    {formatDate(employee.start_date)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2 p-3 bg-surface-700 rounded-xl">
                <Calendar size={14} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Isten Ayrilis</p>
                  <p className="text-sm text-white font-medium">
                    {employee.end_date ? formatDate(employee.end_date) : "Devam Ediyor"}
                  </p>
                </div>
              </div>
            </div>

            {employee.notes && (
              <div className="flex items-start gap-3 p-3 bg-surface-700 rounded-xl">
                <Briefcase size={16} className="text-surface-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] text-surface-400 uppercase tracking-wider">Notlar</p>
                  <p className="text-sm text-white">{employee.notes}</p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 bg-surface-700 hover:bg-surface-600 text-surface-200 rounded-xl text-sm font-medium transition-colors">
              Kapat
            </button>
            <button onClick={onEdit} className="px-4 py-2.5 bg-brand-500/15 hover:bg-brand-500/25 text-brand-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5">
              <Edit3 size={14} />
              Duzenle
            </button>
            <button
              onClick={onToggleActive}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5 ${
                employee.is_active
                  ? "bg-orange-500/10 hover:bg-orange-500/20 text-orange-300"
                  : "bg-green-500/10 hover:bg-green-500/20 text-green-300"
              }`}
            >
              {employee.is_active ? <UserMinus size={14} /> : <UserCheck size={14} />}
              {employee.is_active ? "Pasif Yap" : "Aktif Yap"}
            </button>
            <button onClick={onDelete} className="px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-300 rounded-xl text-sm font-medium transition-colors flex items-center gap-1.5">
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create / Edit Employee Modal ───────────────────────────
function CreateEmployeeModal({
  businessId,
  employee,
  onClose,
  onCreated,
}: {
  businessId: string;
  employee?: Employee;
  onClose: () => void;
  onCreated: () => void;
}) {
  const isEdit = !!employee;
  const [fullName, setFullName] = useState(employee?.full_name || "");
  const [position, setPosition] = useState(employee?.position || "");
  const [tcNo, setTcNo] = useState(employee?.tc_no || "");
  const [phone, setPhone] = useState(employee?.phone || "");
  const [salary, setSalary] = useState(employee?.salary?.toString() || "");
  const [insuranceCost, setInsuranceCost] = useState(employee?.insurance_cost?.toString() || "");
  const [startDate, setStartDate] = useState(employee?.start_date || "");
  const [endDate, setEndDate] = useState(employee?.end_date || "");
  const [notes, setNotes] = useState(employee?.notes || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) return;

    setSaving(true);
    setError(null);

    const body = {
      full_name: fullName.trim(),
      position: position.trim() || null,
      tc_no: tcNo.trim() || null,
      phone: phone.trim() || null,
      salary: salary ? parseMoneyInput(salary) : 0,
      insurance_cost: insuranceCost ? parseMoneyInput(insuranceCost) : 0,
      start_date: startDate || null,
      end_date: endDate || null,
      notes: notes.trim() || null,
    };

    try {
      if (isEdit) {
        await api.put(`/employees/${employee.id}`, body);
        toast.success("Personel güncellendi");
      } else {
        await api.post(`/businesses/${businessId}/employees`, body);
        toast.success("Personel eklendi");
      }
      onCreated();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Bir hata olustu"));
      toast.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h3 className="text-lg font-bold text-white">
            {isEdit ? "Personel Duzenle" : "Yeni Personel"}
          </h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-700">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Ad Soyad */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">
              Ad Soyad
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Personel adi"
              className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                         placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                         focus:border-transparent transition-all"
            />
          </div>

          {/* Pozisyon */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">
              Pozisyon / Gorev
            </label>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="Ornegin: Muhasebeci, Sofor, vb."
              className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                         placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                         focus:border-transparent transition-all"
            />
          </div>

          {/* Maas & SGK */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1.5">
                Maas (Brut)
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={salary}
                onChange={(e) => setSalary(formatMoneyInput(e.target.value))}
                placeholder="0"
                className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                           placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                           focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1.5">
                SGK Bedeli
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={insuranceCost}
                onChange={(e) => setInsuranceCost(formatMoneyInput(e.target.value))}
                placeholder="0"
                className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                           placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                           focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* TC & Telefon */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1.5">
                TC Kimlik No
              </label>
              <input
                type="text"
                value={tcNo}
                onChange={(e) => setTcNo(e.target.value)}
                placeholder="TC No"
                maxLength={11}
                className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                           placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                           focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1.5">
                Telefon
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="05XX XXX XXXX"
                className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                           placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                           focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Tarihler */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1.5">
                Ise Baslama Tarihi
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                           focus:outline-none focus:ring-2 focus:ring-brand-500
                           focus:border-transparent transition-all"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-200 mb-1.5">
                Isten Ayrilis Tarihi
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                           focus:outline-none focus:ring-2 focus:ring-brand-500
                           focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Not */}
          <div>
            <label className="block text-sm font-medium text-surface-200 mb-1.5">
              Notlar
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ek bilgiler, notlar..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-surface-600 bg-surface-800 text-white
                         placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500
                         focus:border-transparent transition-all resize-none"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl font-medium text-surface-200 bg-surface-700 hover:bg-surface-600 transition-colors"
            >
              Vazgec
            </button>
            <button
              type="submit"
              disabled={saving || !fullName.trim()}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:bg-brand-300 transition-colors flex items-center justify-center gap-2"
            >
              {saving ? (
                <><Loader2 size={18} className="animate-spin" /> Kaydediliyor...</>
              ) : isEdit ? (
                "Guncelle"
              ) : (
                <><Plus size={18} /> Ekle</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete Employee Modal ──────────────────────────────────
function DeleteEmployeeModal({
  employee,
  onClose,
  onDeleted,
}: {
  employee: Employee;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    setError(null);
    try {
      await api.delete(`/employees/${employee.id}`);
      toast.info("Personel silindi");
      onDeleted();
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Personel silinirken bir hata olustu"));
      toast.error(err);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="glass-card shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
              <AlertTriangle size={16} className="text-red-300" />
            </div>
            <h3 className="text-lg font-bold text-white">Personeli Sil</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-surface-700">
            <X size={20} className="text-surface-400" />
          </button>
        </div>

        <div className="p-4">
          <div className="bg-surface-700 rounded-xl p-3 mb-4">
            <p className="text-sm font-medium text-white">{employee.full_name}</p>
            <p className="text-xs text-surface-400 mt-0.5">
              {employee.position || "Pozisyon belirtilmemis"} · Toplam Maliyet: {formatMoney(employee.total_cost)} TL
            </p>
          </div>

          <p className="text-sm text-surface-300 mb-4">
            Bu personeli silmek istediginize emin misiniz? Bu islem geri alinamaz.
            Personeli pasif yapmak daha guvenli bir secenektir.
          </p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-3 rounded-xl font-medium text-surface-200 bg-surface-700 hover:bg-surface-600 transition-colors">
              Vazgec
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex-1 py-3 rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 transition-colors flex items-center justify-center gap-2"
            >
              {isDeleting ? <><Loader2 size={18} className="animate-spin" /> Siliniyor...</> : <><Trash2 size={18} /> Sil</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

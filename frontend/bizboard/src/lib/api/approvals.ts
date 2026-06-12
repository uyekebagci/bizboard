/**
 * Onay (Approval) modülü v1.1 — Onay Kuyruğu API istemcisi.
 *
 * Backend uçları {@code /approvals/**} altında, ADMIN-only + STRICT tenant-scope.
 * verify-code'un kendisi DTO'da DÖNMEZ; yalnız verify_required/verified bayrakları.
 */

import { api } from "@/lib/api/client";

export type ApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED";

export interface Approval {
  id: string;
  business_id: string;
  business_name: string | null;
  action_type: string;
  title: string;
  payload: Record<string, unknown> | null;
  status: ApprovalStatus;
  requested_by: string | null;
  requested_by_name: string | null;
  approver: string | null;
  approver_name: string | null;
  reason: string | null;
  verify_required: boolean;
  verified: boolean;
  /** Bu onay için Telegram'a (en az bir admin sohbetine) buton-mesajı gönderildi mi? */
  telegram_sent: boolean;
  expires_at: string | null;
  created_at: string | null;
  decided_at: string | null;
}

export interface CreateApprovalBody {
  business_id: string;
  action_type: string;
  title?: string;
  payload?: Record<string, unknown>;
  require_verify_code?: boolean;
  expires_in_minutes?: number | null;
}

export interface BulkApproveResult {
  id: string;
  status: "APPROVED" | "SKIPPED";
  message?: string;
}

/** Onay Kuyruğu — status filtresi opsiyonel (verilmezse hepsi). */
export function listApprovals(status?: ApprovalStatus): Promise<Approval[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return api.get<Approval[]>(`/approvals${q}`);
}

export function getApproval(id: string): Promise<Approval> {
  return api.get<Approval>(`/approvals/${encodeURIComponent(id)}`);
}

export function createApproval(body: CreateApprovalBody): Promise<Approval> {
  return api.post<Approval>("/approvals", body);
}

export function approveApproval(id: string, reason?: string): Promise<Approval> {
  return api.post<Approval>(`/approvals/${encodeURIComponent(id)}/approve`, {
    reason: reason ?? undefined,
  });
}

export function rejectApproval(id: string, reason: string): Promise<Approval> {
  return api.post<Approval>(`/approvals/${encodeURIComponent(id)}/reject`, {
    reason,
  });
}

export function cancelApproval(id: string, reason?: string): Promise<Approval> {
  return api.post<Approval>(`/approvals/${encodeURIComponent(id)}/cancel`, {
    reason: reason ?? undefined,
  });
}

export function verifyApprovalCode(id: string, code: string): Promise<Approval> {
  return api.post<Approval>(
    `/approvals/${encodeURIComponent(id)}/verify-code`,
    { code }
  );
}

export function bulkApprove(
  ids: string[],
  reason?: string
): Promise<{ results: BulkApproveResult[] }> {
  return api.post<{ results: BulkApproveResult[] }>("/approvals/bulk-approve", {
    ids,
    reason: reason ?? undefined,
  });
}

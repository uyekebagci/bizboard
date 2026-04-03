"use client";

import { useState } from "react";
import {
  Plus, Receipt, Camera, FolderOpen, Package, BarChart3,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FileUploadModal } from "@/components/shared/FileUploadModal";

const actions = [
  {
    label: "Islem Ekle",
    icon: Receipt,
    color: "text-brand-600",
    bg: "bg-brand-50",
    href: "/dashboard/add-transaction",
  },
  {
    label: "Envanter",
    icon: Package,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    href: "/dashboard/inventory",
  },
  {
    label: "Dosya Yukle",
    icon: Camera,
    color: "text-amber-600",
    bg: "bg-amber-50",
    href: "__upload__",
  },
  {
    label: "Finans",
    icon: BarChart3,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    href: "/dashboard/finance",
  },
  {
    label: "Belgeler",
    icon: FolderOpen,
    color: "text-purple-600",
    bg: "bg-purple-50",
    href: "/dashboard/documents",
  },
  {
    label: "Isletme Ekle",
    icon: Plus,
    color: "text-surface-300",
    bg: "bg-surface-700",
    href: "/dashboard/add",
    alwaysLast: true,
  },
];

export function QuickActions() {
  const router = useRouter();
  const [showUploadModal, setShowUploadModal] = useState(false);

  return (
    <>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => {
                if (action.href === "__upload__") {
                  setShowUploadModal(true);
                } else {
                  router.push(action.href);
                }
              }}
              className="flex flex-col items-center gap-1.5 p-3 rounded-2xl hover:bg-white/10 transition-all group active:scale-95"
            >
              <div
                className={`w-11 h-11 rounded-2xl ${action.bg} flex items-center justify-center
                           group-hover:scale-105 transition-transform`}
              >
                <Icon size={20} className={action.color} />
              </div>
              <span className="text-[11px] font-medium text-surface-300 group-hover:text-green-400 leading-tight text-center transition-colors">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>

      {showUploadModal && (
        <FileUploadModal
          onClose={() => setShowUploadModal(false)}
          onUploaded={() => {}}
        />
      )}
    </>
  );
}

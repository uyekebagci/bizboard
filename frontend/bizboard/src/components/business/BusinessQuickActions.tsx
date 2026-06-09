"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, FileText, Camera, FolderOpen } from "lucide-react";
import { useRouter } from "next/navigation";
import { FileUploadModal } from "@/components/shared/FileUploadModal";

interface Props {
  businessId: string;
}

export function BusinessQuickActions({ businessId }: Props) {
  const router = useRouter();
  const [showUploadModal, setShowUploadModal] = useState(false);

  const actions = [
    {
      label: "Gelir",
      icon: ArrowDownLeft,
      color: "text-green-300",
      bg: "bg-green-500/10",
      href: `/dashboard/add-transaction?type=income&business=${businessId}`,
    },
    {
      label: "Gider",
      icon: ArrowUpRight,
      color: "text-red-300",
      bg: "bg-red-500/10",
      href: `/dashboard/add-transaction?type=expense&business=${businessId}`,
    },
    {
      label: "Dosya",
      icon: Camera,
      color: "text-amber-300",
      bg: "bg-amber-500/15",
      href: "__upload__",
    },
    {
      label: "Belgeler",
      icon: FolderOpen,
      color: "text-purple-300",
      bg: "bg-purple-500/10",
      href: `/dashboard/documents?business=${businessId}`,
    },
    {
      label: "Rapor",
      icon: FileText,
      color: "text-brand-300",
      bg: "bg-brand-500/15",
      href: `/dashboard/reports?business=${businessId}`,
    },
  ];

  return (
    <>
      <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
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
              className="flex flex-col items-center gap-1.5 min-w-[72px] group"
            >
              <div
                className={`w-12 h-12 rounded-2xl ${action.bg} flex items-center justify-center
                           group-hover:scale-105 group-active:scale-95 transition-transform`}
              >
                <Icon size={22} className={action.color} />
              </div>
              <span className="text-xs font-medium text-surface-600">
                {action.label}
              </span>
            </button>
          );
        })}
      </div>

      {showUploadModal && (
        <FileUploadModal
          preselectedBusinessId={businessId}
          onClose={() => setShowUploadModal(false)}
          onUploaded={() => {}}
        />
      )}
    </>
  );
}

"use client";

/**
 * v1.6.23.22 (UI Fix WP TODO 9fff2618): eski "Hesap Havuzu" sayfası /dashboard/hesaplar'a
 * taşındı. Bu route geriye dönük uyumluluk için redirect yapar (eski bookmark/link'ler
 * için).
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HesapHavuzuRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/hesaplar");
  }, [router]);
  return null;
}

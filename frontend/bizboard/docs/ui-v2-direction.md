# Çatı UI v2 — Yön Dokümanı (Daxa / "Overview Panel" dili)

> Durum: ÖNERİ + TEMEL KURULDU. Referans sayfa kullanıcı onayı bekliyor.
> Onaydan sonra broad rollout (aşağıdaki sayfa-grupları dalga dalga).

## 0. Neden değişiyoruz — glass'tan vazgeçtik

Mevcut tasarım `backdrop-filter: blur()` tabanlı "glass" (cam) diline dayanıyordu
(`.glass-card`, `.popover-surface`, `.sidebar-glass`, ambient `app-bg::before`).
Sorunlar:

- **Floaty / yıkanmış his:** yarı-saydam yüzeyler arkadaki içeriği sızdırıyor,
  veri-yoğun finans tablolarında kontrast düşüyor.
- **Performans:** çok sayıda `backdrop-filter` katmanı mobilde pahalı.
- **Mobil zayıf:** ambient gradient + blur kombinasyonu küçük ekranda gürültü.

Yeni yön: **solid, katmanlı, AIRY ama veri-yoğun** — blur YOK; derinlik = ince
border + yumuşak çok-katmanlı gölge + yüzey hiyerarşisi. Somut referans: **Daxa
"Overview Panel"** estetiği.

## 1. Görsel dil — net spec

### Zemin & yüzey hiyerarşisi (blur yerine derinlik)
| Katman | Light | Dark | Kullanım |
|--------|-------|------|----------|
| App zemini | açık-gri `#f0f1f3` | koyu `#0e1012` | sayfa arka planı (kartlardan AYRI) |
| Kart yüzeyi | net beyaz `#ffffff` | `#17191c` | metrik kartı, panel |
| Alt-yüzey / chip | `#f4f5f7` | `#202327` | kart içi segment/etiket |
| Border | `#e6e8ec` (ince) | `#26292e` | yüzey ayrımı |

- **Radius:** kartlar büyük yuvarlak — `--radius-card: 20px` (`rounded-[20px]`).
  Küçük öğeler 12px, pill'ler full.
- **Gölge:** çok-katmanlı yumuşak — `--shadow-card` (yakın + uzak iki katman),
  hover'da `--shadow-card-hover` (daha derin + hafif lift). Blur YOK.
- **Tek bir accent + nötr iskelet:** kart iskeleti nötr (beyaz/gri/siyah-metin),
  renk yalnızca accent + status (gelir/gider/uyarı) için.

### Accent paleti — lime-yeşil + siyah (token-bazlı, değiştirilebilir)
- `--accent` = lime-yeşil `#84cc16` (highlight), `--accent-bright` `#a3e635`
  (ilerleme arkı/aktif), `--accent-strong` `#65a30d` (light'ta metin kontrastı).
- **Siyah** = vurgu: dev başlık metni, primary buton zemini (light'ta), aktif chip.
- **Anlam:** yeşil = ilerleme / aktif / pozitif highlight; siyah = vurgu metin/buton.
- Tüm accent CSS değişkeni → **kullanıcı tonu sonradan tek yerden değiştirir.**
- Brand indigo (`#5c7cfa`) SİLİNMEDİ — broad rollout'a kadar yan yana durur;
  v2 yüzeyleri accent yeşili kullanır, eski yüzeyler brand'i.

### Tipografi & spacing ölçeği
- **Display başlık (DEV bold):** `.v2-display` — `text-3xl/4xl font-extrabold`,
  `letter-spacing: -0.03em` ("Overview Panel" gibi büyük + sıkı).
- **Metrik sayısı (DEV bold):** `.v2-metric` — `text-4xl/5xl font-extrabold`,
  `font-variant-numeric: tabular-nums`. Para/% büyük ve okunur.
- **Etiket:** `.v2-eyebrow` — küçük, uppercase, `tracking-wide`, muted.
- **Spacing ölçeği:** 4 / 8 / 12 / 16 / 20 / 24 / 32 (Tailwind 1/2/3/4/5/6/8);
  kart iç padding `p-5 sm:p-6`, kartlar arası `gap-4 sm:gap-5`.

## 2. Bileşen motifleri (Daxa)

| Motif | Bileşen | Spec |
|-------|---------|------|
| Metrik kartı | `MetricCard` | büyük sayı (count-up) + delta chip + alt SegmentBar |
| Segment mini-bar | `SegmentBar` | yeşil/siyah/gri segmentler, kart altında ince şerit |
| Yarım-daire gauge | `GaugeArc` | yeşil ilerleme arkı + uç nokta (knob), merkezde değer |
| İnce bar-chart | `BarChartMini` | nötr barlar + 1 yeşil highlight bar |
| Stack insight kartları | `StackInsightCard` | üst üste katmanlı (derinlik) insight kartları |
| AI-asistan paneli | `AssistantPanel` (motif) | avatar + mesaj balonu + input (sağ kolon opsiyonel) |

Hepsi **dark + light** token-bazlı, **reduced-motion** saygılı.

## 3. MOTION sistemi

Yeni bağımlılık YOK — mevcut stack (Tailwind + CSS + küçük React util'leri).
framer-motion eklenmedi (bundle + zaten CSS yeterli; ileride gerekirse ADR ile).

| Hareket | Mekanizma | Süre / easing |
|---------|-----------|---------------|
| Kart giriş (stagger) | `Reveal` + CSS `v2-rise` + `--rd` delay var | 0.5s, `cubic-bezier(.2,.7,.2,1)`, sıra×60ms |
| Sayı count-up | `AnimatedNumber` (rAF, easeOutCubic) | ~0.9s, formatCurrency uyumlu |
| Gauge / bar büyüme | CSS `v2-grow` / stroke-dashoffset | 0.7s ease |
| Hover lift | `.v2-lift` (translateY + gölge) | 0.25s |
| Micro (chip/buton) | `.v2-press` transform | 0.12s |
| Sayfa geçiş | `v2-fade-up` (route content) | 0.3s |

**Erişilebilirlik:** `prefers-reduced-motion: reduce` → tüm `v2-*` animasyonları
kapanır; `AnimatedNumber` son değere anında atlar (`useReducedMotion` hook).

## 4. Güçlü responsive / mobil

Çatı'nın mobil görünümü zayıftı. v2 mobile-first kurallar:

- **Metrik grid:** `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4` (asla mobilde
  sıkışık 2-col değil — `StatsRow` zaafı giderildi).
- **Kart radius/padding mobilde küçülür:** `rounded-[16px] sm:rounded-[20px]`,
  `p-4 sm:p-6`.
- **Tablolar:** masaüstü tablo + `<sm` kart-stack varyantı (`.v2-table-stack`)
  ya da `overflow-x-auto` + sticky ilk kolon.
- **Filtre/aksiyon barı:** `flex-wrap` zorunlu (taşma yok).
- **Bottom nav + safe-area** korunur; FAB en sık aksiyon.
- **Tipografi:** display mobilde `text-3xl`, ≥sm `text-4xl`; metrik `text-4xl`→`5xl`.

## 5. Rollout planı (onay sonrası dalga dalga)

**FAZ 0 — TEMEL (bu PR, TAMAM):** token'lar + motion util + primitive bileşenler
+ referans dashboard showcase. Mevcut sayfalar DOKUNULMADI.

**Dalga 1 — Ana yüzeyler:** Dashboard ana sayfa (showcase → canlı), Sidebar/TopBar
shell, işletme grid.
**Dalga 2 — Finans çekirdeği:** Finans Merkezi, Nakit, Konsolide pozisyon,
POS-kâr, Aylık kâr, Gün-kapanışı/variance.
**Dalga 3 — Liste/tablo sayfaları:** Transactions, Çek-senet, Krediler, Cariler,
Alacaklar, Telefonlar (tablo→v2-table-stack).
**Dalga 4 — Admin & ikincil:** Admin (audit, telegram, recurring, alerts),
bildirimler, hatırlatıcılar, belge-tarama, e-fatura, envanter.
**Dalga 5 — Modallar & form katmanı:** modal-surface → v2 solid, form-control
cilası, popover/dropdown.

Her dalga: ayrı coder, çift tema + işlevsellik korunur kuralıyla, ayrı branch.

## 6. STRICT kurallar (her dalga için)
- Çift tema (dark default + light + toggle) korunur.
- Mevcut işlevsellik bozulmaz — yalnız görsel/motion katmanı.
- `prefers-reduced-motion` saygısı.
- Brand→accent geçişi token üzerinden; tek dosyadan ton değişebilir.
- FE `npm run build` temiz. Conventional commit. PUSH YOK → guardian merge.

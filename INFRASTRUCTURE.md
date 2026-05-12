# Altyapı & Hosting Planı

> Durum: Araştırma aşamasında — henüz uygulanmadı

---

## Proje Envanteri

| Proje | Tür | Kullanıcı / Trafik |
|-------|-----|-------------------|
| BizBoard | Multi-tenant iş yönetim paneli | 5-6 kullanıcı, ~100 işlem/gün |
| E-ticaret platformu | Dinamik web uygulaması | ~50 ziyaretçi/gün |
| Tanıtım siteleri (2-3 adet) | Statik / basit sayfalar | Düşük trafik |

---

## TODO: Sunucu Seçimi

### Önerilen: Hetzner CX22

- [ ] [hetzner.com](https://www.hetzner.com/cloud) adresinden CX22 planını incele
- [ ] Datacenter konumu seç: **Nürnberg** veya **Helsinki** (Türkiye'ye en yakın)
- [ ] Specs: **2 vCPU / 4GB RAM / 40GB SSD**
- [ ] Tahmini maliyet: **~€4.5/ay**

**Neden CX22 yeterli?**

| Servis | RAM Tahmini | CPU (ortalama) |
|--------|-------------|----------------|
| Spring Boot (BizBoard backend) | ~400MB | <%5 |
| Next.js (BizBoard frontend) | ~300MB | <%5 |
| E-ticaret uygulaması | ~500MB | <%10 |
| PostgreSQL | ~200MB | <%5 |
| OS + Nginx | ~300MB | - |
| **Toplam** | **~1.7GB** | **<%25** |

4GB RAM ile %50 boşluk kalıyor. Kapasite dolduğunda Hetzner panelinden **tek tıkla CX32'ye** (4 vCPU / 8GB, ~€8/ay) yükseltmek mümkün — downtime yok.

### Alternatifler

| Sağlayıcı | Plan | Fiyat/ay | Not |
|-----------|------|----------|-----|
| Contabo | VPS S (4 vCPU / 8GB) | ~€5.9 | Ucuz ama destek zayıf |
| DigitalOcean | Basic 2vCPU/4GB | ~$24 | Panel çok iyi, pahalı |
| Vultr | 2vCPU/4GB | ~$20 | DigitalOcean alternatifi |

---

## TODO: Mimari Kurulum

### Statik Siteler → Cloudflare Pages (Ücretsiz)

- [ ] Tanıtım sitelerini Cloudflare Pages'e deploy et
- [ ] [pages.cloudflare.com](https://pages.cloudflare.com) — ücretsiz plan yeterli
- [ ] Avantaj: Sunucuya hiç yük bindirmiyor, CDN ile globalde hızlı

### Dinamik Projeler → VPS

```
┌─────────────────────────────────────────┐
│           Hetzner CX22                  │
│                                         │
│  Cloudflare (DNS + SSL + Cache)         │
│       ↓                                 │
│  Nginx (reverse proxy)                  │
│    ├── bizboard.domain.com  → :3000     │
│    ├── eticaret.domain.com  → :3001     │
│    └── ...                              │
│                                         │
│  PostgreSQL (tek instance)              │
│    ├── db_bizboard                      │
│    └── db_eticaret                      │
│                                         │
│  PM2 (process manager)                  │
│    ├── bizboard-backend (Spring Boot)   │
│    ├── bizboard-frontend (Next.js)      │
│    └── eticaret-app                     │
└─────────────────────────────────────────┘
```

- [ ] Nginx kur ve her domain için reverse proxy config yaz
- [ ] Cloudflare'i DNS sağlayıcı olarak ayarla (ücretsiz SSL + DDoS koruması)
- [ ] PM2 ile tüm Node.js süreçlerini yönet (`pm2 startup` ile sistem açılışında otomatik başlat)
- [ ] PostgreSQL'de her proje için ayrı database oluştur (tek instance, ayrı DB'ler)
- [ ] Nginx'te SSL termination yap (Cloudflare origin certificate)

---

## TODO: Read Performansı Optimizasyonu

> Şu an için gerekli değil. BizBoard büyüdükçe bu sırayla uygula.

### Aşama 1 — Hemen yapılabilir (maliyetsiz)

- [ ] PostgreSQL index'lerini ekle:
  - `transactions` tablosunda `business_id`, `date`, `direction` kolonlarına
  - `inventory` tablosunda `business_id`, `category` kolonlarına
- [ ] Spring Boot'ta `@Query` sorgularını `EXPLAIN ANALYZE` ile kontrol et
- [ ] Next.js `staleTimes` config'i zaten eklendi ✅

### Aşama 2 — İhtiyaç halinde

- [ ] **PgBouncer** kur (connection pooling)
  - Spring Boot her request'te yeni connection açmasın
  - Kurulum: `apt install pgbouncer`, Spring Boot datasource URL'ini güncelle
- [ ] **Redis** ekle (response cache)
  - Dashboard summary verileri için (portfolio, stats) — bunlar sık sorgulanıp az değişiyor
  - Spring Boot `@Cacheable` annotation ile kolay entegrasyon

### Aşama 3 — Çok büyüdüğünde

- [ ] Read replica (PostgreSQL streaming replication)
- [ ] CDN üzerinden statik asset cache (Cloudflare zaten yapıyor)

---

## TODO: Deployment Pipeline

- [ ] GitHub Actions ile CI/CD kur
  - `main` branch'e push → otomatik sunucuya deploy
  - Spring Boot: `mvn package` → JAR → sunucuya SCP → PM2 restart
  - Next.js: `npm run build` → sunucuya sync → PM2 restart
- [ ] `.env` dosyaları için sunucuda güvenli secret yönetimi (GitHub Secrets veya Hetzner'de manuel)
- [ ] Otomatik PostgreSQL backup kur (günlük `pg_dump` → Hetzner Object Storage veya B2)

---

## TODO: Monitoring

- [ ] **UptimeRobot** (ücretsiz) — site ayakta mı kontrolü, e-posta bildirimi
- [ ] Sunucu kaynak takibi için Hetzner panel grafiklerini takip et (CPU/RAM/disk)
- [ ] İleride gerekirse **Grafana + Prometheus** stack'i

---

## Özet Aksiyon Listesi

1. [ ] Hetzner CX22 kirala (~€4.5/ay)
2. [ ] Cloudflare'e domain ekle (DNS + ücretsiz SSL)
3. [ ] Sunucuya Ubuntu 22.04 kur, Nginx + PostgreSQL + Java 21 + Node.js 20 kur
4. [ ] BizBoard backend ve frontend'i deploy et
5. [ ] Tanıtım sitelerini Cloudflare Pages'e taşı
6. [ ] PM2 ile process yönetimini kur
7. [ ] Otomatik backup'ı kur
8. [ ] PostgreSQL index optimizasyonlarını yap

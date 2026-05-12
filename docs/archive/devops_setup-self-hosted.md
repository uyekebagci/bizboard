# BizBoard — DevOps Kurulum ve İşletim Rehberi

> **Hedef Okuyucu:** DevOps mühendisi (1 kişi).
> **Bu döküman sağlayıcıdan bağımsızdır.** Herhangi bir bulut/VPS sağlayıcısı veya on-premise sunucu üzerinde uygulanabilir; bahsedilen tüm bileşenler standart Linux/Docker araçlarıdır.
> **Hedef:** BizBoard'ı 2 makineli mimaride (frontend ayrı, backend ayrı), eşzamanlı test ortamıyla, sıfır veri kaybı garantisiyle production'a çıkarmak.

---

## 0. Bağlam ve Tasarım Kararları

| Bağlam | Karar |
|--------|-------|
| Kullanıcı sayısı | Az (~10-50, şirket içi çalışan) |
| Trafik | Düşük (saatte ~100-500 istek) |
| Operatör | 1 teknik kişi |
| Bütçe | Minimum, ama veri güvenliğinden ödün yok |
| Ana risk | **Veri kaybı** (muhasebe verisi, geri dönülemez) |
| İkincil ihtiyaç | Prod-mirror test ortamı, prod'u etkilemeden çalışabilme |
| Frontend/Backend ayrımı | **İki ayrı makine** — frontend public, backend internal |
| Uptime hedefi | 99.5% (haftada ~50dk downtime tolere edilebilir, internal tool) |
| **RPO** (max kabul edilebilir veri kaybı) | **≤ 5 dakika** |
| **RTO** (max kabul edilebilir kesinti) | **≤ 2 saat** |

**Kasten kapsam dışı bırakılanlar (gereksiz kompleksite):**
- ❌ Kubernetes — 1 operatör için aşırı
- ❌ Multi-region active-active
- ❌ Microservice ayrımı
- ❌ Service mesh / API gateway
- ❌ HA database cluster — bunun yerine sağlam multi-layer backup

**Yapılanlar:**
- ✅ İki makineli mimari (frontend public-facing, backend internal)
- ✅ Docker Compose orkestrasyonu
- ✅ Reverse proxy + otomatik HTTPS
- ✅ **Çok katmanlı backup** (5 farklı yer, 3 farklı medya)
- ✅ Snapshot bazlı test refresh
- ✅ Otomatik restore drill (aylık)
- ✅ Inter-machine private network + sıkı firewall

---

## İçindekiler

1. [Mimari Genel Bakış (2 Makineli)](#1-mimari-genel-bakış-2-makineli)
2. [Sunucu Gereksinimleri ve Kaynak Planlaması](#2-sunucu-gereksinimleri-ve-kaynak-planlaması)
3. [Inter-Machine Networking — Frontend ↔ Backend Bağlantısı](#3-inter-machine-networking--frontend--backend-bağlantısı)
4. [İlk Makine Kurulumu (İkisi İçin Ortak Hardening)](#4-i̇lk-makine-kurulumu-i̇kisi-i̇çin-ortak-hardening)
5. [Frontend Makinesi — Detaylı Kurulum](#5-frontend-makinesi--detaylı-kurulum)
6. [Backend Makinesi — Detaylı Kurulum](#6-backend-makinesi--detaylı-kurulum)
7. [PostgreSQL Konfigürasyonu](#7-postgresql-konfigürasyonu)
8. [Reverse Proxy ve Otomatik HTTPS](#8-reverse-proxy-ve-otomatik-https)
9. [DNS ve Domain Yapılandırması](#9-dns-ve-domain-yapılandırması)
10. [⭐ Backup Stratejisi — Sıfır Veri Kaybı](#10--backup-stratejisi--sıfır-veri-kaybı)
11. [⭐ Test Ortamı — Multi-Machine İzolasyon](#11--test-ortamı--multi-machine-i̇zolasyon)
12. [⭐ Test Verisi Senkronizasyonu (Prod → Test)](#12--test-verisi-senkronizasyonu-prod--test)
13. [Restore Drill (Aylık Otomatik Doğrulama)](#13-restore-drill-aylık-otomatik-doğrulama)
14. [Disaster Recovery — Senaryo Bazlı Prosedürler](#14-disaster-recovery--senaryo-bazlı-prosedürler)
15. [CI/CD Pipeline](#15-cicd-pipeline)
16. [Database Migration (Flyway)](#16-database-migration-flyway)
17. [Monitoring ve Alerting](#17-monitoring-ve-alerting)
18. [Logging Pipeline](#18-logging-pipeline)
19. [Güvenlik Hardening](#19-güvenlik-hardening)
20. [Time Sync ve Cross-Machine Koordinasyon](#20-time-sync-ve-cross-machine-koordinasyon)
21. [Production Smoke Test ve Go-Live](#21-production-smoke-test-ve-go-live)
22. [Operatör Görev Listesi (Günlük/Haftalık/Aylık)](#22-operatör-görev-listesi-günlükhaftalıkaylık)
23. [Kurulum Checklist — Sıfırdan Tamama](#23-kurulum-checklist--sıfırdan-tamama)
24. [Production Readiness — Son Kontrol Listesi](#24-production-readiness--son-kontrol-listesi)

---

## 1. Mimari Genel Bakış (2 Makineli)

```
                               ┌───────────────────────────┐
                               │   DNS + CDN sağlayıcısı   │
                               │   (proxy/cache opsiyonel) │
                               └────────────┬──────────────┘
                                            │
                         ┌──────────────────┼──────────────────────┐
                         │                  │                      │
                  app.alanadi.com    test.alanadi.com       api.alanadi.com / test-api.alanadi.com
                         │                  │                      │
                         └──────────────────┼──────────────────────┘
                                            │ HTTPS (443) — Let's Encrypt
                                            │
              ┌─────────────────────────────▼──────────────────────────────┐
              │              FRONTEND MAKİNESİ (public IP)                  │
              │  ┌───────────────────────────────────────────────────────┐ │
              │  │  Reverse proxy (otomatik HTTPS + basic auth test'te)  │ │
              │  └────────────┬──────────────────┬───────────────────────┘ │
              │               │                  │                         │
              │     ┌─────────▼───────┐  ┌──────▼──────┐                  │
              │     │ Next.js (prod)  │  │ Next.js     │                  │
              │     │  port 3000      │  │ (test)      │                  │
              │     │                 │  │  port 3001  │                  │
              │     └─────────────────┘  └─────────────┘                  │
              │               │                  │                         │
              │               │  /api/* istekleri reverse proxy ile        │
              │               │  backend makinesine yönlendirilir          │
              └───────────────┼──────────────────┼─────────────────────────┘
                              │                  │
                              │  PRIVATE NETWORK / VPN — 10.0.0.0/24      │
                              │  (public internet'e açık DEĞİL)            │
                              │                  │
              ┌───────────────▼──────────────────▼─────────────────────────┐
              │              BACKEND MAKİNESİ (private IP)                  │
              │  ┌──────────────────┐    ┌──────────────────┐               │
              │  │ Spring Boot API  │    │ Spring Boot API  │               │
              │  │   (prod)         │    │   (test)         │               │
              │  │   port 8080      │    │   port 8081      │               │
              │  └────────┬─────────┘    └─────────┬────────┘               │
              │           │                        │                        │
              │  ┌────────▼────────┐    ┌──────────▼───────┐                │
              │  │ PostgreSQL prod │    │ PostgreSQL test  │                │
              │  │ (volume A)      │    │ (volume B)       │                │
              │  └────────┬────────┘    └──────────────────┘                │
              │           │                                                  │
              │  ┌────────▼──────────────────────────────────┐               │
              │  │  pgBackRest (WAL + full + incremental)    │               │
              │  │   → local volume cache                    │               │
              │  └────────┬──────────────────────────────────┘               │
              │           │ saatlik sync                                    │
              │           ▼                                                  │
              │  ┌──────────────────────────────────────────┐               │
              │  │  Off-site obje depolama (S3-uyumlu)      │ ◄── şifreli   │
              │  └──────────────────────────────────────────┘               │
              └─────────────────────────────────────────────────────────────┘
                                                                            │
              ┌────────────────────────────────────────────────────────────▼┐
              │  Offline/cold backup (manuel haftalık — şifreli external HDD)│
              └──────────────────────────────────────────────────────────────┘
```

### 1.1 Topolojinin Mantığı

| Karar | Gerekçe |
|-------|---------|
| **Frontend ayrı makinede (public IP)** | Tek public-facing katman; saldırı yüzeyi sadece statik Next.js + reverse proxy |
| **Backend ayrı makinede (private IP)** | Veri ve iş mantığı internet'ten doğrudan erişilemez; sadece frontend üzerinden geçer |
| **DB backend makinesinde, ayrı container** | Düşük gecikme (aynı host), kolay yedek; ileride managed DB'ye geçiş kolay |
| **Tek public giriş = frontend makinesi** | DDoS, port tarama, brute force backend'e ulaşamaz |
| **Prod ve test aynı makinelerde, ayrı stack'ler** | Maliyet düşük, izolasyon Docker network + ayrı port + ayrı volume ile sağlanır |

### 1.2 Trafik Akışı

**Tarayıcıdan API'ye gidiş:**
```
Browser
   │ HTTPS
   ▼
DNS → Frontend Makine public IP
   │
   ▼
Reverse proxy → "api.alanadi.com" hostname matched
   │
   │ private network (örn: 10.0.0.0/24)
   ▼
Backend Makine private IP : 8080
   │
   ▼
Spring Boot API → PostgreSQL (localhost)
```

**Önemli güvenlik özelliği:** Backend makinesinin port 8080'i **public internete asla açılmaz**. Frontend makinesi tek erişim noktasıdır.

---

## 2. Sunucu Gereksinimleri ve Kaynak Planlaması

### 2.1 Minimum Spesifikasyonlar

| Makine | CPU | RAM | SSD | Ek Volume | Bant Genişliği |
|--------|-----|-----|-----|-----------|----------------|
| **Frontend** | 2 vCPU | 2 GB | 40 GB | — | Aylık 1+ TB |
| **Backend** | 2-4 vCPU | 4 GB | 80 GB | 100 GB (backup için) | Aylık 1+ TB |

### 2.2 Önerilen Spesifikasyonlar (Konforlu)

| Makine | CPU | RAM | SSD | Ek Volume |
|--------|-----|-----|-----|-----------|
| **Frontend** | 2 vCPU | 4 GB | 80 GB | — |
| **Backend** | 4 vCPU | 8 GB | 160 GB | 200 GB |

### 2.3 İşletim Sistemi

- **Ubuntu Server 24.04 LTS** veya **Debian 12** (her ikisi de uzun süreli destekli)
- 64-bit
- Türkiye saat dilimi: `Europe/Istanbul`

### 2.4 Disk Yapısı (Backend Makinesi)

Backend makinesinde **ayrı bir blok cihaz** olarak ek volume tutmak kritik:

```
/                          → 80 GB ana SSD (OS, Docker, çalışan container'lar)
/mnt/data                  → 100+ GB ek volume:
   ├── postgres/prod-data/    (PostgreSQL prod verisi)
   ├── postgres/test-data/    (PostgreSQL test verisi)
   ├── pgbackrest/            (lokal yedek deposu)
   ├── dumps/                 (pg_dump dosyaları)
   ├── uploads/prod/          (kullanıcı yüklemeleri prod)
   └── uploads/test/          (kullanıcı yüklemeleri test)
```

**Avantajları:**
- Ana SSD bozulursa veri ayrı diskte
- Volume sağlayıcıdan kolayca büyütülebilir
- Volume snapshot alınabilir (sağlayıcı destekliyorsa)
- VM yeniden kurulduğunda volume taşınabilir

### 2.5 Off-site Depolama

Backup için S3-uyumlu obje depolama servisi gereklidir. Aranan özellikler:
- S3 API uyumluluğu (yaygın CLI/SDK desteği)
- Sunucu tarafında şifreleme veya bizim tarafta GPG şifreleme yeterli
- Versiyonlama desteği (immutability — ransomware koruması)
- Düşük indirme ücreti (restore senaryosu için önemli)

> Sağlayıcı seçimi operatöre bırakılmıştır; herhangi bir S3-uyumlu servis bu mimari ile çalışır.

### 2.6 DNS Sağlayıcısı

- Hızlı propagasyon (TTL düşük tutulmalı, ilk kurulumda 300 sn)
- API erişimi (otomatik sertifika challenge ve failover için)
- DDoS koruması ve proxy/CDN (opsiyonel ama tavsiye edilir)
- IPv4 (A kayıt) ve IPv6 (AAAA) desteği

---

## 3. Inter-Machine Networking — Frontend ↔ Backend Bağlantısı

> Bu bölüm en kritik tasarım kararlarından biridir. Yanlış yapılırsa ya güvenlik açığı oluşur ya da sistem çalışmaz.

### 3.1 Hedef Topoloji

```
Frontend Makine                Backend Makine
├── public IP   (203.0.113.10)      ── public IP   (203.0.113.20) ← idealde YOK
└── private IP  (10.0.0.10)         └── private IP  (10.0.0.20)

Trafik akışı:
  Browser → Frontend public:443  → Frontend reverse proxy
                                       │
                                       └─ private network → Backend 10.0.0.20:8080
                                                                  │
                                                                  └─ localhost:5432 (DB)
```

**Backend makinesinin public IP'si:**
- İdeal: **yok** (sadece private network).
- Eğer sağlayıcı zorunlu kılıyorsa: firewall public arabirimde tüm 8080 trafiğini reddeder, sadece 22 (SSH) operatör IP'sinden açıktır.

### 3.2 Private Network Seçenekleri

Operatörün durumuna göre **üç seçenek**:

#### Seçenek A: Aynı sağlayıcıda private network (en basit, önerilen)

Çoğu bulut sağlayıcı VPC / private network / VLAN gibi adlar altında ücretsiz dahili ağ servisi sunar.

- Her iki VM aynı VPC/private network'e atanır
- Her VM'in `eth0` (public) ve `eth1` (private) arabirimleri olur
- Private IP'ler iç ağda statik atanır (örn. `10.0.0.10`, `10.0.0.20`)
- İletişim **şifreli değildir** (intra-DC ağ, fiziksel olarak izole)

**Kurulum:** Sağlayıcının web arayüzünden VPC oluştur, iki VM'i ekle. İşletim sistemi tarafında genelde otomatik yapılandırılır.

#### Seçenek B: WireGuard VPN (farklı sağlayıcılar veya ek güvenlik için)

Eğer frontend ve backend farklı sağlayıcılarda ise ya da private network'e ek olarak şifreleme isterseniz:

```
Frontend Makine (203.0.113.10)
   wg0: 10.10.0.1/24
        │ WireGuard tunnel (UDP 51820, şifreli)
Backend Makine (203.0.113.20)
   wg0: 10.10.0.2/24
```

**Frontend tarafı `/etc/wireguard/wg0.conf`:**

```ini
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = <frontend-private-key>

[Peer]
PublicKey = <backend-public-key>
AllowedIPs = 10.10.0.2/32
Endpoint = backend-public-ip:51820
PersistentKeepalive = 25
```

**Backend tarafı `/etc/wireguard/wg0.conf`:**

```ini
[Interface]
Address = 10.10.0.2/24
ListenPort = 51820
PrivateKey = <backend-private-key>

[Peer]
PublicKey = <frontend-public-key>
AllowedIPs = 10.10.0.1/32
Endpoint = frontend-public-ip:51820
PersistentKeepalive = 25
```

Etkinleştir:
```bash
apt -y install wireguard
systemctl enable --now wg-quick@wg0
```

Sonra frontend'den `ping 10.10.0.2` çalışmalı.

#### Seçenek C: SSH tunnel (acil çözüm, üretim için önerilmez)

Geçici kullanım için SSH reverse tunnel kurulabilir; otomatik reconnect, izleme ve güvenilirlik açısından üretime uygun değildir. Üretim için A veya B kullanın.

### 3.3 Firewall Kuralları

#### Frontend Makinesi (`ufw`)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp           # SSH (idealde operatör IP whitelist)
ufw allow 80/tcp           # HTTP (ACME challenge)
ufw allow 443/tcp          # HTTPS
ufw enable
```

#### Backend Makinesi (`ufw`)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp                                   # SSH
ufw allow from 10.0.0.10 to any port 8080 proto tcp   # API — sadece frontend'den
ufw allow from 10.0.0.10 to any port 8081 proto tcp   # Test API
# WireGuard kullanılıyorsa:
ufw allow 51820/udp
ufw enable
```

> **Kritik:** Backend port 8080 **asla** `ufw allow 8080/tcp` ile global açılmaz. Sadece frontend private IP'sinden gelene izin verilir.

### 3.4 SSH Erişimi (Operatör → Her İki Makine)

Operatör laptop'undan iki makineye de SSH key ile bağlanabilmeli. **Şifre login asla.**

`~/.ssh/config` operatörün laptop'unda:
```
Host bb-frontend
    HostName frontend-public-ip
    User deploy
    IdentityFile ~/.ssh/bizboard_ed25519
    IdentitiesOnly yes

Host bb-backend
    HostName backend-public-ip-or-via-jumphost
    User deploy
    IdentityFile ~/.ssh/bizboard_ed25519
    IdentitiesOnly yes
    # Backend public erişimi kapalıysa frontend üzerinden zıpla:
    ProxyJump bb-frontend
```

`ProxyJump` ayarı backend public IP olmadan çalışmak için idealdir.

### 3.5 Backend → Frontend Cross-SSH (Otomatik İşlemler İçin)

Test data refresh sırasında backend, frontend stack'ini durdurup başlatması gerekebilir. Bu için backend → frontend yönünde de SSH key tanımlı olmalı.

Backend'de:
```bash
sudo -u deploy ssh-keygen -t ed25519 -C "backend-to-frontend" -f /home/deploy/.ssh/cross_ed25519 -N ""
cat /home/deploy/.ssh/cross_ed25519.pub
```

Frontend'de:
```bash
# Yukarıdaki public key'i frontend'in deploy user'ının authorized_keys'ine ekle
echo "ssh-ed25519 AAAA... backend-to-frontend" >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# Sadece belli komutları çalıştırsın (restricted):
# Frontend authorized_keys'te key satırının başına:
# command="/opt/bizboard/scripts/allowed-remote.sh",no-port-forwarding,no-X11-forwarding ssh-ed25519 ...
```

### 3.6 İçsel Hostname Çözümlemesi

Hostname'ler IP yerine kullanılabilir. İki makinede de `/etc/hosts` doldurulur:

**Frontend `/etc/hosts`:**
```
10.0.0.20    backend.internal
```

**Backend `/etc/hosts`:**
```
10.0.0.10    frontend.internal
```

Sonra `ssh backend.internal` veya konfigürasyon dosyalarında `https://backend.internal:8080` yazılabilir. IP değiştiğinde tek dosya güncellenir.

### 3.7 Bağlantı Sağlığı Testi

Frontend'den backend'e bağlantı testi (kurulum sonrası yapılmalı):

```bash
# Network erişimi
ping -c 3 backend.internal
nc -zv backend.internal 8080      # port açık mı

# Spring Boot health check
curl -fsS http://backend.internal:8080/actuator/health
```

---

## 4. İlk Makine Kurulumu (İkisi İçin Ortak Hardening)

> Bu bölümün tüm adımları **her iki makinede de** aynen uygulanır.

### 4.1 İlk Bağlantı

```bash
ssh root@<makine-ip>
```

### 4.2 Sistem Güncelleme + Temel Paketler

```bash
apt update && apt -y upgrade
apt -y install ufw fail2ban unattended-upgrades curl wget git rsync zstd \
               htop iotop ncdu jq vim ca-certificates gnupg lsb-release \
               cron logrotate apt-transport-https chrony
```

### 4.3 Otomatik Güvenlik Güncellemeleri

```bash
dpkg-reconfigure --priority=low unattended-upgrades
```

`/etc/apt/apt.conf.d/50unattended-upgrades` içinde:

```
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
```

### 4.4 Yeni Kullanıcı (deploy)

```bash
adduser deploy
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cat >> /home/deploy/.ssh/authorized_keys <<'EOF'
ssh-ed25519 AAAA... operatör-public-key
EOF
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

### 4.5 SSH Hardening

`/etc/ssh/sshd_config.d/99-hardening.conf`:

```
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
UsePAM yes
MaxAuthTries 3
LoginGraceTime 30
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy
Protocol 2
```

```bash
systemctl restart ssh
```

> ⚠️ Yeni terminalde `deploy` user'ı ile bağlanmayı **test etmeden** root oturumunu kapatma.

### 4.6 Fail2ban

`/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
```

```bash
systemctl enable --now fail2ban
```

### 4.7 Docker Kurulumu

```bash
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list
apt update
apt -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
usermod -aG docker deploy
```

### 4.8 Saat Dilimi ve NTP

```bash
timedatectl set-timezone Europe/Istanbul
systemctl enable --now chrony
chronyc tracking            # senkron çalışıyor mu doğrula
```

> Her iki makine de **aynı saat diliminde ve NTP ile senkron** olmalı. Log'ların korelasyonu buna bağlı.

### 4.9 Backend'e Özel: Ek Volume Mount

Sağlayıcıdan ek 100+ GB volume oluşturup VM'e attach ettikten sonra:

```bash
lsblk                                  # cihaz adını bul (örn. /dev/sdb)
mkfs.ext4 /dev/sdb                     # FORMAT — varolan veri silinir, dikkat!
mkdir -p /mnt/data
echo "/dev/sdb /mnt/data ext4 defaults,nofail 0 2" >> /etc/fstab
mount -a
df -h /mnt/data
```

`nofail` opsiyonu önemli — volume bağlantısı kopmuşsa sistem yine açılır.

### 4.10 Hostname

```bash
# Frontend makine:
hostnamectl set-hostname frontend
# Backend makine:
hostnamectl set-hostname backend
```

---

## 5. Frontend Makinesi — Detaylı Kurulum

### 5.1 Dizin Yapısı

```
/opt/bizboard/
├── prod/
│   ├── docker-compose.yml
│   └── .env
├── test/
│   ├── docker-compose.yml
│   └── .env
├── proxy/
│   ├── docker-compose.yml
│   ├── Caddyfile
│   └── data/
└── scripts/
    └── (frontend-only scripts)
```

### 5.2 Docker Network

```bash
docker network create shared_proxy
```

### 5.3 Prod Compose (Sadece Frontend)

`/opt/bizboard/prod/docker-compose.yml`:

```yaml
name: bizboard-prod-web

networks:
  shared_proxy:
    external: true

services:

  web:
    image: ${IMAGE_REGISTRY}/bizboard-web:${WEB_TAG:-latest}
    restart: unless-stopped
    container_name: bb_prod_web
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: https://api.alanadi.com
      NEXT_PUBLIC_ENV: prod
      NEXT_PUBLIC_APP_VERSION: ${WEB_TAG:-latest}
      TZ: Europe/Istanbul
      BACKEND_URL: http://backend.internal:8080   # SSR/server-side fetch için
    networks: [shared_proxy]
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }
```

### 5.4 `/opt/bizboard/prod/.env` (mode 600)

```dotenv
IMAGE_REGISTRY=<image-registry-url>
WEB_TAG=latest
```

```bash
chmod 600 /opt/bizboard/prod/.env
```

### 5.5 Test Compose

`/opt/bizboard/test/docker-compose.yml`:

```yaml
name: bizboard-test-web

networks:
  shared_proxy:
    external: true

services:

  web:
    image: ${IMAGE_REGISTRY}/bizboard-web:${WEB_TAG:-test}
    restart: unless-stopped
    container_name: bb_test_web
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: https://test-api.alanadi.com
      NEXT_PUBLIC_ENV: test
      TZ: Europe/Istanbul
      BACKEND_URL: http://backend.internal:8081
    networks: [shared_proxy]
```

### 5.6 Stack'leri Başlat

```bash
cd /opt/bizboard/prod && docker compose up -d
cd /opt/bizboard/test && docker compose up -d
```

---

## 6. Backend Makinesi — Detaylı Kurulum

### 6.1 Dizin Yapısı

```
/opt/bizboard/
├── prod/
│   ├── docker-compose.yml
│   ├── .env
│   └── postgres/postgresql.conf
├── test/
│   ├── docker-compose.yml
│   └── .env
└── scripts/
    ├── backup-prod.sh
    ├── sync-to-offsite.sh
    ├── refresh-test-from-prod.sh
    ├── restore-drill.sh
    ├── disk-check.sh
    ├── disaster-restore.sh
    └── anonymize-test-data.sql

/mnt/data/                          ← ek volume
├── postgres/prod-data/
├── postgres/test-data/
├── uploads/prod/
├── uploads/test/
├── pgbackrest/repo/
├── pgbackrest/log/
└── dumps/
```

### 6.2 Dizinleri Oluştur

```bash
sudo mkdir -p /opt/bizboard/{prod,test,scripts}
sudo chown -R deploy:deploy /opt/bizboard

sudo mkdir -p /mnt/data/postgres/{prod-data,test-data}
sudo mkdir -p /mnt/data/uploads/{prod,test}
sudo mkdir -p /mnt/data/pgbackrest/{repo,log}
sudo mkdir -p /mnt/data/dumps
sudo chown -R 999:999 /mnt/data/postgres   # postgres user'ın UID/GID'i Docker image'da
sudo chown -R 1000:1000 /mnt/data/uploads
```

### 6.3 Prod Backend + DB Compose

`/opt/bizboard/prod/docker-compose.yml`:

```yaml
name: bizboard-prod-api

networks:
  prod_net:
    driver: bridge

volumes:
  postgres_prod_data:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/data/postgres/prod-data
  uploads_prod:
    driver: local
    driver_opts:
      type: none
      o: bind
      device: /mnt/data/uploads/prod

services:

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    container_name: bb_prod_postgres
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      PGDATA: /var/lib/postgresql/data/pgdata
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
      - ./postgres/postgresql.conf:/etc/postgresql/postgresql.conf:ro
      - /mnt/data/pgbackrest:/var/lib/pgbackrest
    command: postgres -c config_file=/etc/postgresql/postgresql.conf
    networks: [prod_net]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: json-file
      options: { max-size: "10m", max-file: "5" }

  api:
    image: ${IMAGE_REGISTRY}/bizboard-api:${API_TAG:-latest}
    restart: unless-stopped
    container_name: bb_prod_api
    depends_on:
      postgres: { condition: service_healthy }
    environment:
      SPRING_PROFILES_ACTIVE: prod
      APP_ENV: prod
      DB_USERNAME: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      APP_FILE_UPLOAD_DIR: /uploads
      LOG_DIR: /var/log/bizboard
      CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS}
      TZ: Europe/Istanbul
    volumes:
      - uploads_prod:/uploads
      - /var/log/bizboard/prod:/var/log/bizboard
    ports:
      # Sadece private network arabirimine bind et — public arabirime ASLA
      - "10.0.0.20:8080:8080"
    networks: [prod_net]
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 5s
      retries: 3
    logging:
      driver: json-file
      options: { max-size: "20m", max-file: "10" }
```

**Önemli satır:** `"10.0.0.20:8080:8080"` — Docker container port'unu sadece private IP'ye bind eder. `0.0.0.0:8080:8080` yazılırsa **port public'e açılır** ve firewall delinmemiş olur.

### 6.4 `/opt/bizboard/prod/.env`

```dotenv
IMAGE_REGISTRY=<image-registry-url>
API_TAG=latest

POSTGRES_DB=bizboard
POSTGRES_USER=bizboard_app
POSTGRES_PASSWORD=<openssl rand -base64 32 ile üret>

JWT_SECRET=<openssl rand -base64 48 ile üret>
CORS_ALLOWED_ORIGINS=https://app.alanadi.com
```

```bash
chmod 600 /opt/bizboard/prod/.env
```

### 6.5 Test Backend + DB Compose

`/opt/bizboard/test/docker-compose.yml`:

```yaml
name: bizboard-test-api

networks:
  test_net:
    driver: bridge

volumes:
  postgres_test_data:
    driver: local
    driver_opts: { type: none, o: bind, device: /mnt/data/postgres/test-data }
  uploads_test:
    driver: local
    driver_opts: { type: none, o: bind, device: /mnt/data/uploads/test }

services:

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    container_name: bb_test_postgres
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_test_data:/var/lib/postgresql/data
    networks: [test_net]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready"]
      interval: 10s

  api:
    image: ${IMAGE_REGISTRY}/bizboard-api:${API_TAG:-test}
    restart: unless-stopped
    container_name: bb_test_api
    depends_on:
      postgres: { condition: service_healthy }
    environment:
      SPRING_PROFILES_ACTIVE: prod
      APP_ENV: test
      DB_USERNAME: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${POSTGRES_DB}
      JWT_SECRET: ${JWT_SECRET}
      APP_FILE_UPLOAD_DIR: /uploads
      CORS_ALLOWED_ORIGINS: https://test.alanadi.com
      TZ: Europe/Istanbul
      APP_EXTERNAL_INTEGRATIONS_ENABLED: "false"
    volumes:
      - uploads_test:/uploads
    ports:
      - "10.0.0.20:8081:8080"      # test API farklı port'tan, sadece private IP
    networks: [test_net]
```

### 6.6 Test Ortamı İzolasyon Garantileri

| Risk | Garanti |
|------|---------|
| Test'in prod DB'sini yazması | Tamamen ayrı PostgreSQL container, ayrı volume, ayrı Docker network |
| Test'in prod kullanıcılarına email/SMS göndermesi | `APP_EXTERNAL_INTEGRATIONS_ENABLED=false` — kod tarafından destekli olmalı |
| Test'in public internete açılması | Reverse proxy basic auth ile gizli, opsiyonel IP whitelist |
| Test cron job'larının prod'u etkilemesi | Tamamen ayrı container, paylaşılan state yok |

> **Kod gerekliliği:** Backend kodunda `app.external-integrations.enabled` ayarı tanımlanmalı. False ise email/SMS/payment/webhook çağrıları sessizce log'a yazılıp atlanır. Test ortamında zorunlu olarak false.

### 6.7 Stack'leri Başlat

```bash
cd /opt/bizboard/prod && docker compose up -d
cd /opt/bizboard/test && docker compose up -d

# Sağlık kontrolü
docker ps
curl -fsS http://10.0.0.20:8080/actuator/health
curl -fsS http://10.0.0.20:8081/actuator/health
```

---

## 7. PostgreSQL Konfigürasyonu

### 7.1 `postgresql.conf` — Backup-Friendly Ayarlar

`/opt/bizboard/prod/postgres/postgresql.conf`:

```
# === Connection ===
listen_addresses = '*'
max_connections = 100

# === Memory (4 GB RAM için) ===
shared_buffers = 1GB
effective_cache_size = 3GB
work_mem = 16MB
maintenance_work_mem = 256MB

# === WAL & Archiving — backup için KRİTİK ===
wal_level = replica
archive_mode = on
archive_command = 'pgbackrest --stanza=bizboard archive-push %p'
archive_timeout = 60                  # her dakika WAL flush — RPO < 1dk
max_wal_senders = 3
wal_keep_size = 1GB

# === Checkpoint ===
checkpoint_completion_target = 0.9
checkpoint_timeout = 15min
max_wal_size = 2GB
min_wal_size = 512MB

# === Logging ===
log_destination = 'stderr'
logging_collector = off               # Docker stdout'a
log_min_duration_statement = 200      # 200ms+ query'leri logla
log_checkpoints = on
log_lock_waits = on
log_temp_files = 10MB
log_autovacuum_min_duration = 1000

# === Autovacuum ===
autovacuum = on
autovacuum_naptime = 60s

# === Locale ===
timezone = 'Europe/Istanbul'
log_timezone = 'Europe/Istanbul'
```

**Anahtar nokta:** `archive_mode = on` + `archive_timeout = 60` → maksimum 1 dakika işlem kaybı. Bu **RPO ≤ 5 dk** hedefini fazlasıyla karşılar.

### 7.2 Connection Pool Boyutlandırma

Spring Boot'ta HikariCP default 10 connection. 100 max_connections içinde yeterli marj var. Eğer kullanıcı sayısı artarsa `spring.datasource.hikari.maximum-pool-size: 20` ayarı `application-prod.yml`'de yapılır.

---

## 8. Reverse Proxy ve Otomatik HTTPS

Reverse proxy **frontend makinesinde** çalışır. Hem frontend trafiğini hem de `api.alanadi.com` istek tarafında **backend'e proxy** eder.

### 8.1 Reverse Proxy Compose (Frontend Makinesinde)

`/opt/bizboard/proxy/docker-compose.yml`:

```yaml
name: bizboard-proxy

networks:
  shared_proxy:
    external: true

volumes:
  caddy_data:
  caddy_config:

services:
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    container_name: bb_caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
      - /var/log/caddy:/var/log/caddy
    extra_hosts:
      - "backend.internal:10.0.0.20"   # private IP çözümlemesi
    networks: [shared_proxy]
```

### 8.2 Caddyfile

`/opt/bizboard/proxy/Caddyfile`:

```caddyfile
{
    email operatör@alanadi.com
}

# ===== PROD FRONTEND =====
app.alanadi.com {
    reverse_proxy bb_prod_web:3000
    encode zstd gzip
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Permissions-Policy "geolocation=(), camera=(), microphone=()"
    }
    log {
        output file /var/log/caddy/app-access.log { roll_size 10mb roll_keep 10 }
        format json
    }
}

# ===== PROD API (frontend makinesinden backend'e proxy) =====
api.alanadi.com {
    reverse_proxy backend.internal:8080 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        transport http {
            response_header_timeout 60s
            read_timeout 120s
        }
    }
    encode zstd gzip
    header Strict-Transport-Security "max-age=31536000"
    log {
        output file /var/log/caddy/api-access.log { roll_size 10mb roll_keep 10 }
        format json
    }
}

# ===== TEST FRONTEND (basic auth ile gizli) =====
test.alanadi.com {
    basicauth {
        deploy <bcrypt-hash>
    }
    reverse_proxy bb_test_web:3000
    encode zstd gzip
}

# ===== TEST API =====
test-api.alanadi.com {
    basicauth {
        deploy <bcrypt-hash>
    }
    reverse_proxy backend.internal:8081
}
```

### 8.3 Basic Auth Hash Üret

```bash
docker run --rm caddy:2 caddy hash-password --plaintext "test-sifresi"
```

### 8.4 Reverse Proxy'yi Başlat

```bash
cd /opt/bizboard/proxy
docker compose up -d
docker logs -f bb_caddy        # sertifika alımını izle
```

### 8.5 Akış Doğrulaması

```bash
# Browser'dan veya curl ile:
curl -I https://app.alanadi.com         # 200, HSTS header görünür
curl -I https://api.alanadi.com/actuator/health   # 200, JSON döner
```

Akış: `Browser → DNS → Frontend public IP:443 → Caddy → backend.internal:8080 → Spring Boot`

---

## 9. DNS ve Domain Yapılandırması

### 9.1 Gerekli DNS Kayıtları

| Tip | Ad | Hedef | TTL |
|-----|-----|-------|-----|
| A | `app.alanadi.com` | Frontend public IPv4 | 300 |
| A | `api.alanadi.com` | Frontend public IPv4 | 300 |
| A | `test.alanadi.com` | Frontend public IPv4 | 300 |
| A | `test-api.alanadi.com` | Frontend public IPv4 | 300 |
| A | `status.alanadi.com` | Frontend public IPv4 | 300 |
| AAAA | aynıları | Frontend public IPv6 (varsa) | 300 |

**Önemli:** `api.alanadi.com` da **frontend public IP'ye** işaret eder, **backend'e değil**. Backend'in public DNS'i yoktur.

### 9.2 CDN / Proxy Katmanı (Opsiyonel)

DNS sağlayıcınız proxy/CDN sunuyorsa (örn. orijin gizleme, DDoS koruması, edge cache), aktif edin. Bu durumda:
- Sertifika yönetimi: ya CDN sağlasın ya da origin'de Let's Encrypt (önerilen).
- Origin firewall'u sadece CDN IP aralıklarından gelen 443 trafiğini kabul edecek şekilde sıkılaştırılabilir.

### 9.3 İlk DNS Propagasyonu

İlk kurulumda TTL düşük tutulur (300 sn). Sistem stabilize olunca 3600+ sn'ye yükseltilir. DNS doğrulaması:

```bash
dig +short app.alanadi.com
dig +short api.alanadi.com
nslookup app.alanadi.com 8.8.8.8
```

---

## 10. ⭐ Backup Stratejisi — Sıfır Veri Kaybı

Bu projenin **ana koruma katmanı**. 5 ayrı yer + 3 farklı medya.

```
KATMAN 1: PostgreSQL WAL streaming → her dakika → local + off-site
KATMAN 2: pgBackRest full + incr   → günde 1    → local + off-site
KATMAN 3: pg_dump (logical)        → günde 1    → off-site (şifreli)
KATMAN 4: Volume snapshot           → günde 1    → sağlayıcı
KATMAN 5: Offline cold backup       → haftada 1  → şifreli external HDD
```

Tüm backup operasyonları **backend makinesinde** çalışır.

### 10.1 pgBackRest Kurulumu (Backend Makinesinde)

```bash
apt -y install pgbackrest
chown -R postgres:postgres /mnt/data/pgbackrest 2>/dev/null || \
chown -R 999:999 /mnt/data/pgbackrest          # docker postgres user UID
```

`/etc/pgbackrest/pgbackrest.conf`:

```ini
[global]
repo1-path=/mnt/data/pgbackrest/repo
repo1-retention-full=7
repo1-retention-diff=14
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=<openssl rand -base64 48>
compress-type=zst
compress-level=3
log-path=/mnt/data/pgbackrest/log
log-level-console=info
log-level-file=detail
process-max=2
start-fast=y

[bizboard]
pg1-path=/mnt/data/postgres/prod-data/pgdata
pg1-host=127.0.0.1
pg1-port=5432
pg1-user=postgres
```

> ⚠️ `repo1-cipher-pass` değerini **kayıt et** (şifre yöneticisi). Olmadan yedeklerden geri dönülemez.

### 10.2 İlk Stanza Oluşturma

PostgreSQL'in çalıştığı container'a bağlanıp stanza oluştur:

```bash
docker exec -it bb_prod_postgres su - postgres -c \
    "pgbackrest --stanza=bizboard --log-level-console=info stanza-create"
```

PostgreSQL `archive_command` ayarı (Section 7.1) zaten `pgbackrest --stanza=bizboard archive-push %p` kullandığı için bu noktadan itibaren WAL otomatik arşivlenir.

### 10.3 Backup Cron Job'ları

`/etc/cron.d/bizboard-backup`:

```cron
# Tüm cron'lar Europe/Istanbul saatinde
CRON_TZ=Europe/Istanbul

# Her gün 02:00 — Pazartesi full, diğer günler incremental
0 2 * * 1   deploy   docker exec bb_prod_postgres su - postgres -c "pgbackrest --stanza=bizboard --type=full backup"
0 2 * * 2-7 deploy   docker exec bb_prod_postgres su - postgres -c "pgbackrest --stanza=bizboard --type=incr backup"

# Her gün 03:00 — logical pg_dump
0 3 * * *   deploy   /opt/bizboard/scripts/backup-prod.sh

# Saatlik — off-site sync
0 * * * *   deploy   /opt/bizboard/scripts/sync-to-offsite.sh

# Her gün 04:00 — eski local backup temizliği
0 4 * * *   deploy   docker exec bb_prod_postgres su - postgres -c "pgbackrest --stanza=bizboard expire"

# Her saat — disk kullanım kontrolü
0 * * * *   deploy   /opt/bizboard/scripts/disk-check.sh
```

### 10.4 `backup-prod.sh` — Günlük Logical Dump

```bash
#!/usr/bin/env bash
set -euo pipefail

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/mnt/data/dumps
TMP_FILE="${BACKUP_DIR}/bizboard-prod-${DATE}.sql.zst"
ENCRYPTED="${TMP_FILE}.gpg"
LOG_FILE=/var/log/bizboard/backup.log
HC_URL="${HEALTHCHECK_BACKUP_URL:-}"

mkdir -p "$BACKUP_DIR" "$(dirname "$LOG_FILE")"
exec >> "$LOG_FILE" 2>&1

echo "===== $(date -Iseconds) backup-prod START ====="

docker exec bb_prod_postgres pg_dump \
    -U bizboard_app -d bizboard \
    --format=custom --no-owner --no-privileges \
  | zstd -3 -T2 -o "$TMP_FILE"

SIZE=$(stat -c %s "$TMP_FILE")
if [ "$SIZE" -lt 1024 ]; then
    echo "FATAL: dump too small ($SIZE bytes)"
    [ -n "$HC_URL" ] && curl -fsS "${HC_URL}/fail" || true
    exit 1
fi
echo "OK dump size: $SIZE bytes"

# GPG ile şifrele (off-site'e şifreli gönder)
gpg --batch --yes --trust-model always \
    --output "$ENCRYPTED" \
    --encrypt --recipient backup@bizboard.local "$TMP_FILE"
rm "$TMP_FILE"

# Lokal retention: 14 gün
find "$BACKUP_DIR" -name "bizboard-prod-*.sql.zst.gpg" -mtime +14 -delete

# Heartbeat — dead-man's switch
[ -n "$HC_URL" ] && curl -fsS -m 10 --retry 3 "$HC_URL" || true
echo "===== $(date -Iseconds) backup-prod END ====="
```

### 10.5 `sync-to-offsite.sh` — Off-site Senkronizasyon

S3-uyumlu CLI ile (örn. `s3cmd`, `rclone`, `aws-cli`, `mc`) tüm yedekler obje depolamaya yüklenir:

```bash
#!/usr/bin/env bash
set -euo pipefail

BUCKET="${OFFSITE_BUCKET}"
LOG=/var/log/bizboard/sync-offsite.log
HC_URL="${HEALTHCHECK_OFFSITE_URL:-}"

exec >> "$LOG" 2>&1
echo "===== $(date -Iseconds) sync-to-offsite START ====="

# pgBackRest deposu
rclone sync --transfers 4 --checkers 8 \
    /mnt/data/pgbackrest/repo/ "remote:${BUCKET}/pgbackrest/"

# Logical dump'lar
rclone sync --transfers 4 \
    /mnt/data/dumps/ "remote:${BUCKET}/dumps/"

# Uploads
rclone sync --transfers 4 \
    /mnt/data/uploads/prod/ "remote:${BUCKET}/uploads/"

# Konfigürasyon yedekleri
tar czf /tmp/bizboard-config-$(date +%Y%m%d).tar.gz \
    /opt/bizboard/prod/docker-compose.yml \
    /opt/bizboard/scripts/ \
    /etc/pgbackrest/pgbackrest.conf
rclone copy /tmp/bizboard-config-*.tar.gz "remote:${BUCKET}/config/"
rm /tmp/bizboard-config-*.tar.gz

[ -n "$HC_URL" ] && curl -fsS -m 10 --retry 3 "$HC_URL" || true
echo "===== $(date -Iseconds) sync-to-offsite END ====="
```

> `rclone` örnek olarak kullanıldı; aynı sonucu herhangi bir S3-uyumlu CLI (`s3cmd sync`, `mc mirror`, sağlayıcının kendi CLI'ı vb.) ile de elde edersiniz.

### 10.6 Volume Snapshot

Sağlayıcı volume snapshot destekliyorsa (genellikle destekler), günlük otomatik snapshot ayarlanır. Sağlayıcı CLI'ı ile:

```bash
# Cron 05:00 — örnek genel komut
0 5 * * * deploy <provider-cli> volume snapshot create --volume=<id> --description="auto-$(date +\%Y\%m\%d)"
```

7 günden eski snapshot'ları temizleyen ikinci bir cron yazılır.

### 10.7 Offline Backup (Haftalık, Manuel)

Operatör her Pazartesi:
1. Off-site bucket'tan son haftalık dump'ı laptop'a indir
2. LUKS/VeraCrypt ile şifrelenmiş external HDD'ye kopyala
3. HDD'yi fiziksel olarak farklı bir lokasyona koy (ev, kasa)

Bu "air gap" katmanı, online tüm yedekleri silen bir saldırıya karşı son savunma hattıdır.

### 10.8 Backup Hedefleri Özeti

| Katman | Sıklık | Retention | RPO Etkisi |
|--------|--------|-----------|------------|
| WAL streaming | her dakika | 14 gün | **<1 dk** |
| pgBackRest full | haftalık | 7 hafta | — |
| pgBackRest incr | günlük | 14 gün | — |
| pg_dump (logical) | günlük | 14 gün local, 90 gün off-site | — |
| Volume snapshot | günlük | 7 gün | — |
| Offline HDD | haftalık | sınırsız | — |

**Verinin kaybolması için aynı anda:** sağlayıcının DC'si + off-site obje depolama + operatörün HDD'si + laptop'u — hepsi yok olmalı. Pratik olarak imkansız.

---

## 11. ⭐ Test Ortamı — Multi-Machine İzolasyon

Test ortamı **aynı 2 makinede** ama ayrı stack'lerle çalışır:

| Bileşen | Prod | Test |
|---------|------|------|
| Frontend container | `bb_prod_web` port 3000 | `bb_test_web` port 3001 |
| Backend container | `bb_prod_api` port 8080 | `bb_test_api` port 8081 |
| PostgreSQL | `bb_prod_postgres` + volume A | `bb_test_postgres` + volume B |
| Docker network | `prod_net` | `test_net` (ayrı) |
| Uploads | `/mnt/data/uploads/prod/` | `/mnt/data/uploads/test/` |
| External integrations (email/SMS) | enabled | **disabled** (env var) |
| Domain | `app.alanadi.com` | `test.alanadi.com` (basic auth) |

### 11.1 İzolasyon Garantileri

| Risk | Garanti |
|------|---------|
| Test prod DB'sini bozar | Tamamen ayrı container, ayrı volume, ayrı Docker network |
| Test prod uploads klasörünü siler | Ayrı bind mount |
| Test prod kullanıcılarına email atar | `APP_EXTERNAL_INTEGRATIONS_ENABLED=false` |
| Test ortamı public internette gezilir | Reverse proxy basic auth, opsiyonel IP whitelist |
| Test cron job'ları prod'u günceller | Ayrı container; paylaşılan state yok |

### 11.2 Network İzolasyonu

Docker network ayrımı:
```
prod_net  ← bb_prod_postgres ↔ bb_prod_api
test_net  ← bb_test_postgres ↔ bb_test_api
```

`bb_test_api`'nin `bb_prod_postgres`'e erişim yolu yoktur (farklı bridge network'ler, DNS resolution bile çalışmaz).

---

## 12. ⭐ Test Verisi Senkronizasyonu (Prod → Test)

### 12.1 Mantık

> **Senin istediğin:** "Test ortamındaki veriler paralel olarak prod ile eşlensin, üzerinde yaptığım değişiklikler prod'u etkilemesin."

**Yanlış yaklaşım — PostgreSQL streaming replication:**
- Replica **read-only** olur, test'te INSERT/UPDATE yapamazsın → senin istediğin değil.

**Doğru yaklaşım — Snapshot refresh:**
- Her gece prod'un canlı kopyası test DB'ye yüklenir
- Test her sabah taze prod verisiyle uyanır
- Gün içinde test'te yaptığın değişiklikler ertesi sabah temizlenir
- Prod'a sızma yolu **yok**

```
00:00 ──────────────────────────────── 03:00 ──── 24:00
PROD: çalışır                          backup     refresh test
TEST: dünden kalma değişiklikler ────────────────► tertemiz prod kopyası
```

### 12.2 `refresh-test-from-prod.sh` (Backend Makinesinde)

```bash
#!/usr/bin/env bash
set -euo pipefail

PROD_DB=bizboard
TEST_DB=bizboard
PROD_USER=bizboard_app
TEST_USER=bizboard_app
DUMP=/mnt/data/tmp/refresh-$(date +%Y%m%d).dump
LOG=/var/log/bizboard/refresh-test.log
HC_URL="${HEALTHCHECK_REFRESH_URL:-}"

exec >> "$LOG" 2>&1
echo "===== $(date -Iseconds) refresh-test START ====="

mkdir -p /mnt/data/tmp

# 1) Prod'dan dump
docker exec bb_prod_postgres pg_dump \
    -U "$PROD_USER" -d "$PROD_DB" \
    --format=custom --no-owner --no-privileges --clean --if-exists \
    -f /tmp/prod.dump
docker cp bb_prod_postgres:/tmp/prod.dump "$DUMP"
docker exec bb_prod_postgres rm /tmp/prod.dump

# 2) Test API'yi durdur
docker compose -f /opt/bizboard/test/docker-compose.yml stop api

# 3) Test DB'yi sıfırla
docker exec bb_test_postgres psql -U "$TEST_USER" -d postgres -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname='$TEST_DB' AND pid <> pg_backend_pid();" || true
docker exec bb_test_postgres psql -U "$TEST_USER" -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB;"
docker exec bb_test_postgres psql -U "$TEST_USER" -d postgres -c "CREATE DATABASE $TEST_DB;"

# 4) Test DB'ye geri yükle
docker cp "$DUMP" bb_test_postgres:/tmp/prod.dump
docker exec bb_test_postgres pg_restore \
    -U "$TEST_USER" -d "$TEST_DB" \
    --no-owner --no-privileges --clean --if-exists \
    -j 2 /tmp/prod.dump || true
docker exec bb_test_postgres rm /tmp/prod.dump

# 5) PII anonimleştirme
docker exec -i bb_test_postgres psql -U "$TEST_USER" -d "$TEST_DB" \
    < /opt/bizboard/scripts/anonymize-test-data.sql

# 6) Test admin user'ı sabit hale getir
docker exec bb_test_postgres psql -U "$TEST_USER" -d "$TEST_DB" -c "
    UPDATE users
       SET username='admin',
           password='\$2a\$10\$<bcrypt-hash-of-admin123>',
           email='admin@test.local'
     WHERE role='admin';
"

# 7) Uploads klasörünü kopyala (read-only kopya)
rsync -a --delete /mnt/data/uploads/prod/ /mnt/data/uploads/test/

# 8) Test stack'i yeniden başlat
docker compose -f /opt/bizboard/test/docker-compose.yml up -d

# 9) Frontend tarafında ek bir adım gerekiyorsa (örn. test ortamı redirect veya cache temizleme)
#    backend → frontend SSH ile tetiklenebilir:
#    ssh deploy@frontend.internal "/opt/bizboard/scripts/post-refresh-hook.sh"

# 10) Temizlik ve heartbeat
rm "$DUMP"
[ -n "$HC_URL" ] && curl -fsS -m 10 --retry 3 "$HC_URL" || true
echo "===== $(date -Iseconds) refresh-test END ====="
```

### 12.3 `anonymize-test-data.sql`

```sql
BEGIN;

-- Kullanıcı PII
UPDATE users
   SET email     = CONCAT('user-', SUBSTRING(id::text, 1, 8), '@test.local'),
       phone     = CONCAT('555', LPAD(CAST(FLOOR(random()*10000000) AS TEXT), 7, '0')),
       full_name = CONCAT('Test User ', SUBSTRING(id::text, 1, 6));

-- Personel
UPDATE employees
   SET full_name = CONCAT('Test Employee ', SUBSTRING(id::text, 1, 6)),
       phone     = CONCAT('555', LPAD(CAST(FLOOR(random()*10000000) AS TEXT), 7, '0')),
       sgk_number = NULL,
       tc_kimlik  = NULL;

-- Borç karşı tarafları
UPDATE debts
   SET counterparty = CONCAT('Test Party ', SUBSTRING(id::text, 1, 6))
 WHERE counterparty IS NOT NULL;

-- Notlar
UPDATE business_notes
   SET content = '*** test anonymized ***'
 WHERE LENGTH(content) > 0;

-- Hassas config
UPDATE businesses
   SET metadata = '{}'::jsonb
 WHERE metadata::text ILIKE '%token%' OR metadata::text ILIKE '%secret%';

COMMIT;
```

### 12.4 Refresh Özellikleri

| Özellik | Davranış |
|---------|----------|
| Frekans | Günde 1 (cron 03:00) — değiştirilebilir |
| Süre | ~5-15 dakika (DB boyutuna göre) |
| Test ortamı erişimi | Refresh sırasında ~2-5 dakika 503 döner |
| Test'te yaptığın değişiklik | Ertesi sabah silinir |
| Prod'a sızma riski | Sıfır (tek yönlü) |
| Hassas veri sızıntısı | Anonimleştirme zorunlu |
| Test admin user | Her refresh sonrası `admin/admin123` |

### 12.5 Geçici Test Koruması

Eğer test'te yaptığın bir şeyi 2-3 gün korumak istiyorsan refresh cron'unu geçici olarak durdur:

```bash
# Cron'u devre dışı bırak
sudo systemctl disable --now cron   # ya da spesifik cron satırını yorum yap
# Veya manuel dump al
docker exec bb_test_postgres pg_dump -U bizboard_app bizboard > /mnt/data/dumps/test-manual-$(date +%Y%m%d).sql
```

---

## 13. Restore Drill (Aylık Otomatik Doğrulama)

> **Test edilmeyen yedek = yedek değil.**

### 13.1 `restore-drill.sh` — Otomatik Doğrulama

```bash
#!/usr/bin/env bash
set -euo pipefail

DRILL_DB=bizboard_drill_$(date +%Y%m)
LOG=/var/log/bizboard/restore-drill.log
DUMP=$(ls -t /mnt/data/dumps/bizboard-prod-*.sql.zst.gpg | head -n1)
HC_URL="${HEALTHCHECK_DRILL_URL:-}"

exec >> "$LOG" 2>&1
echo "===== $(date -Iseconds) restore-drill START — dump=$DUMP ====="

# 1) Drill DB yarat
docker exec bb_prod_postgres psql -U bizboard_app -d postgres -c "DROP DATABASE IF EXISTS $DRILL_DB;"
docker exec bb_prod_postgres psql -U bizboard_app -d postgres -c "CREATE DATABASE $DRILL_DB;"

# 2) Decrypt + decompress + restore
gpg --batch --yes --decrypt "$DUMP" \
  | zstd -d \
  | docker exec -i bb_prod_postgres pg_restore -U bizboard_app -d "$DRILL_DB" \
        --no-owner --no-privileges -j 2

# 3) Sanity check
TABLES=$(docker exec bb_prod_postgres psql -U bizboard_app -d "$DRILL_DB" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")
USERS=$(docker exec bb_prod_postgres psql -U bizboard_app -d "$DRILL_DB" -tAc "SELECT count(*) FROM users;" || echo 0)
TX=$(docker exec bb_prod_postgres psql -U bizboard_app -d "$DRILL_DB" -tAc "SELECT count(*) FROM transactions;" || echo 0)

echo "Tables=$TABLES Users=$USERS Transactions=$TX"

if [ "$TABLES" -lt 10 ] || [ "$USERS" -lt 1 ]; then
    echo "FATAL: restore drill failed sanity check"
    [ -n "$HC_URL" ] && curl -fsS "${HC_URL}/fail" || true
    exit 1
fi

# 4) Temizlik
docker exec bb_prod_postgres psql -U bizboard_app -d postgres -c "DROP DATABASE $DRILL_DB;"

[ -n "$HC_URL" ] && curl -fsS "$HC_URL" || true
echo "===== $(date -Iseconds) restore-drill OK ====="
```

Cron: `0 4 1 * *` (her ayın 1'i 04:00).

### 13.2 Üç Aylık PITR (Point-in-Time Recovery) Drill

Manuel olarak izole bir test DB cluster'ında:

```bash
pgbackrest --stanza=bizboard \
    --type=time --target="2026-05-09 14:23:00+03" \
    --target-action=promote \
    --pg1-path=/tmp/drill-pgdata \
    restore
```

---

## 14. Disaster Recovery — Senaryo Bazlı Prosedürler

### Senaryo A — "Yanlışlıkla bir transaction sildim"

**Süre:** 5-10 dakika | **Kayıp:** 0

```bash
DATE=$(date +%Y%m%d)
gpg --decrypt /mnt/data/dumps/bizboard-prod-${DATE}*.sql.zst.gpg | zstd -d > /tmp/restore.dump

docker exec bb_prod_postgres createdb -U bizboard_app temp_restore
docker exec -i bb_prod_postgres pg_restore -U bizboard_app -d temp_restore < /tmp/restore.dump

# Aradığın kaydı bul, manuel INSERT ile prod'a geri at
docker exec bb_prod_postgres psql -U bizboard_app -d temp_restore -c \
    "SELECT * FROM transactions WHERE id='<silinen-id>';"

# Temizlik
docker exec bb_prod_postgres dropdb -U bizboard_app temp_restore
```

### Senaryo B — "DB bozuldu, prod ayağa kalkmıyor"

**Süre:** 30-60 dakika | **Kayıp:** <1 dk

```bash
# 1) PostgreSQL container durdur
docker compose -f /opt/bizboard/prod/docker-compose.yml stop postgres

# 2) Bozuk veriyi forensic için sakla
mv /mnt/data/postgres/prod-data/pgdata /mnt/data/postgres/prod-data/pgdata.broken-$(date +%s)
mkdir -p /mnt/data/postgres/prod-data/pgdata
chown -R 999:999 /mnt/data/postgres/prod-data/pgdata

# 3) pgBackRest ile latest backup + WAL replay
docker exec bb_prod_postgres su - postgres -c \
    "pgbackrest --stanza=bizboard --log-level-console=info restore"

# 4) PostgreSQL'i tekrar başlat
docker compose -f /opt/bizboard/prod/docker-compose.yml up -d postgres

# 5) Son transaction kontrolü
docker exec bb_prod_postgres psql -U bizboard_app -d bizboard -c \
    "SELECT MAX(created_at) FROM transactions;"

# 6) API'yi başlat
docker compose -f /opt/bizboard/prod/docker-compose.yml up -d
```

### Senaryo C — "Backend makinesi tamamen gitti"

**Süre:** 2-4 saat | **Kayıp:** <1 saat (off-site sync interval'i)

```bash
# 1) Yeni backend makinesi açın (aynı spec)
# 2) Section 4 ortak hardening
# 3) Section 6 dizin yapısı + Docker
# 4) Off-site'den yedekleri indir:
mkdir -p /mnt/data/backups
rclone sync "remote:${BUCKET}/" /mnt/data/backups/

# 5) pgBackRest restore
docker run --rm -v /mnt/data:/mnt/data postgres:17-alpine \
    su - postgres -c \
    "pgbackrest --stanza=bizboard \
        --pg1-path=/mnt/data/postgres/prod-data/pgdata \
        --repo1-path=/mnt/data/backups/pgbackrest \
        restore"

# 6) Compose dosyalarını off-site config tar'dan al
tar xzf /mnt/data/backups/config/<latest>.tar.gz -C /

# 7) Stack'i başlat
cd /opt/bizboard/prod && docker compose up -d

# 8) Frontend makinesinde DNS/IP güncelle (private IP veya WireGuard yeniden konfig)
# 9) Frontend Caddyfile'da backend.internal hedefini yeni private IP'ye güncelle
```

### Senaryo D — "Frontend makinesi gitti"

**Süre:** 1-2 saat | **Kayıp:** 0 (frontend stateless)

```bash
# 1) Yeni frontend makinesi açın
# 2) Section 4 hardening
# 3) Section 5 dizin yapısı + Docker
# 4) Section 8 reverse proxy ve Caddyfile
# 5) DNS A kayıtlarını yeni IP'ye güncelle
# 6) Backend makinesinde firewall kuralındaki "frontend private IP"'yi güncelle:
ufw delete allow from <eski-IP> to any port 8080
ufw allow from <yeni-IP> to any port 8080
```

### Senaryo E — "Ransomware geldi, her şey şifrelendi"

**Süre:** 4-8 saat | **Kayıp:** ≤ 1 hafta (offline HDD yaşı)

```bash
# 1) Tüm online hesapları (sağlayıcı, off-site, DNS) compromise sayın
# 2) Yeni hesaplar açın
# 3) Operatör offline HDD'sinden son haftalık yedeği alın
# 4) Yeni VM'ler kur, Section 4-9
# 5) HDD'den dump'ı restore edin
# 6) Tüm secret'ları rotate edin (DB, JWT, off-site, SSH)
# 7) Forensic incelemesi
```

### Senaryo Özet Tablosu

| Senaryo | Süre | Kayıp | Karmaşıklık |
|---------|------|-------|-------------|
| Tek kayıt silme | 10 dk | 0 | Düşük |
| DB corruption | 1 saat | <1 dk | Orta |
| Backend makinesi ölümü | 4 saat | <1 saat | Orta |
| Frontend makinesi ölümü | 2 saat | 0 | Düşük |
| Tüm DC felaketi | 6 saat | <1 saat | Yüksek |
| Ransomware | 8 saat | <1 hafta | Yüksek |

### Senaryo F — "Frontend ↔ Backend bağlantısı koptu"

**Süre:** 5-30 dakika | **Kayıp:** 0

Belirtileri: Frontend 502/504 dönüyor, ama backend makinesi sağlıklı.

```bash
# 1) Private network bağlantısını test et
# Frontend'den:
ping -c 3 backend.internal
nc -zv backend.internal 8080

# 2) WireGuard kullanılıyorsa:
sudo wg show           # peer handshake var mı, son ne zaman?
sudo systemctl restart wg-quick@wg0

# 3) Sağlayıcının private network durumunu kontrol et (statussayfası)
# 4) Caddy log'unda hata mesajını oku:
docker logs --tail 100 bb_caddy | grep -i error
```

---

## 15. CI/CD Pipeline

### 15.1 Genel Akış

```
Geliştirici → git push (test branch) → Container Registry → Test makinelere deploy
Geliştirici → git push (main branch) → Container Registry → Prod makinelere deploy
```

### 15.2 Backend Workflow (Örnek GitHub Actions)

`.github/workflows/backend.yml`:

```yaml
name: Backend CI/CD

on:
  push:
    branches: [main, test]
    paths: ['backend/**', '.github/workflows/backend.yml']

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin', cache: maven }

      - name: Test + Build
        working-directory: backend/bizboard
        run: mvn -B verify

      - name: Login to image registry
        run: echo "${{ secrets.REGISTRY_PASSWORD }}" | docker login ${{ secrets.REGISTRY_HOST }} -u ${{ secrets.REGISTRY_USER }} --password-stdin

      - name: Determine env
        id: env
        run: |
          if [ "${{ github.ref_name }}" = "main" ]; then
            echo "tag=latest" >> $GITHUB_OUTPUT
            echo "env=prod" >> $GITHUB_OUTPUT
            echo "host=${{ secrets.BACKEND_PROD_HOST }}" >> $GITHUB_OUTPUT
          else
            echo "tag=test" >> $GITHUB_OUTPUT
            echo "env=test" >> $GITHUB_OUTPUT
            echo "host=${{ secrets.BACKEND_TEST_HOST }}" >> $GITHUB_OUTPUT
          fi

      - name: Build & push
        uses: docker/build-push-action@v5
        with:
          context: backend/bizboard
          push: true
          tags: ${{ secrets.REGISTRY_HOST }}/bizboard-api:${{ steps.env.outputs.tag }}

      - name: Deploy to backend machine
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ steps.env.outputs.host }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/bizboard/${{ steps.env.outputs.env }}
            docker compose pull api
            docker compose up -d api
            sleep 10
            curl -fsS http://localhost:8080/actuator/health || exit 1
            docker image prune -f
```

### 15.3 Frontend Workflow (Örnek)

Aynı pattern, sadece:
- `npm ci && npm run build && npm run lint && npm run typecheck`
- Image: `bizboard-web`
- Deploy target: frontend makinesi

### 15.4 Branch Stratejisi

| Branch | Hedef ortam | Image tag |
|--------|-------------|-----------|
| `test` | Test makineler | `:test` |
| `main` | Prod makineler | `:latest` |

Rollback: `main` branch'te önceki commit'i `git revert` ile geri al, CI otomatik eski versiyonu deploy eder.

### 15.5 Pipeline Secrets

| Secret | İçerik |
|--------|--------|
| `REGISTRY_HOST` | Image registry URL |
| `REGISTRY_USER` | Registry kullanıcı |
| `REGISTRY_PASSWORD` | Registry şifre/token |
| `BACKEND_PROD_HOST` | Prod backend public/jump IP |
| `BACKEND_TEST_HOST` | Test backend IP (genelde aynı, farklı port) |
| `FRONTEND_PROD_HOST` | Prod frontend IP |
| `FRONTEND_TEST_HOST` | Test frontend IP |
| `DEPLOY_SSH_KEY` | `deploy` user private key |

---

## 16. Database Migration (Flyway)

> ⚠️ Kod tarafında `application.yml` `ddl-auto: update` kullanıyor. **Üretime çıkmadan ÖNCE Flyway'e geçilmesi gerekiyor** (kod değişikliği). Bu DevOps konusu değil, geliştirici görevi — ama deploy öncesi mutlaka tamamlanmalı.

### 16.1 Backend Tarafında Gerekli Değişiklikler

`bizboard-api/pom.xml`:

```xml
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
</dependency>
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-database-postgresql</artifactId>
</dependency>
```

`application-prod.yml`:

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
```

### 16.2 İlk Migration

Mevcut DB'den `pg_dump --schema-only` ile çıkar:

```
backend/bizboard-api/src/main/resources/db/migration/
└── V1__baseline.sql
```

Sonraki değişiklikler `V2__add_audit_table.sql`, `V3__add_index_transactions.sql`, vs.

### 16.3 Migration Akışı

1. Geliştirici migration ekler → PR review
2. `main` merge → CI build → backend makine deploy
3. API container start'ta Flyway otomatik çalışır
4. Migration başarısız olursa **app start etmez** → eski versiyon ayakta kalır

---

## 17. Monitoring ve Alerting

### 17.1 Uptime Monitoring

Self-hosted bir uptime monitor (örn. açık kaynak HTTP probe servisi) frontend makinesinde çalıştırılır. Bu izlenenler:

- `https://app.alanadi.com/` her 60 sn
- `https://api.alanadi.com/actuator/health` her 60 sn
- TCP probe: backend private IP:8080 (sadece frontend'den)
- TCP probe: backend private IP:5432 (sadece local backend'den)
- Backup script'leri (push heartbeat ile)

Alerting kanalı: webhook üzerinden mesajlaşma platformunuza ya da email'e.

### 17.2 Dead-Man's Switch (Cron Sağlık İzleme)

Her cron script'in sonunda bir HTTP ping endpoint'ine istek atar. Eğer beklenen süre içinde ping gelmezse otomatik alarm.

İzlenmesi gerekenler:
1. `backup-prod.sh` (24 saatlik timeout)
2. `sync-to-offsite.sh` (saatlik)
3. `refresh-test-from-prod.sh` (24 saatlik)
4. `restore-drill.sh` (35 günlük)
5. pgBackRest backup'lar

### 17.3 Disk Space Alert

`/opt/bizboard/scripts/disk-check.sh`:

```bash
#!/usr/bin/env bash
THRESHOLD=85
WEBHOOK="${ALERT_WEBHOOK_URL}"
for MOUNT in / /mnt/data; do
    USE=$(df -h "$MOUNT" | awk 'NR==2 {gsub("%",""); print $5}')
    if [ "$USE" -gt "$THRESHOLD" ]; then
        curl -X POST "$WEBHOOK" \
             -H "Content-Type: application/json" \
             -d "{\"text\":\"⚠️ Disk $MOUNT %${USE} dolu (host: $(hostname))\"}"
    fi
done
```

Cron: her saat.

### 17.4 Application-Level Alarming

Backend ve frontend her ikisinde de:
- Sentry-benzeri error tracking servisi (self-hosted veya managed)
- Web Vitals raporlama → backend log endpoint'ine

### 17.5 Alert Severity ve Kanallar

| Sinyal | Kanal | Tepki Süresi |
|--------|-------|--------------|
| 5xx rate > 5% | Acil kanal | Hemen |
| Disk > %85 | Standart kanal | İş saati |
| Backup başarısız | Acil kanal | Hemen |
| Restore drill başarısız | Acil kanal | Hemen |
| Uptime probe down | Acil kanal | 5 dk içinde |
| Security log: path traversal | Acil kanal | Hemen |
| Slow query > 2 sn | Standart kanal | İş saati |

---

## 18. Logging Pipeline

> Detaylı tasarım: [logging_system.md](logging_system.md) (FE+BE log standardizasyonu)

### 18.1 Bu Kurulumda Basit Yaklaşım

1. Backend ve frontend stdout'a JSON yazar
2. Docker `json-file` driver dosyaya yazar (max-size 20MB, max-file 10)
3. Logrotate haftalık gzip
4. Hata araştırması için `docker logs` + `jq`:

```bash
# Belirli request_id'nin tüm log'ları
docker logs bb_prod_api 2>&1 | jq -r 'select(.request_id=="req-abc123")'

# Son saatteki ERROR'lar
docker logs bb_prod_api --since 1h 2>&1 | jq -r 'select(.level=="ERROR")'

# Yavaş endpoint'ler
docker logs bb_prod_api --since 24h 2>&1 | jq -r 'select(.duration_ms > 1000) | "\(.timestamp) \(.path) \(.duration_ms)ms"'
```

### 18.2 Multi-Machine Log Korelasyonu

Frontend ve backend ayrı makinelerde olduğu için log'ları tek yerde görmek için iki seçenek:

**Seçenek A — Centralized log aggregator (Loki/ELK):**
- Tüm makinelerden log shipper (örn. Promtail) ile merkez bir log store'a yollanır
- Tek bir web UI'da `request_id="req-abc"` ile tüm zincir görülür
- Maliyet: 1 ekstra hafif servis

**Seçenek B — Manuel SSH üzerinden:**
```bash
# Frontend log
ssh deploy@frontend "docker logs bb_caddy --since 10m 2>&1 | jq -r 'select(.request_id==\"req-abc\")'"

# Backend log
ssh deploy@backend "docker logs bb_prod_api --since 10m 2>&1 | jq -r 'select(.request_id==\"req-abc\")'"
```

İlk başta seçenek B yeterli; yük artarsa seçenek A'ya geçilir.

### 18.3 Request-ID Korelasyon

Backend ve frontend logları **aynı `X-Request-ID`** header'ını taşıyacak şekilde tasarlandı (bkz. logging_system.md). Bu sayede iki makinedeki log'lar tek bir kullanıcı isteğine bağlanabilir.

---

## 19. Güvenlik Hardening

### 19.1 Secrets Yönetimi

```bash
chmod 600 /opt/bizboard/prod/.env
chmod 600 /opt/bizboard/test/.env
chown deploy:deploy /opt/bizboard/prod/.env
```

Git repo'ya **asla**. `.gitignore`:
```
**/.env
**/secrets/
```

### 19.2 Backend Public Erişim Kontrolü

İdeal durum: backend makinesinin public IP'si yok. Mecbursa:

```bash
# Backend makinesi UFW: sadece operatör IP'sinden SSH, başka public trafiği reddet
ufw delete allow 22/tcp
ufw allow from <operatör-statik-IP> to any port 22 proto tcp
ufw status verbose
```

### 19.3 Origin IP Gizleme (CDN Kullanılıyorsa)

CDN/proxy katmanı varsa frontend public IP'si gizli kalır. Origin firewall'ı sadece CDN IP aralıklarından gelen 80/443'ü kabul edecek şekilde sıkılaştırılır.

### 19.4 Docker Container Güvenliği

Her container'a (özellikle web ve api):
```yaml
security_opt:
  - no-new-privileges:true
read_only: true                # postgres hariç
tmpfs:
  - /tmp
  - /var/cache
cap_drop:
  - ALL
```

### 19.5 SSH Audit

`/etc/audit/rules.d/audit.rules`:
```
-w /etc/ssh/sshd_config -p wa -k sshd-config
-w /home/deploy/.ssh/authorized_keys -p wa -k ssh-keys
-w /opt/bizboard -p wa -k bizboard-config
```

### 19.6 Düzenli Güvenlik Disiplini

| Sıklık | İş |
|--------|-----|
| Otomatik | unattended-upgrades security patch'leri |
| Ayda 1 | `apt upgrade` ve gerekli reboot |
| Ayda 1 | Docker image base güncellemesi (postgres minor, vs.) |
| Üç ayda 1 | Tüm secret'ları rotate et (DB password, JWT secret, off-site key) |
| Yılda 1 | PostgreSQL major upgrade (planlı, test ortamında dene) |
| Yılda 1 | Sıfırdan tam restore drill |

### 19.7 KVKK Uyumluluğu

- Audit log 7 yıl saklanır (logging_system.md detayında)
- Test ortamında PII anonimleştirme zorunlu
- Kullanıcı silme talebi için DB-level prosedür (`UPDATE users SET ... WHERE id=?` + audit kaydı)
- Kullanım koşulları + gizlilik politikası UI'da görünür

---

## 20. Time Sync ve Cross-Machine Koordinasyon

### 20.1 Saat Senkronizasyonu Kritiktir

İki makine farklı saatte ise:
- Log korelasyonu kırılır (`request_id` aynı ama timestamp'ler farklı)
- JWT token expiration validation hatası
- Backup zamanlaması karışır
- Cron çakışmaları olabilir

**Doğrulama:**
```bash
# Her iki makinede:
timedatectl status                # System clock synchronized: yes
chronyc tracking                  # Stratum: 2-3, offset: birkaç µs
```

İki makine arası fark `<100ms` olmalı.

### 20.2 Cron Senkronizasyonu

Backend makine **veri sahibi** olduğu için tüm önemli cron'lar orada çalışır. Frontend makine sadece kendi log rotation, disk check'ler için cron yürütür.

| Cron | Makine |
|------|--------|
| Tüm DB backup'ları | Backend |
| Off-site sync | Backend |
| Test refresh | Backend |
| Restore drill | Backend |
| Disk check | Her iki makinede |
| Log rotation | Her iki makinede |
| Sertifika yenileme | Frontend (Caddy otomatik) |

### 20.3 Konfigürasyon Sürüm Uyumu

Frontend ve backend image versiyonları uyumlu olmalı. Major version değişikliklerinde:

1. Backend yeni versiyon test ortamında deploy edilir
2. Frontend yeni versiyon test ortamında deploy edilir
3. Smoke test (Section 21)
4. İkisi birlikte prod'a alınır

**Aynı CI workflow'da iki adım** (önce backend deploy bekle, sonra frontend deploy) bu uyumu garanti eder.

---

## 21. Production Smoke Test ve Go-Live

### 21.1 Deploy Sonrası Otomatik Smoke Test

Her deploy sonrası bu script çalışır:

```bash
#!/usr/bin/env bash
# /opt/bizboard/scripts/smoke-test.sh
set -euo pipefail

FAIL=0
check() {
    if [ "$2" = "$3" ]; then
        echo "✓ $1"
    else
        echo "✗ $1 (got $2, expected $3)"
        FAIL=1
    fi
}

# Frontend erişilebilir mi
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://app.alanadi.com/)
check "Frontend HTTP" "$STATUS" "200"

# Backend health
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://api.alanadi.com/actuator/health)
check "Backend health" "$STATUS" "200"

# Backend → DB bağlantı
HEALTH=$(curl -s https://api.alanadi.com/actuator/health | jq -r .status)
check "DB connection (UP)" "$HEALTH" "UP"

# Login akışı (test account ile)
LOGIN=$(curl -s -X POST https://api.alanadi.com/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"smoke","password":"smoketest"}')
TOKEN=$(echo "$LOGIN" | jq -r .token)
[ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] && echo "✓ Login flow" || { echo "✗ Login flow"; FAIL=1; }

# Authenticated endpoint
ME=$(curl -s -H "Authorization: Bearer $TOKEN" https://api.alanadi.com/me)
USER=$(echo "$ME" | jq -r .username)
check "Authenticated /me" "$USER" "smoke"

# HTTPS ve security headers
HSTS=$(curl -sI https://app.alanadi.com/ | grep -i strict-transport)
[ -n "$HSTS" ] && echo "✓ HSTS header" || { echo "✗ HSTS header"; FAIL=1; }

exit $FAIL
```

### 21.2 Go-Live Öncesi Tam Doğrulama

| Test | Beklenen Sonuç |
|------|----------------|
| `app.alanadi.com` SSL grade | A veya A+ (ssllabs.com) |
| `api.alanadi.com` SSL grade | A veya A+ |
| HTTP → HTTPS redirect | 301 |
| HSTS header | `max-age=31536000` |
| Backend port 8080 public erişim | Bağlantı reddedilir |
| Backend port 5432 public erişim | Bağlantı reddedilir |
| SSH şifre login | Reddedilir |
| SSH root login | Reddedilir |
| Login (yanlış şifre) | 401 |
| Login (doğru şifre) | 200, JWT döner |
| Sertifika yenileme | Caddy auto-renew log'unda görünür |
| Backup dosyası dün | `/mnt/data/dumps/` içinde var, boyutu makul |
| Off-site bucket | Dünkü dump görünüyor |
| Test refresh | Bu sabah çalışmış (log var) |
| Restore drill | Geçen ay başarılı |

---

## 22. Operatör Görev Listesi (Günlük/Haftalık/Aylık)

### 22.1 Günlük (Otomatik)

- ✅ pgBackRest incremental (02:00)
- ✅ pg_dump logical (03:00)
- ✅ Test environment refresh (03:30)
- ✅ Off-site sync (saatlik)
- ✅ Volume snapshot (05:00)
- ✅ Disk check (saatlik)

### 22.2 Günlük (Operatör — 2 dk)

- [ ] Uptime monitor dashboard'una bak
- [ ] Dead-man's switch kırmızı var mı kontrol

### 22.3 Haftalık (Pazartesi — 30 dk)

- [ ] pgBackRest full backup logları
- [ ] `df -h` her iki makinede
- [ ] Off-site bucket'tan haftalık dump'ı laptop'a indir
- [ ] Şifreli HDD'ye kopyala, fiziksel olarak ofis dışına çıkar
- [ ] `docker system prune -af --volumes` her iki makinede
- [ ] `apt list --upgradable` security update var mı

### 22.4 Aylık (1. günü — 1 saat)

- [ ] Restore drill log'unu incele
- [ ] `apt upgrade` + reboot (4 saatlik bakım penceresi planla)
- [ ] Docker image güncel kontrolü
- [ ] Fail2ban ban listesi
- [ ] `VACUUM ANALYZE` manuel kontrol (otomatik var ama görsel doğrulama)
- [ ] Audit log'larda anormal aktivite var mı bakış

### 22.5 Üç Aylık (1 saat)

- [ ] PITR drill (izole ortamda)
- [ ] Disaster recovery dokümanı güncel mi review
- [ ] Tüm secret rotation:
  - PostgreSQL şifresi
  - JWT secret
  - Off-site access key
  - pgBackRest cipher pass (yedekleri yeniden şifreler)
  - SSH key (opsiyonel)

### 22.6 Yıllık

- [ ] Sıfırdan tam DR drill (yeni VM, restore, smoke test)
- [ ] PostgreSQL major upgrade değerlendirmesi
- [ ] Maliyet ve kapasite review
- [ ] Threat model güncellemesi

---

## 23. Kurulum Checklist — Sıfırdan Tamama

### Faz 1 — Altyapı Hesapları (1-2 saat)

- [ ] Bulut/VPS sağlayıcı hesabı (frontend ve backend için 2 VM hazır)
- [ ] Domain registrar hesabı + alan adı kayıtlı
- [ ] DNS sağlayıcı hesabı (genelde domain registrar veya CDN/proxy sağlayıcısı)
- [ ] S3-uyumlu obje depolama hesabı + private bucket: `bizboard-backups`
- [ ] Container registry erişimi (image push/pull için)
- [ ] Dead-man's switch servisi hesabı (5 endpoint UUID'si)
- [ ] Alerting kanalı (Slack/Telegram/email webhook URL)
- [ ] GPG key pair'i üret (backup şifrelemesi için): `gpg --gen-key`

### Faz 2 — Sunucu Sağlama (1-2 saat)

- [ ] Frontend VM oluştur (2 vCPU, 4 GB, 80 GB SSD)
- [ ] Backend VM oluştur (4 vCPU, 8 GB, 160 GB SSD)
- [ ] Backend VM için 100+ GB ek volume oluştur ve attach et
- [ ] İki VM aynı private network/VPC'ye ata (Section 3.2.A)
  - Eğer farklı sağlayıcılarda: WireGuard kurulumu (Section 3.2.B)
- [ ] Volume snapshot otomatik yedek planı aktif
- [ ] DNS: A kayıtları (app, api, test, test-api, status) → frontend public IP, TTL 300

### Faz 3 — Ortak Hardening (1 saat, her iki makinede)

- [ ] Sistem güncelleme + temel paketler (4.2)
- [ ] Unattended-upgrades (4.3)
- [ ] `deploy` user + SSH key (4.4)
- [ ] SSH hardening — root login disable, password disable (4.5)
- [ ] Fail2ban (4.6)
- [ ] Docker kurulumu (4.7)
- [ ] Timezone Europe/Istanbul + chrony NTP (4.8)
- [ ] Hostname set (4.10)
- [ ] Backend: ek volume mount `/mnt/data` (4.9)

### Faz 4 — Inter-Machine Network (30 dk)

- [ ] Private IP'ler atanmış, ping testi geçer
- [ ] Frontend `/etc/hosts`: `backend.internal` → backend private IP
- [ ] Backend `/etc/hosts`: `frontend.internal` → frontend private IP
- [ ] Backend → Frontend cross-SSH key'i tanımlı (3.5)
- [ ] Firewall kuralları (3.3): backend 8080 sadece frontend private IP'den

### Faz 5 — Backend Stack (2 saat)

- [ ] `/opt/bizboard/` dizin yapısı (6.2)
- [ ] `postgresql.conf` (7.1)
- [ ] `/opt/bizboard/prod/.env` (mode 600) + secret değerler üretildi (6.4)
- [ ] `docker-compose.yml` prod (6.3)
- [ ] `docker-compose.yml` test (6.5)
- [ ] `docker compose up -d` — postgres + api başlat
- [ ] Health check: `curl http://10.0.0.20:8080/actuator/health` döner

### Faz 6 — Frontend Stack (1 saat)

- [ ] Docker network `shared_proxy` oluşturuldu
- [ ] `/opt/bizboard/prod/docker-compose.yml` (web only) (5.3)
- [ ] `/opt/bizboard/test/docker-compose.yml` (5.5)
- [ ] Reverse proxy compose + Caddyfile (8.1-8.2)
- [ ] Caddy başlatıldı, sertifikalar geldi (log'da görünür)
- [ ] `https://app.alanadi.com` 200 dönüyor
- [ ] `https://api.alanadi.com/actuator/health` 200 dönüyor

### Faz 7 — Backup Sistemi (2 saat, backend'de)

- [ ] pgBackRest kurulu (10.1)
- [ ] `pgbackrest.conf` + cipher pass kaydedildi şifre yöneticisine (10.1)
- [ ] PostgreSQL `archive_command` aktif (7.1'de zaten)
- [ ] Stanza-create (10.2)
- [ ] İlk full backup manuel çalıştır: `pgbackrest --stanza=bizboard --type=full backup`
- [ ] GPG key backend makinesinde, off-site dump'ları şifreleyecek
- [ ] Off-site CLI kurulumu (rclone/aws/mc) + auth
- [ ] `backup-prod.sh` test çalıştırması (10.4)
- [ ] `sync-to-offsite.sh` test çalıştırması (10.5)
- [ ] Off-site bucket'ta dosyalar var mı doğrula
- [ ] Cron job'lar yüklü ve `cron` servisi aktif (10.3)
- [ ] Dead-man's switch endpoint'leri tanımlı, environment variable'larda set

### Faz 8 — Test Refresh (1 saat, backend'de)

- [ ] `refresh-test-from-prod.sh` test çalıştırması (12.2)
- [ ] `anonymize-test-data.sql` denendi (12.3)
- [ ] Test admin login (admin/admin123) çalışıyor
- [ ] Cron'a ekle (03:30)

### Faz 9 — CI/CD (1 saat)

- [ ] CI sistem workflow'ları (15.2, 15.3)
- [ ] CI secrets eklendi (15.5)
- [ ] Test branch'ten deploy denendi → test ortamına çıktı
- [ ] Main branch'ten deploy denendi → prod ortamına çıktı
- [ ] Rollback denendi (git revert + auto-deploy)

### Faz 10 — Monitoring (1 saat)

- [ ] Uptime monitor servisi kuruldu (17.1)
- [ ] HTTP probe'lar tanımlı (5+ endpoint)
- [ ] Cron heartbeat'ler dead-man's switch'e bağlı
- [ ] Disk check cron'a ekli
- [ ] Alert kanalı çalışıyor mu manuel test (sahte alarm tetikle)

### Faz 11 — Smoke Test (30 dk)

- [ ] Section 21 tüm testler geçti
- [ ] SSL grade A/A+ (ssllabs.com)
- [ ] Backend public port erişimi reddediliyor (testssl.sh veya nmap dışarıdan)
- [ ] Login akışı çalışıyor

### Faz 12 — Drill (30 dk)

- [ ] `restore-drill.sh` ilk çalıştırma başarılı
- [ ] Aylık cron'a ekle (1. günü 04:00)
- [ ] Section 14 senaryolarından biri (örn. Senaryo A) test ortamında denendi

### Faz 13 — Dökümantasyon (30 dk)

- [ ] Tüm secret'lar şifre yöneticisine kaydedildi:
  - SSH private key
  - Off-site bucket access keys
  - pgBackRest cipher pass
  - GPG private key + passphrase
  - JWT secret
  - PostgreSQL şifresi
  - DNS sağlayıcı API token
  - Sağlayıcı API token
  - Alert webhook URL
  - Image registry credentials
- [ ] Recovery acil durum planı bir kağıda yazılıp güvenli yere kondu
- [ ] Bu dökümanın güncel kopyası `/opt/bizboard/devops_setup.md`'de mevcut

### Faz 14 — Go-Live (1 saat)

- [ ] ANALYSIS.md §8 kritik güvenlik patch'leri uygulanmış mı geliştiriciye sor:
  - IDOR fix
  - File upload security
  - Rate limiting
  - HttpOnly cookie
  - Flyway migration aktif
- [ ] Default `admin/admin123` user kaldırıldı veya şifresi değiştirildi
- [ ] Test ortamında end-to-end senaryo (login, create business, create transaction, upload file)
- [ ] Aynı senaryo prod'da
- [ ] Kullanıcılara erişim bilgileri güvenli kanaldan iletildi

---

## 24. Production Readiness — Son Kontrol Listesi

Aşağıdaki maddelerin **tümü** ✅ olmadan üretime alma:

### Veri Güvenliği
- [ ] PostgreSQL WAL archiving aktif, `archive_command` çalışıyor
- [ ] pgBackRest full + incremental backup cron'da
- [ ] Logical pg_dump GPG ile şifreli, off-site'a gidiyor
- [ ] Volume snapshot otomatik
- [ ] Offline HDD backup prosedürü dökümanlı
- [ ] Restore drill aylık otomatik çalışıyor
- [ ] En az 1 başarılı drill log'u var
- [ ] PITR test edildi (3 ayda 1)
- [ ] Backup cipher pass + GPG key güvenli yerde

### Ağ ve Erişim
- [ ] Frontend public IP'sinden sadece 80, 443, 22 açık
- [ ] Backend port 8080 public'e KAPALI (test edildi dışarıdan)
- [ ] Backend port 5432 public'e KAPALI
- [ ] Frontend ↔ Backend private network çalışıyor
- [ ] SSH şifre login reddediliyor
- [ ] SSH root login reddediliyor
- [ ] Fail2ban aktif, ban listesi temiz
- [ ] DNS A kayıtları doğru, TTL makul
- [ ] HTTPS sertifikası geçerli (en az 30 gün ömrü)
- [ ] HSTS header aktif, max-age >= 1 yıl
- [ ] CSP, X-Frame-Options, Referrer-Policy header'ları doğru
- [ ] CORS sadece prod domain'inden izinli

### Uygulama Hardening
- [ ] `application.yml` `ddl-auto: validate` (update YASAK)
- [ ] Flyway migration aktif ve test edildi
- [ ] JWT secret env zorunlu, fallback yok
- [ ] DB user/password env'den geliyor, default yok
- [ ] Default `admin/admin123` user kaldırıldı
- [ ] CORS_ALLOWED_ORIGINS env-driven
- [ ] Logging seviyesi `INFO` (prod), `DEBUG` kapalı
- [ ] Stack trace client'a dönmüyor (`server.error.include-stacktrace: never`)
- [ ] Actuator sadece `health` expose
- [ ] Rate limiting devrede (login: 5/dk/IP)
- [ ] Account lockout devrede (5 fail → 15 dk)
- [ ] Audit log yazılıyor (12 kritik olay için)

### Test Ortamı
- [ ] Test stack'i ayrı DB, ayrı volume, ayrı network'te
- [ ] Test refresh günlük çalışıyor
- [ ] Test anonimleştirme script'i etkili (PII gerçek değer içermiyor)
- [ ] `APP_EXTERNAL_INTEGRATIONS_ENABLED=false` test'te
- [ ] Test public'e basic auth ile kapalı

### CI/CD
- [ ] Branch-based deploy çalışıyor (test → test ortamı, main → prod)
- [ ] Test'te smoke test geçmeden prod'a otomatik geçiş yok
- [ ] Rollback prosedürü test edildi
- [ ] CI secrets güvenli (repo'da plain text yok)

### Monitoring
- [ ] Uptime monitor 5+ endpoint izliyor
- [ ] Dead-man's switch tüm cron'lara bağlı
- [ ] Disk space alert
- [ ] Alert kanalı manuel test edildi (gerçek bir alarm gönderildi)
- [ ] Log'lar JSON formatında, request_id ile korelasyon mümkün

### İşletim
- [ ] Operatör günlük/haftalık/aylık görev listesi (Section 22) okundu
- [ ] Disaster recovery senaryolar (Section 14) okundu
- [ ] Tüm secret'lar şifre yöneticisinde
- [ ] Bu döküman güncel kopyası /opt/bizboard'da
- [ ] Acil durum talimat kağıdı fiziksel olarak güvenli yerde

### Yasal/Compliance
- [ ] KVKK aydınlatma metni UI'da
- [ ] Gizlilik politikası UI'da
- [ ] Cookie consent banner (eğer üçüncü taraf çerez varsa)
- [ ] Veri silme talebi prosedürü yazılı
- [ ] Audit log retention en az 7 yıl olarak yapılandırılmış

---

## Ek A — Kullanışlı Alias'lar

Operatörün `/home/deploy/.bashrc`'sine her iki makinede:

```bash
# Frontend makinesinde:
alias bb-prod='cd /opt/bizboard/prod && docker compose'
alias bb-test='cd /opt/bizboard/test && docker compose'
alias bb-proxy='cd /opt/bizboard/proxy && docker compose'
alias bb-caddy='docker logs -f --tail 100 bb_caddy'

# Backend makinesinde:
alias bb-prod='cd /opt/bizboard/prod && docker compose'
alias bb-test='cd /opt/bizboard/test && docker compose'
alias bb-api='docker logs -f --tail 100 bb_prod_api | jq -r'
alias bb-db='docker logs -f --tail 100 bb_prod_postgres'
alias bb-psql='docker exec -it bb_prod_postgres psql -U bizboard_app -d bizboard'
alias bb-backup-now='docker exec bb_prod_postgres su - postgres -c "pgbackrest --stanza=bizboard --type=incr backup"'
alias bb-refresh-test='/opt/bizboard/scripts/refresh-test-from-prod.sh'
alias bb-smoke='/opt/bizboard/scripts/smoke-test.sh'
alias bb-disk='df -h / /mnt/data && du -sh /mnt/data/*'
```

---

## Ek B — Acil Durum Talimat Kağıdı

> Yazılı kalsın, panik anında her şey kaybolur.

```
PANİK YAPMA. NEFES AL.

ERİŞİM:
  Sağlayıcı konsolu  : <url>     (login → 1Password)
  DNS sağlayıcısı     : <url>
  Off-site bucket     : <url>
  Şifre yöneticisi    : <url>

MAKİNELER:
  Frontend public IP  : ____.____.____.____
  Backend public IP   : ____.____.____.____ (varsa)
  Frontend private IP : 10.0.0.10
  Backend private IP  : 10.0.0.20

DÖKÜMANLAR:
  Bu döküman          : /opt/bizboard/devops_setup.md
  Disaster Recovery   : Section 14
  Smoke test          : /opt/bizboard/scripts/smoke-test.sh

KRİTİK SECRET YERLERİ (şifre yöneticisi):
  - bizboard-pgbackrest-cipher-pass
  - bizboard-gpg-passphrase
  - bizboard-jwt-secret
  - bizboard-db-password
  - bizboard-offsite-key

ARIZA AKIŞI:
  1. Uptime monitor'a bak — neresi down?
     • Frontend down  → Senaryo D (Section 14)
     • Backend down   → Senaryo C
     • DB down        → Senaryo B
     • Veri kaybı     → Senaryo A
  2. Onarılamıyorsa → Senaryo E (felaket)
```

---

**Döküman sonu.**

Bu mimari aşağıdaki sorunsuz ölçeklenir:
- 50 kullanıcıdan 500 kullanıcıya → backend makinesinin RAM'ini 2× artır
- 100 GB veriden 1 TB'a → backend volume'unu büyüt
- Aynı sağlayıcı bölgesinden farklı bölgeye → DNS A kaydını güncelle

**Aşağıdaki noktalarda yeniden değerlendirme yap:**
- 1000+ eşzamanlı kullanıcı → managed DB servisi düşün
- Birden fazla DC felaketi riski → multi-region (büyük mühendislik yatırımı)
- Saniyede 100+ transaction → caching katmanı (Redis vb.)

İyi şanslar — basit, ucuz, sağlam bir kurulum yaptın.

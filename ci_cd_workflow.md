# BizBoard — CI/CD ve Deploy Akışı

> **Hedef Okuyucu:** Kod yazan ve operasyon yapan tek kişi (sen).
> **Bu dökümanı okuduktan sonra:** Bir feature kodlayıp prod'a çıkana kadar her adımda ne olduğunu, ne zaman müdahale edeceğini, hata durumunda ne yapacağını bileceksin.
> **Önkoşul:** [devops_setup.md](devops_setup.md) altyapısı kurulmuş olmalı.

---

## 0. Bu Döküman Neden Var?

> Soru: "Yaptığım güncellemeleri prod'a nasıl çıkaracağım? Yeniden deploy alarak mı?"

**Kısa cevap:** Evet, "yeniden deploy" ile. Ama bu senin için **tek tıkla yapılan** bir iş; arka planda 12 adım otomatik koşuyor. Bu döküman o 12 adımı, ne zaman onayla, ne zaman dur, hata durumunda ne yap konularını anlatıyor.

**Önemli tasarım kararı:**
- Test ortamı: `git push` ile **otomatik** deploy (hız önemli)
- Prod ortamı: **manuel onay** (güvenlik önemli)

Bu ayrım kasten yapıldı. Tek geliştirici hızlı iterasyon ister; ama prod'a kazara kod gönderme riski sıfıra inmeli.

---

## İçindekiler

1. [Genel Akış Diyagramı](#1-genel-akış-diyagramı)
2. [Branch Stratejisi](#2-branch-stratejisi)
3. [CI/CD Konfigürasyonu (İlk Kurulum)](#3-cicd-konfigürasyonu-i̇lk-kurulum)
4. [Günlük Geliştirme Akışı (Step-by-Step)](#4-günlük-geliştirme-akışı-step-by-step)
5. [Test → Prod Promosyonu](#5-test--prod-promosyonu)
6. [Deploy Sırasında Teknik Olarak Ne Oluyor?](#6-deploy-sırasında-teknik-olarak-ne-oluyor)
7. [Veritabanı Migration Akışı](#7-veritabanı-migration-akışı)
8. [Rollback (Geri Alma) Prosedürleri](#8-rollback-geri-alma-prosedürleri)
9. [Hotfix Akışı — Acil Durum](#9-hotfix-akışı--acil-durum)
10. [Pre-Deploy Kontrol Listesi](#10-pre-deploy-kontrol-listesi)
11. [Post-Deploy Doğrulama](#11-post-deploy-doğrulama)
12. [Versiyonlama Stratejisi](#12-versiyonlama-stratejisi)
13. [Yaygın Senaryolar (FAQ)](#13-yaygın-senaryolar-faq)
14. [Zero-Downtime Deploy (Opsiyonel İleri)](#14-zero-downtime-deploy-opsiyonel-i̇leri)
15. [Hızlı Referans Kartı](#15-hızlı-referans-kartı)

---

## 1. Genel Akış Diyagramı

```
                ┌─────────────────────────────────┐
                │   SEN (Yerel Geliştirme)        │
                │   • Kod yaz, test et            │
                │   • git commit                  │
                └─────────────────┬───────────────┘
                                  │
                                  │ git push origin test
                                  ▼
       ┌──────────────────────────────────────────────────────┐
       │  CI Pipeline (Test Branch)              [OTOMATİK]   │
       │  1. mvn verify  /  npm test                          │
       │  2. Lint + typecheck                                 │
       │  3. Docker image build → :test tag                   │
       │  4. Image registry'e push                            │
       │  5. Test makinelerine SSH deploy                     │
       │     - docker compose pull && up -d                   │
       │  6. Test ortamında smoke test                        │
       │  Süre: 2-4 dk                                        │
       └──────────────────┬───────────────────────────────────┘
                          │
                          │ Sonuç: ✓ veya ✗
                          ▼
                ┌─────────────────────────────────┐
                │  https://test.alanadi.com       │
                │  SEN: tarayıcıda doğrula        │
                │  • Login, click, CRUD test      │
                │  • Edge case'leri dene          │
                └─────────────────┬───────────────┘
                                  │
                                  │ Beğendiysen:
                                  │ Pull Request: test → main
                                  ▼
       ┌──────────────────────────────────────────────────────┐
       │  Pull Request                          [SEN ONAYLA]  │
       │  • CI tests yeniden çalışır                          │
       │  • main'e merge butonuna bas                         │
       └──────────────────┬───────────────────────────────────┘
                          │
                          │ Merge to main
                          ▼
       ┌──────────────────────────────────────────────────────┐
       │  CI Pipeline (Main Branch)              [OTOMATİK]   │
       │  1. Tests + build                                    │
       │  2. Docker image build → :latest tag                 │
       │  3. Image registry'e push                            │
       │  4. ⛔ DURUR — manuel onay bekler                    │
       └──────────────────┬───────────────────────────────────┘
                          │
                          │ "Approve Production Deploy" butonu
                          ▼
       ┌──────────────────────────────────────────────────────┐
       │  Production Deploy                     [SEN BAŞLAT]  │
       │  1. Otomatik backup tetiklenir                       │
       │  2. Backend deploy (docker compose up -d api)        │
       │  3. Health check geç (10 sn timeout)                 │
       │  4. Frontend deploy (docker compose up -d web)       │
       │  5. Health check geç                                 │
       │  6. Smoke test çalıştır                              │
       │  7. Sonuç bildir                                     │
       │  Süre: 1-2 dk (downtime ~30 sn)                      │
       └──────────────────┬───────────────────────────────────┘
                          │
              ┌───────────┴────────────┐
              │                        │
        ✓ Başarılı              ✗ Smoke test fail
              │                        │
              ▼                        ▼
        Bildirim:               OTOMATİK ROLLBACK
        "Deploy OK"             Önceki image tag'ine dön
                                Bildirim: "Deploy fail, rolled back"
```

---

## 2. Branch Stratejisi

Bu kurulum için **minimum karmaşıklık, maksimum güvenlik** stratejisi:

| Branch | Amaç | Auto-deploy | Korumalı |
|--------|------|-------------|----------|
| `main` | Prod kaynak kodu | ❌ (manuel onay) | ✅ Direkt push yasak |
| `test` | Test ortamı | ✅ Otomatik | ❌ Direkt push serbest |
| `feature/*` | Yerel geliştirme | — | — |
| `hotfix/*` | Acil prod düzeltmesi | — | (akış §9) |

### 2.1 Neden Sadece 2 Branch?

Tek geliştirici için Git Flow gibi karmaşık modeller fazla ağır. Bu basit model:
- Anlaması kolay
- Hatası az
- Hızlı

### 2.2 Branch Koruma Kuralları

`main` branch'ine git hosting platformunda şu kurallar tanımlanır:
- Direkt push **yasak** (sadece PR merge)
- En az 1 onay (kendi PR'ını kendin onaylıyorsun, dert değil — formaliteyle kontrol)
- CI testleri geçmeden merge yasak
- Force push **yasak**

`test` branch'i serbesttir; istediğin gibi push edebilirsin.

---

## 3. CI/CD Konfigürasyonu (İlk Kurulum)

### 3.1 Genel Yapı

`.github/workflows/` (ya da CI sağlayıcınızın eşdeğer klasörü) altında 3 workflow:

```
.github/workflows/
├── ci.yml                  # Her push'ta test + lint
├── deploy-test.yml         # test branch → test ortam (otomatik)
└── deploy-prod.yml         # main branch → image build + manuel deploy
```

### 3.2 Workflow 1: `ci.yml` — Test ve Lint

Her push ve PR için çalışır, deploy yapmaz.

```yaml
name: CI
on:
  push:
    branches: [main, test]
  pull_request:
    branches: [main, test]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: maven
      - name: Run tests
        working-directory: backend/bizboard
        run: mvn -B verify
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: backend-test-results
          path: backend/bizboard/**/target/surefire-reports

  frontend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: frontend/bizboard/package-lock.json
      - name: Install
        working-directory: frontend/bizboard
        run: npm ci
      - name: Typecheck
        working-directory: frontend/bizboard
        run: npx tsc --noEmit
      - name: Lint
        working-directory: frontend/bizboard
        run: npm run lint
      - name: Build
        working-directory: frontend/bizboard
        run: npm run build
```

### 3.3 Workflow 2: `deploy-test.yml` — Test Ortamına Otomatik

```yaml
name: Deploy to Test
on:
  push:
    branches: [test]

concurrency:
  group: deploy-test
  cancel-in-progress: false        # Aynı anda 2 deploy çakışmasın

jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      # ===== BACKEND =====
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Backend tests
        working-directory: backend/bizboard
        run: mvn -B verify

      - name: Login to image registry
        run: echo "${{ secrets.REGISTRY_PASSWORD }}" \
             | docker login ${{ secrets.REGISTRY_HOST }} \
                  -u ${{ secrets.REGISTRY_USER }} --password-stdin

      - name: Build backend image
        uses: docker/build-push-action@v5
        with:
          context: backend/bizboard
          push: true
          tags: |
            ${{ secrets.REGISTRY_HOST }}/bizboard-api:test
            ${{ secrets.REGISTRY_HOST }}/bizboard-api:test-${{ github.sha }}

      # ===== FRONTEND =====
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: npm
          cache-dependency-path: frontend/bizboard/package-lock.json

      - name: Build frontend image
        uses: docker/build-push-action@v5
        with:
          context: frontend/bizboard
          push: true
          tags: |
            ${{ secrets.REGISTRY_HOST }}/bizboard-web:test
            ${{ secrets.REGISTRY_HOST }}/bizboard-web:test-${{ github.sha }}

      # ===== DEPLOY: Backend Makinesi =====
      - name: Deploy backend (test)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.BACKEND_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            set -e
            cd /opt/bizboard/test
            docker compose pull api
            docker compose up -d --no-deps api
            sleep 8
            curl -fsS http://localhost:8081/actuator/health > /dev/null
            echo "✓ Backend test deploy OK"

      # ===== DEPLOY: Frontend Makinesi =====
      - name: Deploy frontend (test)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.FRONTEND_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            set -e
            cd /opt/bizboard/test
            docker compose pull web
            docker compose up -d --no-deps web
            sleep 5
            curl -fsS https://test.alanadi.com/ -u deploy:${{ secrets.TEST_BASIC_AUTH_PASS }} -o /dev/null
            echo "✓ Frontend test deploy OK"

      # ===== SMOKE TEST =====
      - name: Smoke test
        run: |
          set -e
          # Test ortamı basic auth ile gizli, --user ile geç
          AUTH="${{ secrets.TEST_BASIC_AUTH_USER }}:${{ secrets.TEST_BASIC_AUTH_PASS }}"
          curl -fsS --user "$AUTH" https://test-api.alanadi.com/actuator/health > /dev/null
          curl -fsS --user "$AUTH" https://test.alanadi.com/ > /dev/null
          echo "✓ Smoke test passed"

      # ===== BİLDİRİM =====
      - name: Notify on success
        if: success()
        run: |
          curl -X POST "${{ secrets.ALERT_WEBHOOK }}" \
               -H "Content-Type: application/json" \
               -d '{"text":"✅ Test deploy başarılı: ${{ github.event.head_commit.message }}"}'

      - name: Notify on failure
        if: failure()
        run: |
          curl -X POST "${{ secrets.ALERT_WEBHOOK }}" \
               -H "Content-Type: application/json" \
               -d '{"text":"❌ Test deploy BAŞARISIZ: ${{ github.event.head_commit.message }}"}'
```

### 3.4 Workflow 3: `deploy-prod.yml` — Manuel Onaylı Prod Deploy

Bu workflow **iki aşamalı**:
1. `main`'e merge sonrası: image build (otomatik)
2. Manuel onay bekler → deploy başlar

```yaml
name: Deploy to Production
on:
  push:
    branches: [main]
  workflow_dispatch:           # Manuel tetikleme imkanı
    inputs:
      sha:
        description: 'Deploy edilecek commit SHA (boş bırak = son main)'
        required: false

concurrency:
  group: deploy-prod
  cancel-in-progress: false

jobs:

  # ========================================
  # AŞAMA 1: Image Build (Otomatik)
  # ========================================
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    outputs:
      sha: ${{ steps.sha.outputs.value }}
      version: ${{ steps.version.outputs.value }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.sha || github.sha }}

      - name: Resolve SHA
        id: sha
        run: echo "value=$(git rev-parse --short HEAD)" >> $GITHUB_OUTPUT

      - name: Generate version tag
        id: version
        run: echo "value=v$(date +%Y.%m.%d)-${{ steps.sha.outputs.value }}" >> $GITHUB_OUTPUT

      # Backend
      - uses: actions/setup-java@v4
        with: { java-version: '21', distribution: 'temurin' }

      - name: Backend tests (zorunlu - prod için)
        working-directory: backend/bizboard
        run: mvn -B verify

      - name: Login to image registry
        run: echo "${{ secrets.REGISTRY_PASSWORD }}" \
             | docker login ${{ secrets.REGISTRY_HOST }} \
                  -u ${{ secrets.REGISTRY_USER }} --password-stdin

      - name: Build & push backend image
        uses: docker/build-push-action@v5
        with:
          context: backend/bizboard
          push: true
          tags: |
            ${{ secrets.REGISTRY_HOST }}/bizboard-api:latest
            ${{ secrets.REGISTRY_HOST }}/bizboard-api:${{ steps.version.outputs.value }}
            ${{ secrets.REGISTRY_HOST }}/bizboard-api:sha-${{ steps.sha.outputs.value }}

      # Frontend
      - uses: actions/setup-node@v4
        with: { node-version: '20' }

      - name: Build & push frontend image
        uses: docker/build-push-action@v5
        with:
          context: frontend/bizboard
          push: true
          tags: |
            ${{ secrets.REGISTRY_HOST }}/bizboard-web:latest
            ${{ secrets.REGISTRY_HOST }}/bizboard-web:${{ steps.version.outputs.value }}
            ${{ secrets.REGISTRY_HOST }}/bizboard-web:sha-${{ steps.sha.outputs.value }}

      - name: Notify build complete
        run: |
          curl -X POST "${{ secrets.ALERT_WEBHOOK }}" \
               -H "Content-Type: application/json" \
               -d "{\"text\":\"📦 Prod image hazır: ${{ steps.version.outputs.value }}\nDeploy için butona tıkla: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}\"}"

  # ========================================
  # AŞAMA 2: Production Deploy (Manuel Onay)
  # ========================================
  deploy-prod:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: production              # ← Environment protection rules burada uygulanır
      url: https://app.alanadi.com
    steps:
      - uses: actions/checkout@v4

      # ---------- PRE-DEPLOY ----------
      - name: Trigger backup before deploy
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.BACKEND_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            echo "Pre-deploy backup başlatılıyor..."
            docker exec bb_prod_postgres su - postgres -c \
                "pgbackrest --stanza=bizboard --type=incr backup" \
                || { echo "FATAL: backup başarısız, deploy iptal"; exit 1; }
            echo "✓ Backup tamam"

      - name: Save current image tags (rollback için)
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.BACKEND_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            CURRENT=$(docker inspect bb_prod_api --format='{{.Config.Image}}')
            echo "$CURRENT" > /opt/bizboard/prod/.previous-api-image
            echo "Önceki API image: $CURRENT"
          # Aynısını frontend için de yap

      # ---------- DEPLOY BACKEND ----------
      - name: Deploy backend (prod)
        id: deploy-backend
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.BACKEND_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            set -e
            cd /opt/bizboard/prod
            export API_TAG=${{ needs.build.outputs.version }}
            docker compose pull api
            docker compose up -d --no-deps api

            # 30 saniye boyunca health check dene
            for i in {1..15}; do
                if curl -fsS http://localhost:8080/actuator/health > /dev/null; then
                    echo "✓ Backend healthy (${i}. denemede)"
                    exit 0
                fi
                sleep 2
            done
            echo "✗ Backend health check başarısız"
            exit 1

      # ---------- DEPLOY FRONTEND ----------
      - name: Deploy frontend (prod)
        id: deploy-frontend
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.FRONTEND_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            set -e
            cd /opt/bizboard/prod
            export WEB_TAG=${{ needs.build.outputs.version }}
            docker compose pull web
            docker compose up -d --no-deps web
            sleep 5
            curl -fsS https://app.alanadi.com/ -o /dev/null
            echo "✓ Frontend healthy"

      # ---------- SMOKE TEST ----------
      - name: Production smoke test
        id: smoke
        run: |
          set -e
          curl -fsS https://app.alanadi.com/ > /dev/null
          curl -fsS https://api.alanadi.com/actuator/health > /dev/null

          # Health detay kontrolü
          HEALTH=$(curl -s https://api.alanadi.com/actuator/health | jq -r .status)
          [ "$HEALTH" = "UP" ] || { echo "Health UP değil: $HEALTH"; exit 1; }

          # Login akışı (test account ile)
          LOGIN=$(curl -s -X POST https://api.alanadi.com/auth/login \
                       -H "Content-Type: application/json" \
                       -d '{"username":"smoke","password":"${{ secrets.SMOKE_USER_PASS }}"}')
          TOKEN=$(echo "$LOGIN" | jq -r .token)
          [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ] || { echo "Login fail"; exit 1; }

          echo "✓ Smoke test passed"

      # ---------- ROLLBACK ON FAILURE ----------
      - name: Auto-rollback on smoke test failure
        if: failure() && (steps.deploy-backend.outcome == 'success' || steps.deploy-frontend.outcome == 'success')
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.BACKEND_HOST }}
          username: deploy
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            echo "🔴 Smoke test başarısız — ROLLBACK başlıyor"
            PREV=$(cat /opt/bizboard/prod/.previous-api-image)
            cd /opt/bizboard/prod
            export API_TAG=$(echo "$PREV" | cut -d: -f2)
            docker compose pull api
            docker compose up -d --no-deps api
            sleep 8
            curl -fsS http://localhost:8080/actuator/health > /dev/null
            echo "↩️  Rollback tamamlandı: $PREV"

      # ---------- BİLDİRİM ----------
      - name: Notify success
        if: success()
        run: |
          curl -X POST "${{ secrets.ALERT_WEBHOOK }}" \
               -H "Content-Type: application/json" \
               -d "{\"text\":\"🚀 PROD DEPLOY BAŞARILI\nVersiyon: ${{ needs.build.outputs.version }}\nCommit: ${{ github.event.head_commit.message }}\"}"

      - name: Notify failure (rollback)
        if: failure()
        run: |
          curl -X POST "${{ secrets.ALERT_WEBHOOK }}" \
               -H "Content-Type: application/json" \
               -d "{\"text\":\"⚠️  PROD DEPLOY BAŞARISIZ — Rollback yapıldı\nLog: ${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}\"}"
```

### 3.5 Environment Protection Rules

CI sağlayıcınızın "environment" özelliği (GitHub Actions, GitLab environments, vb.) ile `production` ortamına şu kurallar tanımlanır:

| Kural | Değer | Sebep |
|-------|-------|-------|
| Required reviewers | 1 (sen kendin) | Manuel "Approve" butonu çıkar |
| Wait timer | 0 dk (veya 5 dk) | İptal etmek için süre |
| Deployment branches | sadece `main` | Yanlışlıkla başka branch'ten deploy yok |
| Required secrets | DEPLOY_SSH_KEY, vb. | Otomatik denetim |

Bu sayede `main`'e merge sonrası workflow **AŞAMA 1 (image build)** çalışır, biter, **AŞAMA 2 (deploy)** ekrana "Waiting for approval" düşer. Sen butona tıklayana kadar prod'a hiçbir şey gitmez.

### 3.6 Gerekli CI Secrets

| Secret | İçerik |
|--------|--------|
| `REGISTRY_HOST` | Image registry URL |
| `REGISTRY_USER` | Registry kullanıcı |
| `REGISTRY_PASSWORD` | Registry şifre/token |
| `BACKEND_HOST` | Backend public IP (veya jump host üzerinden) |
| `FRONTEND_HOST` | Frontend public IP |
| `DEPLOY_SSH_KEY` | `deploy` user private SSH key |
| `ALERT_WEBHOOK` | Bildirim webhook URL |
| `TEST_BASIC_AUTH_USER` | Test ortamı basic auth kullanıcı |
| `TEST_BASIC_AUTH_PASS` | Test ortamı basic auth şifre |
| `SMOKE_USER_PASS` | Smoke test için account şifresi |

---

## 4. Günlük Geliştirme Akışı (Step-by-Step)

> Diyelim ki: "Borç modülüne export-to-Excel butonu ekleyeceğim."

### 4.1 Adım 1: Yerel Geliştirme

```bash
git checkout test
git pull
git checkout -b feature/debt-excel-export

# Backend + frontend değişiklikleri yap
# Yerel test et:
cd backend/bizboard && mvn test
cd frontend/bizboard && npm run lint && npx tsc --noEmit
```

### 4.2 Adım 2: Test Branch'ine Push

```bash
git checkout test
git merge feature/debt-excel-export
git push origin test
```

> Veya doğrudan `feature/debt-excel-export`'ten PR aç → `test` branch'ine merge et. Tek geliştirici için ikisi de OK.

### 4.3 Adım 3: CI'ı İzle

CI sağlayıcısının web UI'ında workflow başlar. ~3 dakika sonra:

**Başarılı senaryo:**
```
✓ backend-test     (45s)
✓ frontend-test    (32s)
✓ Build & push backend image      (78s)
✓ Build & push frontend image     (52s)
✓ Deploy backend (test)           (12s)
✓ Deploy frontend (test)          (8s)
✓ Smoke test                       (3s)
```

Alert kanalına `✅ Test deploy başarılı` mesajı gelir.

**Başarısız senaryo:**
```
✓ backend-test
✗ frontend-test    (typecheck fail: src/components/...)
```

Alert: `❌ Test deploy başarısız`. Hatayı düzelt, yeniden push et.

### 4.4 Adım 4: Test Ortamında Doğrula

`https://test.alanadi.com` aç (basic auth ile). Yeni Excel export butonunu manuel olarak dene:
- Buton görünür mü?
- Tıklayınca Excel iniyor mu?
- Veriler doğru mu?
- Mobil görünüm OK mı?
- Boş veri senaryosu çalışıyor mu?
- Yetkisiz kullanıcı erişebiliyor mu? (yetki bypass testi)

Test refresh günlük olduğu için **prod-benzeri veriyle** test edersin.

### 4.5 Adım 5: Production'a Yolla

Test ortamında her şey OK. Şimdi:

```bash
# Test → main PR aç
git checkout main
git pull
git checkout -b promote/debt-excel-export
git merge test
git push origin promote/debt-excel-export
```

CI sağlayıcısı web UI'da:
1. Pull Request aç: `promote/debt-excel-export` → `main`
2. CI tests yeniden çalışır (3-4 dk)
3. "Merge" butonuna tıkla
4. `main`'e merge olur

**Otomatik tetiklenenler:**
- `deploy-prod.yml` workflow'u başlar
- AŞAMA 1: Image build (5-7 dk)
- AŞAMA 1 biter, Slack/email: `📦 Prod image hazır: v2026.05.11-abc1234`
- AŞAMA 2: **Beklemede** — "Approve" butonu

### 4.6 Adım 6: Production Deploy Onayı

Şimdi karar zamanı:
- "Hazır mıyım?" diye düşün
- Pre-deploy checklist (§10) kontrol et
- Saat uygun mu? (Mesai içi mi, kullanıcılar aktif mi?)

Hazırsan: CI UI'da workflow'un detayına git → **"Review deployments" → "Approve and deploy"** butonu

**AŞAMA 2 çalışır:**
- Otomatik backup
- Backend deploy → health check
- Frontend deploy → health check
- Smoke test
- Slack: `🚀 PROD DEPLOY BAŞARILI`

Toplam süre: ~2 dakika. Downtime: ~30 saniye (container restart).

### 4.7 Adım 7: Post-Deploy Doğrulama

Deploy bittikten sonra **5 dakika boyunca** izle:
- `https://app.alanadi.com` aç, kendi hesabınla gir
- Yeni özelliği gerçek prod verisinde dene
- Uptime monitor'da kırmızı yok mu?
- Backend log'da error spike var mı?

Detaylar §11'de.

---

## 5. Test → Prod Promosyonu

### 5.1 "Promote" Stratejisi Neden?

İki ortam arasında **kod aynı, image aynı, sadece tag farklı** olmalı:

```
test branch'i tag → :test
main branch'i tag → :latest, :v2026.05.11-abc1234, :sha-abc1234
```

Aynı kod hem `:test` hem `:latest` olarak build edilirse, prod'a giden image test'te denenmiş olur.

### 5.2 Test'ten Prod'a Geçişte Riskler

Test ortamında çalışan kodun prod'da çalışmama ihtimali:

| Risk | Önlem |
|------|-------|
| Test'te env var var, prod'da yok | Pre-deploy checklist (§10) |
| Test DB'sinde varolan tablo prod'da yok | Flyway migration (§7) |
| Test'te dış servis mock, prod'da gerçek | `APP_EXTERNAL_INTEGRATIONS_ENABLED` ayarı |
| Test'te az veri, prod'da çok | Test refresh prod-mirror yapıyor (kısmen çözüm) |
| Test'te eski cache, prod'da yeni schema | App restart cache temizler |

### 5.3 Test'te Doğrulamadan Prod'a Push Yapmak

Bu yasak değildir, sadece riskli. Workflow seni şöyle koruyor:
- `main`'e PR açtığında CI testleri yine çalışır (typecheck, unit test)
- `main`'e merge sonrası bile prod'a deploy için manuel onay gerekir
- Smoke test başarısızsa otomatik rollback

Ama yine de mantıklı yol: **test'te dene → tatmin ol → prod'a yolla**.

---

## 6. Deploy Sırasında Teknik Olarak Ne Oluyor?

### 6.1 Backend Deploy Adım Adım

```
t=0:    docker compose pull api
        → :latest tag'inde yeni image image registry'den indirilir
        → eski container çalışmaya devam eder
        → kullanıcılar etkilenmez

t=15s:  docker compose up -d --no-deps api
        → Compose karşılaştırma yapar: yeni image vs çalışan container
        → Eski container'ı durdurur (SIGTERM, 10sn timeout sonra SIGKILL)
        → Spring Boot graceful shutdown yapar (in-flight request'leri tamamlar)

t=20s:  Eski container durdu
        → Yeni container start eder

t=25s:  Spring Boot başlangıç
        → Hibernate validate (Flyway migration burada çalışır)
        → Bean'ler hazırlanır
        → 8080 portu dinlemeye başlar

t=35s:  Health check geçer
        → curl /actuator/health → 200 UP
        → Reverse proxy yeni container'a yönlendirir

t=35s:  Smoke test çalışır
        → /actuator/health
        → /auth/login (smoke user)
        → /me (token ile)
        → tüm endpoint'ler 200

t=45s:  Bildirim atılır
        → "Deploy başarılı"

TOPLAM DOWNTIME: ~15 saniye (t=20s — t=35s arası 502/503 alınabilir)
```

### 6.2 Frontend Deploy Adım Adım

Daha hızlı, çünkü Next.js stateless:

```
t=0:    docker compose pull web        → 5 sn
t=5s:   docker compose up -d --no-deps web
t=8s:   Eski container durur
t=10s:  Yeni container start
t=12s:  Next.js hazır (port 3000 listening)
t=12s:  Caddy yeni container'a yönlendiriyor
t=15s:  Smoke test geçer

TOPLAM DOWNTIME: ~5 saniye
```

### 6.3 İki Makinedeki Senkronizasyon

Backend ve frontend ayrı makinelerde olduğu için deploy sırası:

```
1. Backend deploy (önce)        — yeni API endpoint'leri hazır
2. Backend health check geç     — DB migration tamamlandı
3. Frontend deploy (sonra)      — yeni FE eski API'yi de tolere etsin
4. Frontend health check geç
```

**Neden bu sıra?** Frontend yeni endpoint'i çağırabilir. Eğer önce frontend deploy edersek, backend henüz yeni endpoint'e sahip değil → 404. Backend önce deploy edilirse, eski frontend yine eski endpoint'leri kullanır (geriye uyumluluk korunduysa) ve yeni frontend hazır olunca yeni endpoint'leri kullanır.

### 6.4 Geriye Uyumluluk Kuralları

Deploy sırasında **eski FE + yeni BE** ya da **eski BE + yeni FE** kombinasyonu kısa süreliğine var olur. Bu süreyi sorunsuz geçirmek için:

| Değişiklik | Geriye uyumlu mu? | Strateji |
|------------|-------------------|----------|
| Yeni endpoint ekleme | ✅ Evet | Direkt deploy |
| Endpoint silme | ❌ Hayır | Önce deprecate, 1 release sonra sil |
| Response'a yeni field ekleme | ✅ Evet | FE yeni field'ı kullanır, eski FE umursamaz |
| Response'tan field silme | ❌ Hayır | Önce FE'den kaldır, sonra BE'den |
| Request body değişikliği | ❌ Tehlikeli | İki versiyon endpoint (`/v1/`, `/v2/`) ya da optional alanlar |
| DB column ekleme | ✅ Evet | Migration |
| DB column silme | ❌ Hayır | Önce FE/BE'den kullanımını kaldır, sonra DB |
| DB column rename | ❌ Hayır | Expand-contract pattern (yeni column ekle, kod iki yere yaz, eski sil) |

> **Bu kurallara uymayan bir değişiklik yapmak istersen:** Mesai dışı saatte deploy yap (kullanıcı yok), kısa downtime tolere et.

---

## 7. Veritabanı Migration Akışı

### 7.1 Flyway Lifecycle

```
Geliştirici → V42__add_audit_table.sql ekler
            → backend/bizboard-api/src/main/resources/db/migration/

git push → CI build → image içine migration dosyaları gömülür

Deploy → Spring Boot start
       → Flyway bootstrap
       → schema_history tablosunu kontrol et
       → V42 daha çalıştırılmamış → CHEK SUM hesaplayıp uygular
       → schema_history'e kayıt ekle
       → Spring Boot devam eder

Migration başarısız:
       → Spring Boot start etmez
       → Eski container hala ayakta (henüz durdurulmadı)
       → Health check fail → otomatik rollback
```

### 7.2 Migration Yazma Kuralları

**HER ZAMAN:**
- Migration dosyaları **immutable**. V42 bir kez merge edildi → bir daha değiştirilmez. Düzeltme için V43 yaz.
- Test ortamında dene (test refresh prod-mirror data getiriyor → gerçekçi test).
- Geriye uyumlu olsun (yeni column nullable, default değerli).

**ASLA:**
- `DROP COLUMN` migration'ı tek seferde yapma. Önce FE/BE'den kullanımını kaldır, 1 sürüm sonra sil.
- `ALTER COLUMN TYPE` büyük tablolarda blocking olabilir. Yeni column ekle, kopyala, eski sil.
- Migration içinde uzun `UPDATE` (büyük tablo) çalıştırma. Background job ile yap.

### 7.3 Migration Başarısız Olursa Ne Olur?

```
Senaryo: V42 migration'da typo var
         → Spring Boot Flyway exception fırlatır
         → Container start etmez
         → docker compose up -d başarısız döner
         → SSH adımı fail
         → CI smoke test atlanır
         → ↩️  Eski image'a rollback
```

Bu durumda:
- Prod hâlâ eski versiyonda çalışır
- Sen log'a bakıp typo'yu görürsün
- V43__fix.sql yaz, push et, tekrar deploy
- V42 zaten "applied" olarak işaretlendi mi diye DB'ye bak (Flyway exception'ı erken atılırsa işaretlenmez)

### 7.4 Migration Rollback

**Flyway rollback nettir:** YAPMA.

Backward migration ("undo") başarısız bir konsepttir; eğer V42 verileri taşıdıysa V42_undo bunları nasıl geri alacağını bilmez. Bu yüzden:

- Bozulmuş migration → V43 ile düzelt (`ALTER TABLE ... DROP COLUMN`, vb.)
- Tam felaket → DB restore (Section 14 disaster recovery)

---

## 8. Rollback (Geri Alma) Prosedürleri

### 8.1 Otomatik Rollback (CI Tarafından)

`deploy-prod.yml` workflow'unda smoke test fail olursa otomatik:

```
Smoke test fail
   → .previous-api-image'da kayıtlı eski tag'i oku
   → docker compose up -d --no-deps api (eski tag ile)
   → Slack: "Rollback yapıldı"
```

**Bunu beklemen gerekmiyor**, otomatik. Sen sadece bildirim alırsın.

### 8.2 Manuel Rollback — "Deploy başarılı görünüyor ama kullanıcı şikayet ediyor"

Smoke test geçti, deploy yeşil, ama kullanıcı bir hata bildirdi. Acil geri dön:

```bash
ssh deploy@backend
cd /opt/bizboard/prod

# Son 5 image tag'ini gör:
docker images | grep bizboard-api | head -5
# Çıktı örnek:
#   bizboard-api  v2026.05.11-abc1234  (current, broken)
#   bizboard-api  v2026.05.09-def5678  (last good)
#   bizboard-api  v2026.05.07-ghi9012
#   ...

# Önceki versiyonu set et:
export API_TAG=v2026.05.09-def5678
docker compose pull api
docker compose up -d --no-deps api
sleep 10
curl -fsS http://localhost:8080/actuator/health

# Aynısını frontend için:
ssh deploy@frontend
cd /opt/bizboard/prod
export WEB_TAG=v2026.05.09-def5678
docker compose pull web
docker compose up -d --no-deps web
```

Süre: ~2 dakika. Downtime: ~30 saniye.

### 8.3 Git Revert Yöntemi (Temiz Kayıt)

Eğer rollback'i kalıcı yapmak istiyorsan:

```bash
git checkout main
git revert <kötü-commit-sha>          # Revert commit yaratır
git push origin main
# CI yine build + manuel onay akışını çalıştırır
# Onaylarsan eski koda geri dönmüş olursun (kayıt geçmişte korunur)
```

Bu yöntem: değişikliğin neden geri alındığı git log'da görünür.

### 8.4 DB Migration Yapılmışsa Rollback

En zor senaryo. Eğer V42 verileri kalıcı değiştirdiyse:

| Durum | Çözüm |
|-------|-------|
| V42 sadece `ADD COLUMN` | Eski kod yeni column'u görmezden gelir, sorun yok |
| V42 `DROP COLUMN` | DB restore gerekir (acil senaryo) |
| V42 `UPDATE` ile veri taşıdı | DB restore + manuel düzeltme |

**Önlem:** Geri alınamaz migration'ları **mesai dışı** + **manuel backup** + **küçük dozlarda** yap.

---

## 9. Hotfix Akışı — Acil Durum

> Senaryo: Prod'da kritik bug. Test branch'i şu an yarım kalmış feature içeriyor, oradan promote edemem.

### 9.1 Hotfix Branch'i

```bash
git checkout main
git pull
git checkout -b hotfix/login-broken

# Tek satırlık fix yap
git commit -m "fix: login null pointer when role is null"
git push origin hotfix/login-broken
```

### 9.2 PR Aç: hotfix → main

CI tests çalışır. **Test ortamında denemeden direkt prod'a gidiyor.** Bu kasıtlı:
- Acil
- Değişiklik minimal (tek satır)
- Kod review yapacak başka biri yok zaten

### 9.3 Merge → Image Build → Manuel Deploy

Normal akış çalışır. Sen `Approve` butonuna basarsın.

### 9.4 Hotfix Sonrası Disiplin

Hotfix sonrası **mutlaka**:

```bash
# Hotfix'i test branch'ine de yansıt (drift olmasın)
git checkout test
git merge main
git push origin test
```

Aksi takdirde test branch'i eskimiş kalır, bir sonraki promote'ta hotfix unutulabilir veya çakışır.

### 9.5 Hotfix'in Riskleri

Hotfix yolu test'i atladığı için:
- Geriye uyumluluk bozma riski yüksek
- Yan etki olma riski yüksek

Bu yüzden hotfix sadece **gerçekten acil** durumda (prod tamamen down) yapılmalı. "Kullanıcı bir buton istedi" hotfix değildir.

---

## 10. Pre-Deploy Kontrol Listesi

> Approve butonuna basmadan önce 60 saniyenli zihinsel checklist.

### 10.1 Teknik

- [ ] Test ortamında en az 30 dakika çalıştı, hata almadım
- [ ] Test ortamında ben dahil 2-3 senaryo denedim
- [ ] CI ✅ — testler geçti, image build başarılı
- [ ] DB migration varsa: geriye uyumlu (Section 7.2)
- [ ] Yeni env var eklendiyse: prod `.env` dosyasına da eklenmiş (önceden)
- [ ] Yeni external integration eklendiyse: prod'da çalışacak yapılandırma hazır

### 10.2 İşletim

- [ ] Saat uygun mu? (Mesai içi → mini downtime tolere edilir. Mesai dışı → daha güvenli ama destek almak zor)
- [ ] Son backup ne zaman? (Otomatik backup zaten pre-deploy çalışıyor ama doğrula)
- [ ] Restore drill başarılı mı (son ay)?
- [ ] Off-site sync güncel mi?
- [ ] Disk doluluk %85'in altında mı?

### 10.3 İletişim

- [ ] Büyük değişiklikse: kullanıcılara önceden haber verildi mi? (Sadece UI değişikliği için bile)
- [ ] Mobil app benzeri uyumlu mu? (varsa)
- [ ] Bilinen issue varsa changelog'a yazıldı

### 10.4 Geri Dönüş Planı

- [ ] Rollback için son iyi image tag'i biliyor muyum?
- [ ] DB migration geri alınabilir mi (eğer fail olursa)?

Eğer bu listenin herhangi bir maddesi şüpheli ise **deploy etme**, önce çöz.

---

## 11. Post-Deploy Doğrulama

> Deploy bittikten sonra **5 dakika boyunca** aktif izleme.

### 11.1 Hemen (İlk 1 Dakika)

- [ ] CI workflow ✅ yeşil
- [ ] Slack/email bildirimi geldi
- [ ] `https://app.alanadi.com` açılıyor
- [ ] `https://api.alanadi.com/actuator/health` 200 UP
- [ ] Kendi hesabınla login ol
- [ ] Yeni özellik çalışıyor (test'tekiyle aynı davranış)

### 11.2 İlk 5 Dakika

- [ ] Uptime monitor: tüm probe'lar yeşil
- [ ] Backend error log spike yok:
  ```bash
  ssh deploy@backend
  docker logs --since 5m bb_prod_api 2>&1 | jq -r 'select(.level=="ERROR")' | wc -l
  # Beklenen: 0 veya çok az
  ```
- [ ] Frontend access log spike (5xx) yok:
  ```bash
  ssh deploy@frontend
  docker logs --since 5m bb_caddy 2>&1 | jq -r 'select(.status >= 500)' | wc -l
  ```
- [ ] DB connection pool sağlıklı:
  ```bash
  docker exec bb_prod_postgres psql -U bizboard_app -c \
      "SELECT count(*) FROM pg_stat_activity WHERE state='active';"
  ```

### 11.3 İlk 1 Saat (Pasif İzleme)

- Telefonda Slack açık kalsın
- Kullanıcılardan şikayet gelir mi izle
- 1 saat hiçbir alarm yoksa **deploy başarılı** ilan et

### 11.4 İlk 24 Saat

- Performans metrikleri eski seviyede mi?
- Disk doluluk normal artış mı?
- Yeni cron job eklendiyse: ilk run başarılı mı?

---

## 12. Versiyonlama Stratejisi

### 12.1 Image Tag Şeması

Her başarılı build 3 tag alır:

```
:latest                              ← her zaman son prod versiyon
:v2026.05.11-abc1234                 ← tarih + kısa SHA (kalıcı kayıt)
:sha-abc1234                         ← sadece SHA (rollback için kolay referans)
```

**Neden 3 tag?**
- `:latest` — `docker compose pull` ile her zaman son sürümü çeker
- `:v2026.05.11-abc1234` — log/release notes'ta okunaklı
- `:sha-abc1234` — git commit ile birebir eşleşir, debug için ideal

### 12.2 Git Tag (Opsiyonel)

Daha resmi sürümleme istiyorsan major feature'lar için git tag:

```bash
git tag -a v1.0.0 -m "Initial production release"
git tag -a v1.1.0 -m "Excel export feature"
git push origin --tags
```

CI workflow'una eklenebilir: tag push'unda image'a `:v1.1.0` ek tag eklensin.

### 12.3 Changelog Tutma

`CHANGELOG.md` repo kökünde:

```markdown
## [Unreleased]
### Added
- Excel export for debt list

## [v2026.05.11-abc1234] - 2026-05-11
### Fixed
- Login null pointer when role missing

### Added
- Audit log UI in admin panel

## [v2026.05.09-def5678] - 2026-05-09
### Changed
- Increased session timeout to 8 hours
```

Tek geliştirici için zorunlu değil ama 6 ay sonra "Bu özellik ne zaman geldi?" sorusuna cevap verir.

---

## 13. Yaygın Senaryolar (FAQ)

### 13.1 "Yanlışlıkla main'e push attım, deploy başladı!"

**Korkma.** Workflow ikiye bölündü:
1. AŞAMA 1 (image build) çalışır — zararı yok
2. AŞAMA 2 (deploy) manuel onay bekler — sen "Approve" demediysen prod'a hiçbir şey gitmez

CI UI'da workflow'u **Cancel** et. Yanlış commit'i revert et:

```bash
git revert HEAD
git push origin main
```

### 13.2 "Deploy ortasında elektriğim kesildi / internet gitti"

Deploy yarım kaldı, possible state'ler:
- Backend deploy oldu, frontend olmadı → uyumsuz versiyonlar
- Backend image değişti, container restart olmadı → eski kod
- Migration başarılı, kod fail → DB ileride, kod geride

**Çözüm:** Tekrar başlat:
```bash
# CI UI'da workflow'u "Re-run failed jobs"
# Veya manuel SSH ile:
ssh deploy@backend
cd /opt/bizboard/prod
docker compose ps          # ne durumda?
docker compose up -d       # eksikleri tamamla
```

### 13.3 "Smoke test geçti ama kullanıcı 'X butonu çalışmıyor' dedi"

Manuel rollback (§8.2). Sonra sebebini araştır:
- Smoke test sadece login ve health kontrol ediyor, tüm özelliği test etmiyor
- Daha kapsamlı smoke test eklemeyi düşün (yeni feature'lar için)

### 13.4 "Migration başarısız oldu, prod down mı?"

Hayır. Çünkü:
- Eski container hâlâ ayakta
- Yeni container start edemedi
- `docker compose up -d` başarısız olur ama eski hizmet vermeye devam eder
- Workflow rollback step'i `.previous-api-image`'tan eski tag'i yükler
- Senin için: eski versiyon çalışır, prod sağlıklı

Sen log'a bakıp migration sorununu çöz, yeniden deploy et.

### 13.5 "Sadece frontend değişti, sadece frontend deploy etmek istiyorum"

Şu an workflow her ikisini birden deploy ediyor. Optimize için:

```yaml
# deploy-prod.yml'de paths filtresi:
on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'      # sadece frontend değişikliklerinde

# Veya iki ayrı workflow:
deploy-prod-frontend.yml
deploy-prod-backend.yml
```

Tek geliştirici için: birlikte deploy etmek kolaydır, ekstra optimizasyon gereksiz.

### 13.6 "İki kez aynı anda Approve'a tıkladım"

`concurrency` ayarı (workflow'un başında) bunu engelliyor:
```yaml
concurrency:
  group: deploy-prod
  cancel-in-progress: false
```

İkinci tetikleme birinci bitene kadar kuyruğa girer. Endişe etme.

### 13.7 "Aylar oldu deploy yapmadım, prod hâlâ çalışıyor mu?"

`docker compose ps` ile kontrol. Container restart policy `unless-stopped`. Sunucu reboot olsa bile otomatik kalkar.

Ama: image security updates almıyor. Ayda en az 1 küçük deploy yap (bağımlılık güncellemesi veya dummy commit) ki taze image ve patch'ler prod'a girsin.

### 13.8 "Deploy etmek istiyorum ama backup başarısız"

`deploy-prod.yml`'de pre-deploy backup başarısızsa workflow durur:
```yaml
- name: Trigger backup before deploy
  script: |
    pgbackrest --type=incr backup || { echo "FATAL: backup başarısız"; exit 1; }
```

Bu kasıtlı. Backup alınamadıysa deploy etme. Backup sorununu çöz, sonra dene.

### 13.9 "Workflow süresi çok uzun, hızlandırabilir miyim?"

Optimizasyonlar:
- Maven dependency cache (zaten var)
- Docker layer cache (`docker/build-push-action` ile)
- Test paralelizasyonu (Spring Boot çoklu test grupları)
- Sadece değişen path için workflow çalıştır

Tipik süreler:
- Test ortam deploy: 2-4 dk
- Prod image build: 5-7 dk
- Prod deploy: 1-2 dk

Bunun altına inmek (örn. 30 sn) ek optimizasyon gerektirir; tek geliştirici için yatırım değmez.

### 13.10 "Local'de çalışıyor ama CI'da fail"

Sık görülen sebepler:
- Test paralel çalışırken statefull testler birbirini bozar
- CI'da env var eksik
- CI runner'ında farklı zaman dilimi (özellikle date testleri)
- CI'da SSL sertifikası farklı

Her birini özel olarak debug et; CI workflow'da `- run: env` adımı ekleyerek runtime ortamını incele.

---

## 14. Zero-Downtime Deploy (Opsiyonel İleri)

Şu anki kurulumda deploy sırası ~30 sn downtime var. Bu internal tool için kabul edilebilir. Ama gerçek zero-downtime istersen aşağıdaki yaklaşım:

### 14.1 Blue-Green Pattern (Caddy ile)

```
Mevcut:                    Yeni Deploy Sırasında:
  Caddy → :8080 (blue)       Caddy → :8080 (blue)
                             :8081 (green) — başlatılıyor

  Health check OK:
                             Caddy → :8081 (green)
                             :8080 (blue) — durduruluyor
```

Compose'da iki kopyada API tanımlanır (`api-blue`, `api-green`). Caddy konfig dosyası dinamik olarak güncelleniyor (template). Downtime: 0 saniye, çünkü Caddy hot reload yapıyor.

**Karmaşıklık:**
- Compose dosyası 2× büyür
- Caddy template engine veya dinamik konfig
- DB migration ile uyumsuzluk: yeni kod yeni schema bekliyorsa, eski kod yeni schema'yı bilmiyor → expand-contract zorunlu

Tek geliştirici için **yatırım değmez**. 30 saniye downtime gerçek bir maliyet değil.

### 14.2 Rolling Update (Çoklu Replica)

Eğer ileride yük arttı, 2+ API replica'sı çalıştırılırsa:

```yaml
api:
  deploy:
    replicas: 3
    update_config:
      parallelism: 1
      order: start-first
```

Compose `swarm mode`'da bu çalışır. Klasik compose'da değil. Bunun için zaten Kubernetes'e geçmek mantıklı. Tekrar: gerek yok.

### 14.3 Tek Komutla Hızlı Rollback (Pratik Çözüm)

Zero-downtime yerine "lightning-fast rollback" daha pratik:

```bash
alias bb-rollback='cd /opt/bizboard/prod && export API_TAG=$(cat .previous-api-image | cut -d: -f2) && docker compose pull api && docker compose up -d --no-deps api'
```

Bir alarm gelirse `bb-rollback` ile 30 saniye içinde önceki versiyona dönersin. Bu pratikte zero-downtime'tan iyi: kullanıcı bir dakika "yavaş gibi" hisseder, sonra hızlanır.

---

## 15. Hızlı Referans Kartı

> Yazıcıdan çıkar, masanın yanına yapıştır.

### 15.1 Günlük İşler

```
Yeni feature  → git push test          → otomatik test deploy
Doğrula       → https://test.alanadi.com
Prod'a yolla  → PR: test → main, merge → CI build
              → Wait for approval → Approve butonu
              → 2 dk sonra prod'da
```

### 15.2 Acil Komutlar

```bash
# Prod log akışı
ssh deploy@backend "docker logs -f --tail 100 bb_prod_api"

# Manuel rollback
bb-rollback              # Section 14.3 alias

# Pre-deploy manuel backup
bb-backup-now            # Section "Ek A" alias

# Smoke test manuel
/opt/bizboard/scripts/smoke-test.sh

# Container restart (config değişti, image değişmedi)
cd /opt/bizboard/prod && docker compose restart api
```

### 15.3 Karar Ağacı

```
Bug bulundu prod'da
├── Kritik (login down, veri kaybı)? → Hotfix akışı (§9)
├── Önemli (özellik çalışmıyor)?      → Manuel rollback (§8.2)
└── Kozmetik (renk yanlış)?           → Test branch'te düzelt, normal akış

Migration yapacağım
├── ADD column (nullable)?            → Direkt deploy, geriye uyumlu
├── DROP column?                       → İki sürüm: önce kullanım kaldır, sonra DROP
├── Rename?                            → Expand-contract pattern
└── Veri taşıma?                       → Önce küçük tabloda dene, mesai dışında yap
```

### 15.4 Numerik Limitler

| Metric | Beklenen | Alarm |
|--------|----------|-------|
| Test deploy süresi | 2-4 dk | 10 dk |
| Prod image build | 5-7 dk | 15 dk |
| Prod deploy süresi | 1-2 dk | 5 dk |
| Deploy sırası downtime | 30 sn | 2 dk |
| Smoke test geçme süresi | <10 sn | 30 sn |
| Disk doluluk | <70% | >85% |
| Backend RAM | <70% | >85% |
| 5xx rate | <0.1% | >1% |

---

## Ek A — Dockerfile Örnekleri

### Backend Dockerfile (Multi-Stage)

`backend/bizboard/Dockerfile`:

```dockerfile
# Stage 1: Build
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY pom.xml .
COPY bizboard-common/pom.xml bizboard-common/
COPY bizboard-repository/pom.xml bizboard-repository/
COPY bizboard-security/pom.xml bizboard-security/
COPY bizboard-service/pom.xml bizboard-service/
COPY bizboard-api/pom.xml bizboard-api/
RUN mvn dependency:go-offline -B

COPY . .
RUN mvn package -DskipTests -B

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache curl tini && \
    addgroup -S app && adduser -S -G app app

WORKDIR /app
COPY --from=build --chown=app:app /build/bizboard-api/target/*.jar app.jar

USER app
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
```

### Frontend Dockerfile (Multi-Stage)

`frontend/bizboard/Dockerfile`:

```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Runtime
FROM node:20-alpine
RUN addgroup -S app && adduser -S -G app app
WORKDIR /app

COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public

USER app
EXPOSE 3000
CMD ["node", "server.js"]
```

`next.config.js`'te `output: 'standalone'` ayarı gerekli.

---

## Ek B — Manuel Deploy (CI Yokken)

CI çalışmazsa veya hızlıca manuel deploy yapmak istersen:

```bash
# Backend image build + push (yerel makinede)
cd backend/bizboard
docker buildx build --platform linux/amd64 \
    -t <registry>/bizboard-api:manual-$(date +%Y%m%d-%H%M) --push .

# Backend makinesinde deploy
ssh deploy@backend
cd /opt/bizboard/prod
docker pull <registry>/bizboard-api:manual-20260511-1430
# .env içinde API_TAG'i geçici olarak değiştir
docker compose up -d --no-deps api
```

> Bu manuel akış normal süreçten daha az güvenli (smoke test, backup, rollback otomatik yok). Sadece acil durumda kullan.

---

**Döküman sonu.**

Özet: Bu setup'ta sen kod yazarsın, `git push` yaparsın, test ortamı otomatik güncellenir, beğenirsen `main`'e merge edersin, **bir butona basarak** prod'a alırsın. Hata olursa otomatik geri döner. Tek geliştirici için yapılabilecek en güvenli ve en hızlı akış budur.

Diğer dökümanlarla ilişki:
- [devops_setup.md](devops_setup.md) — altyapı kurulumu (bu döküman onu varsayar)
- [logging_system.md](logging_system.md) — deploy sonrası log incelemesi için
- [ANALYSIS.md](ANALYSIS.md) — kod tarafında prod'a çıkmadan düzeltilmesi gereken güvenlik açıkları

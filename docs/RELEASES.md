# Sürüm (Release) Süreci

BizBoard, [SemVer](https://semver.org/lang/tr/) ve git tag'leri ile sürümlenir.
Her sürüm GitHub Releases'e otomatik düşer, `CHANGELOG.md` insan okur formattadır.

---

## Sürüm Numarası Kararı

Yeni bir sürüm keserken önce kategorisini belirle:

| Değişiklik | Tip | Örnek |
|---|---|---|
| Kritik bug fix, dokümantasyon, log temizliği | **PATCH** (`x.y.Z+1`) | v1.0.0 → v1.0.1 |
| Geriye uyumlu yeni özellik | **MINOR** (`x.Y+1.0`) | v1.0.5 → v1.1.0 |
| Geriye uyumsuz (DB schema, API contract) | **MAJOR** (`X+1.0.0`) | v1.7.2 → v2.0.0 |

Şüphedeysen PATCH ile başla; bir kullanıcı şikayet ederse MINOR'a çek.

---

## Adım Adım Sürüm Akışı

### 1. main branch temiz olmalı

```bash
git checkout main
git pull
git status                # working tree clean
```

### 2. Version numaralarını güncelle

İki yerde sürüm var, ikisini de yeni sürüme çek:

**Backend (Maven):**
```bash
cd backend/bizboard
mvn versions:set -DnewVersion=X.Y.Z -DgenerateBackupPoms=false
```
(Parent + tüm submodule pom.xml'leri tek seferde günceller.)

**Frontend (npm):**
```bash
cd frontend/bizboard
npm version X.Y.Z --no-git-tag-version
```

### 3. CHANGELOG.md güncelle

`[Unreleased]` bölümündeki maddeleri yeni sürüm bölümüne taşı, alt linkleri ekle:

```markdown
## [Unreleased]

## [1.2.0] — 2026-MM-DD

### Added
- ...

### Fixed
- ...

[Unreleased]: https://github.com/.../compare/v1.2.0...HEAD
[1.2.0]: https://github.com/.../releases/tag/v1.2.0
```

### 4. Commit + tag + push

```bash
git add -A
git commit -m "Release v1.2.0"
git tag -a v1.2.0 -m "v1.2.0"
git push origin main
git push origin v1.2.0
```

### 5. GitHub Release otomatik oluşur

`.github/workflows/release.yml` workflow'u `v*` tag'ini izler. Tag push'u
tetikler, workflow:
- CHANGELOG'dan ilgili bölümü çıkartır
- GitHub Release'i otomatik oluşturur
- Release notlarına bağlar

Manuel doğrulama: <https://github.com/uyekebagci/bizboard/releases>

### 6. Sevalla deploy

Mevcut konfigürasyon: **autodeploy on push to main**, yani tag attığında
zaten main güncel olduğu için Sevalla otomatik build ediyor.

İleride **tag-based deploy**'a geçmek istersek (bkz. aşağı), main'e push
sessiz olacak, sadece tag'ler prod'a düşecek.

---

## Tag-Based Deploy (gelecekte geçilebilir)

Şu an Sevalla `main` branch'ini izliyor: her commit → deploy. Bu hızlı
iterasyon için iyi ama prod istikrarı için risk.

Tag-based deploy 3 yoldan biriyle yapılır:

### Seçenek A — Sevalla native (varsa)

Sevalla → App → Settings → Build → "Deploy on" → `Tag pattern: v*`.

Bu varsa en temiz çözüm. Sevalla doc'unu kontrol et.

### Seçenek B — GitHub Actions → Sevalla webhook

Sevalla → App → Settings → "Deploy webhook URL" gibi bir alan varsa, o
URL'i GitHub Secret olarak ekle (`SEVALLA_DEPLOY_WEBHOOK`), aşağıdaki adımı
`.github/workflows/release.yml`'a ekle:

```yaml
- name: Trigger Sevalla deploy
  run: curl -X POST "${{ secrets.SEVALLA_DEPLOY_WEBHOOK }}"
```

Bu da varsa B en pratiği.

### Seçenek C — Release branch pattern

Hiçbiri yoksa: `main` development, `release` production. Tag attığında
GitHub Actions otomatik `release` branch'i tag commit'ine eşitler:

```yaml
- name: Sync release branch
  run: |
    git fetch origin
    git push origin "${{ github.sha }}:refs/heads/release" --force
```

Sevalla'yı `release` branch'i izlemeye geçir → her tag deploy.

---

## Hotfix Akışı

Production'da bug var, beklenen MINOR'u tamamlamadan acil PATCH lazım:

```bash
git checkout v1.2.0          # son stable tag
git checkout -b hotfix/1.2.1
# ... bug fix commit'i ...
mvn versions:set -DnewVersion=1.2.1 -DgenerateBackupPoms=false
# package.json version güncelle
# CHANGELOG.md güncelle
git commit -am "Hotfix: critical bug X"
git tag -a v1.2.1 -m "v1.2.1 hotfix"
git push origin hotfix/1.2.1 v1.2.1
# PR ile main'e merge et
```

---

## Rollback

Son sürüm bozuksa önceki tag'e geri dön:

**Sevalla autodeploy ile:**
1. GitHub'da bozuk commit'i revert et (`git revert <hash>`)
2. Push → autodeploy çalışır, prod düzelir

**Tag-based deploy ile:**
1. Sevalla → App → Deployments → eski (stable) tag deploy'una **Redeploy**

Hangi koda denk geliyor diye merak edersen:

```bash
git log v1.1.5..v1.2.0 --oneline      # iki sürüm arası fark
```

---

## Sürüm Sonrası Doğrulama (Smoke Test)

Her sürümden sonra:

- [ ] `https://api.cakirdag.com/actuator/info` → doğru `app.version`
- [ ] `https://app.cakirdag.com` → login açılıyor
- [ ] Test kullanıcısıyla giriş + dashboard
- [ ] Yeni özellik (varsa) manuel test
- [ ] Sevalla → bizboard-api → Metrics → CPU/RAM normal
- [ ] Sevalla → bizboard-web → Logs → hata yok

Smoke test geçmezse hemen rollback.

---

## Yol Haritası

Şu an için planlanan sürümler:

| Sürüm | İçerik | Hedef |
|---|---|---|
| **v1.0.0** | İlk prod sürümü | ✅ 2026-05-15 |
| **v1.0.1** | Debug log temizliği | Acil |
| **v1.0.2** | Backend AuthResponse genişlet (`expiresIn`, `forcePasswordChange`) | 1-2 hafta |
| **v1.1.0** | Custom domain, HttpOnly cookie, CORS dar | 2-4 hafta |
| **v1.2.0** | Test ortamı (`bizboard-api-test`, `bizboard-web-test`) | 4-6 hafta |
| **v1.3.0** | Refresh token akışı, JWT TTL kısalt | 6-8 hafta |
| **v2.0.0** | Flyway migration'lar, `ddl-auto=validate` | 2-3 ay |

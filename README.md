# BizBoard - Isletme Yonetim Paneli

BizBoard, birden fazla isletmeyi tek bir panelden yonetmeye olanak taniyan kapsamli bir is yonetim platformudur. Gelir-gider takibinden personel yonetimine, envanter kontrolunden borc-alacak yonetimine kadar genis bir yelpazede isletme operasyonlarini dijitallestirmeyi hedefler.

---

## Ozellikler

### Dashboard (Ana Panel)
- **Portfolyo Ozeti** — Toplam gelir, gider, net kar ve kar marji bir bakista
- **Isletme Kartlari** — Her isletmenin finansal durumu, gelir/gider barlari ve saglk gostergesi
- **Hizli Islemler** — Islem ekle, isletme ekle, finans merkezi gibi sik kullanilan islemlere tek tikla erisim
- **Gider Dagilimi** — Gelir, islem gideri ve sabit gider oranlarini gorsel olarak gosteren grafik
- **Son Islemler** — Son yapilan islemlerin kronolojik listesi
- **Borc/Alacak Widget** — Toplam alacak ve borc durumu ozeti
- **Uyari Sistemi** — Arizali ekipman, dusuk stok, garanti bitisi ve pasif personel uyarilari

### Isletme Detay Sayfasi
- **Finans Ozeti** — Isletmeye ozel gelir, gider ve kar bilgileri
- **Islem Yonetimi** — Gelir/gider islemlerini listeleme, ekleme, duzenleme ve silme
- **Personel Modulu** — Calisan ekleme, maas/SGK takibi, aktif/pasif yonetimi
- **Borc/Alacak Modulu** — Musteri ve tedarikci bazli borc-alacak kayitlari
- **Sabit Giderler** — Kira, personel, fatura gibi tekrarlayan giderlerin yonetimi
- **Envanter Modulu** — Ekipman, stok, solar panel ve arac takibi
- **Arac Modulu** — Arac bilgileri, yakit takibi, bakim kayitlari, kiralama yonetimi
- **Belgeler** — Isletmeye ozel dosya yukleme ve yonetimi
- **Notlar** — Isletme bazli not ekleme ve goruntuleme
- **Finans Modulu** — Gelir/gider orani, trend grafikleri, kategori kirilimlari

### Finans Merkezi
- **Donem Secimi** — 1 Ay, 3 Ay, 6 Ay, 1 Yil ve Tumu secenekleriyle filtreleme
- **Genel Bakis** — Aylik trend grafigi, en yuksek gelir/giderler, gelir-gider karsilastirma bari
- **Nakit Akisi** — Gunluk nakit akisi grafigi, kumulatif nakit akisi, son 7 gun detayi
- **Kategori Analizi** — Gider/gelir bazli kategori dagilimi, donut grafik ve yuzde barlari
- **Isletme Karsilastirmasi** — Isletmeler arasi finansal karsilastirma tablosu

### Admin Paneli
- **Kullanici Yonetimi** — Kullanici ekleme, rol atama, isletme erisim kontrolu
- **Isletme Tipi Yonetimi** — Is kategorileri ve modullerin tanimlanmasi
- **Rol Bazli Erisim (RBA)** — Admin, yonetici ve kullanici rolleri ile erisim kontrolu

### Diger Ozellikler
- **Koyu Tema** — Tum sayfalarda tam koyu tema destegi
- **Turkce Arayuz** — Tum etiketler, mesajlar ve tarih formatlari Turkce
- **Noktalı Sayi Formati** — Para girisi sirasinda otomatik binlik ayiraci (272.000)
- **Responsive Tasarim** — Mobil ve masaustu uyumlu arayuz
- **PWA Destegi** — Progressive Web App olarak calisabilir
- **Dosya Yukleme** — Islem ve belge bazli dosya yukleme

---

## Teknoloji Yigini

### Backend
| Teknoloji | Versiyon | Aciklama |
|-----------|----------|----------|
| **Java** | 21 | Ana programlama dili |
| **Spring Boot** | 3.4.3 | Uygulama cercevesi |
| **Spring Security** | — | JWT tabanli kimlik dogrulama |
| **Spring Data JPA** | — | Veritabani erisim katmani |
| **Hibernate** | 6.6.x | ORM |
| **PostgreSQL** | 17.x | Iliskisel veritabani |
| **Maven** | — | Bagimlk yonetimi ve build |
| **Lombok** | — | Boilerplate kod azaltma |
| **JJWT** | 0.12.6 | JWT token uretimi ve dogrulama |

### Frontend
| Teknoloji | Versiyon | Aciklama |
|-----------|----------|----------|
| **Next.js** | 14.2.x | React tabanli fullstack framework |
| **React** | 18.x | UI kutuphanesi |
| **TypeScript** | 5.x | Tip guvenligi |
| **Tailwind CSS** | 3.4.x | Utility-first CSS framework |
| **Zustand** | — | State yonetimi |
| **Lucide React** | — | Icon kutuphanesi |
| **next-pwa** | — | PWA destegi |

---

## Proje Yapisi

```
bizboard/
├── backend/bizboard/
│   ├── bizboard-common/        # Entity, DTO, Enum tanimlari
│   ├── bizboard-repository/    # JPA Repository arayuzleri
│   ├── bizboard-security/      # JWT filtre, SecurityConfig, UserPrincipal
│   ├── bizboard-service/       # Is mantigi servisleri
│   ├── bizboard-api/           # REST Controller ve uygulama giris noktasi
│   └── pom.xml                 # Parent Maven POM
│
├── frontend/bizboard/
│   ├── src/
│   │   ├── app/                # Next.js App Router sayfalari
│   │   │   ├── dashboard/      # Ana panel, finans, envanter, islem sayfalari
│   │   │   ├── business/       # Isletme detay sayfalari
│   │   │   ├── admin/          # Yonetim paneli
│   │   │   └── auth/           # Giris sayfasi
│   │   ├── components/
│   │   │   ├── dashboard/      # Dashboard bileşenleri
│   │   │   ├── business/       # Isletme detay bileşenleri
│   │   │   ├── layout/         # Sidebar, Header
│   │   │   └── shared/         # Ortak bilesenler (FileUpload vb.)
│   │   ├── lib/                # API client, store, yardimci fonksiyonlar
│   │   ├── styles/             # Global CSS
│   │   └── types/              # TypeScript tip tanimlari
│   └── public/                 # Statik dosyalar, PWA manifest
│
└── README.md
```

---

## API Endpointleri

### Kimlik Dogrulama
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| POST | `/auth/login` | Kullanici girisi (JWT token doner) |
| POST | `/auth/register` | Yeni kullanici kaydi |

### Portfolyo & Finans
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| GET | `/portfolio?year=&month=` | Aylik portfolyo ozeti |
| GET | `/finance/overview?months=6` | Kapsamli finans analizi |

### Isletme Yonetimi
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| GET | `/businesses` | Isletme listesi |
| POST | `/businesses` | Yeni isletme olusturma |
| GET | `/businesses/{id}` | Isletme detayi |
| PUT | `/businesses/{id}` | Isletme guncelleme |
| DELETE | `/businesses/{id}` | Isletme silme |

### Islem (Transaction) Yonetimi
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| GET | `/businesses/{id}/transactions` | Isletme islemleri |
| POST | `/businesses/{id}/transactions` | Yeni islem ekleme |
| PUT | `/businesses/{id}/transactions/{txId}` | Islem guncelleme |
| DELETE | `/businesses/{id}/transactions/{txId}` | Islem silme |

### Personel
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| GET | `/businesses/{id}/employees` | Personel listesi |
| POST | `/businesses/{id}/employees` | Personel ekleme |
| GET | `/businesses/{id}/employees/summary` | Personel ozeti |

### Borc/Alacak
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| GET | `/businesses/{id}/debts` | Borc/alacak listesi |
| POST | `/businesses/{id}/debts` | Borc/alacak ekleme |
| PATCH | `/businesses/{id}/debts/{debtId}/pay` | Odeme kaydi |

### Sabit Giderler
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| GET | `/businesses/{id}/fixed-costs` | Sabit gider listesi |
| POST | `/businesses/{id}/fixed-costs` | Sabit gider ekleme |

### Envanter & Arac
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| GET | `/businesses/{id}/inventory` | Envanter listesi |
| POST | `/businesses/{id}/inventory` | Envanter ekleme |
| GET | `/businesses/{id}/vehicles` | Arac listesi |
| POST | `/businesses/{id}/vehicles` | Arac ekleme |

### Dosya & Belge
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| POST | `/files/upload` | Dosya yukleme |
| GET | `/files/{id}` | Dosya indirme |

### Admin
| Metod | Endpoint | Aciklama |
|-------|----------|----------|
| GET | `/admin/users` | Kullanici listesi |
| POST | `/admin/users` | Kullanici ekleme |
| GET | `/business-types` | Is tipi listesi |
| POST | `/admin/business-types` | Is tipi ekleme |

---

## Kurulum

### Gereksinimler
- Java 21+
- Node.js 18+
- PostgreSQL 15+
- Maven 3.9+

### Veritabani

```bash
# PostgreSQL'de veritabani olustur
createdb bizboard
```

### Backend

```bash
cd backend/bizboard

# Bagimlliklari yukle ve derle
mvn clean install -DskipTests

# Uygulamayi calistir (port 8080)
mvn spring-boot:run -pl bizboard-api
```

Varsayilan veritabani ayarlari (`application.yml`):
- URL: `jdbc:postgresql://localhost:5432/bizboard`
- Kullanici: `postgres`
- Sifre: `postgres`
- DDL: `update` (tablolar otomatik olusturulur)

### Frontend

```bash
cd frontend/bizboard

# Bagimlliklari yukle
npm install

# Gelistirme sunucusunu baslat (port 3000)
npm run dev
```

`.env.local` dosyasi:
```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Varsayilan Giris Bilgileri
- **Kullanici Adi:** `admin`
- **Sifre:** `admin123`

---

## Veritabani Semasi

Temel tablolar:

- **users** — Kullanici bilgileri, roller ve erisim yetkileri
- **businesses** — Isletme tanimlari, renk, tur ve modul bilgileri
- **business_types** — Is turleri ve varsayilan moduller
- **transactions** — Gelir/gider islemleri
- **categories** — Islem kategorileri (icon ve renk ile)
- **employees** — Personel bilgileri, maas ve SGK
- **fixed_costs** — Sabit giderler (kira, fatura, personel)
- **debts** — Borc ve alacak kayitlari
- **inventory_items** — Envanter kalemleri (ekipman, stok, solar, arac)
- **vehicles** — Arac bilgileri ve kiralama detaylari
- **fuel_logs** — Yakit kayitlari
- **maintenance_logs** — Bakim kayitlari
- **file_uploads** — Yuklenen dosya metadata
- **business_notes** — Isletme notlari
- **notifications** — Bildirimler

---

## Mimari

### Backend — Multi-Module Maven Yapisi

```
bizboard-parent (POM)
  ├── bizboard-common      → Entity, DTO, Enum
  ├── bizboard-repository  → Spring Data JPA Repository
  ├── bizboard-security    → JWT Filter, Security Config
  ├── bizboard-service     → Business Logic
  └── bizboard-api         → REST Controller, Application Entry
```

- **Katmanli Mimari**: Controller → Service → Repository → Entity
- **JWT Kimlik Dogrulama**: Stateless, Bearer token tabanli
- **Rol Bazli Erisim**: Admin, yonetici ve kullanici rolleri
- **Isletme Bazli Yetkilendirme**: Kullanicilar sadece yetkili olduklari isletmeleri gorur

### Frontend — Next.js App Router

- **App Router**: Dosya tabanli rotalama
- **Server/Client Components**: Performans optimizasyonu
- **Zustand Store**: Global state yonetimi (kullanici, token, refresh trigger)
- **API Client**: Axios tabanli, otomatik JWT header ekleme
- **Dark Theme**: Global CSS degiskenleri ile tam koyu tema

---

## Lisans

Bu proje ozel kullanim icin gelistirilmistir.

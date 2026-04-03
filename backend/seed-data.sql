-- BizBoard Seed Data
-- Generated for admin user: 8e65c1da-020b-4153-8d1f-d461ad2bd888

BEGIN;

-- ============================================================
-- 1. BUSINESS TYPES
-- ============================================================
INSERT INTO business_types (id, category, label, icon, color, default_modules, default_categories, created_at)
VALUES
  (gen_random_uuid(), 'CONSTRUCTION', 'Insaat', 'hard-hat', '#f59e0b',
   '["finance","projects","staff","documents"]',
   '[{"name":"Malzeme","direction":"expense"},{"name":"Iscilik","direction":"expense"},{"name":"Hakediş","direction":"income"}]',
   NOW()),
  (gen_random_uuid(), 'RESTAURANT', 'Restoran', 'utensils-crossed', '#ef4444',
   '["finance","menu","reservations","staff","inventory"]',
   '[{"name":"Yemek Satisi","direction":"income"},{"name":"Hammadde","direction":"expense"},{"name":"Personel","direction":"expense"}]',
   NOW()),
  (gen_random_uuid(), 'TECHNOLOGY', 'Teknoloji', 'briefcase', '#3b82f6',
   '["finance","projects","staff","documents","crm"]',
   '[{"name":"Yazilim Gelistirme","direction":"income"},{"name":"Danismanlik","direction":"income"},{"name":"Sunucu Gideri","direction":"expense"}]',
   NOW()),
  (gen_random_uuid(), 'RETAIL', 'Perakende', 'store', '#10b981',
   '["finance","inventory","crm","staff"]',
   '[{"name":"Satis","direction":"income"},{"name":"Tedarik","direction":"expense"},{"name":"Kira","direction":"expense"}]',
   NOW())
ON CONFLICT (category) DO NOTHING;

-- ============================================================
-- 2. BUSINESSES (using CTEs to reference business_type IDs)
-- ============================================================
-- We need to look up the business_type IDs we just inserted.

DO $$
DECLARE
  v_admin_id       UUID := '8e65c1da-020b-4153-8d1f-d461ad2bd888';
  v_bt_construction UUID;
  v_bt_restaurant   UUID;
  v_bt_technology   UUID;
  v_bt_retail       UUID;
  v_biz_insaat      UUID := gen_random_uuid();
  v_biz_restoran    UUID := gen_random_uuid();
  v_biz_yazilim     UUID := gen_random_uuid();
  v_biz_market      UUID := gen_random_uuid();
  -- category IDs
  v_cat_malzeme     UUID := gen_random_uuid();
  v_cat_iscilik     UUID := gen_random_uuid();
  v_cat_hakedis     UUID := gen_random_uuid();
  v_cat_yemek       UUID := gen_random_uuid();
  v_cat_hammadde    UUID := gen_random_uuid();
  v_cat_personel    UUID := gen_random_uuid();
  v_cat_yazilim_dev UUID := gen_random_uuid();
  v_cat_danismanlik UUID := gen_random_uuid();
  v_cat_sunucu      UUID := gen_random_uuid();
  v_cat_satis       UUID := gen_random_uuid();
  v_cat_tedarik     UUID := gen_random_uuid();
  v_cat_kira        UUID := gen_random_uuid();
BEGIN
  -- Look up business type IDs
  SELECT id INTO v_bt_construction FROM business_types WHERE category = 'CONSTRUCTION';
  SELECT id INTO v_bt_restaurant   FROM business_types WHERE category = 'RESTAURANT';
  SELECT id INTO v_bt_technology   FROM business_types WHERE category = 'TECHNOLOGY';
  SELECT id INTO v_bt_retail       FROM business_types WHERE category = 'RETAIL';

  -- ============================================================
  -- 2. BUSINESSES
  -- ============================================================
  INSERT INTO businesses (id, name, business_type_id, owner_id, color, description, currency, is_active, created_at, updated_at)
  VALUES
    (v_biz_insaat,   'Yilmaz Insaat',     v_bt_construction, v_admin_id, '#f59e0b', 'Konut ve ticari insaat projeleri',      'TRY', true, NOW(), NOW()),
    (v_biz_restoran, 'Lezzet Sofra',      v_bt_restaurant,   v_admin_id, '#ef4444', 'Geleneksel Turk mutfagi restoran',     'TRY', true, NOW(), NOW()),
    (v_biz_yazilim,  'DigiSoft Yazilim',  v_bt_technology,   v_admin_id, '#3b82f6', 'Mobil ve web yazilim cozumleri',       'TRY', true, NOW(), NOW()),
    (v_biz_market,   'Merkez Market',     v_bt_retail,       v_admin_id, '#10b981', 'Mahalle perakende market',             'TRY', true, NOW(), NOW());

  -- ============================================================
  -- 3. BUSINESS MEMBERS (admin as OWNER)
  -- ============================================================
  INSERT INTO business_members (id, business_id, user_id, role, is_accepted, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_biz_insaat,   v_admin_id, 'OWNER', true, NOW(), NOW()),
    (gen_random_uuid(), v_biz_restoran, v_admin_id, 'OWNER', true, NOW(), NOW()),
    (gen_random_uuid(), v_biz_yazilim,  v_admin_id, 'OWNER', true, NOW(), NOW()),
    (gen_random_uuid(), v_biz_market,   v_admin_id, 'OWNER', true, NOW(), NOW());

  -- ============================================================
  -- 4. BUSINESS MODULES
  -- ============================================================
  -- Construction: finance, projects, staff, documents
  INSERT INTO business_modules (id, business_id, module, is_enabled, created_at)
  VALUES
    (gen_random_uuid(), v_biz_insaat, 'FINANCE',   true, NOW()),
    (gen_random_uuid(), v_biz_insaat, 'PROJECTS',  true, NOW()),
    (gen_random_uuid(), v_biz_insaat, 'STAFF',     true, NOW()),
    (gen_random_uuid(), v_biz_insaat, 'DOCUMENTS', true, NOW());

  -- Restaurant: finance, menu, reservations, staff, inventory
  INSERT INTO business_modules (id, business_id, module, is_enabled, created_at)
  VALUES
    (gen_random_uuid(), v_biz_restoran, 'FINANCE',      true, NOW()),
    (gen_random_uuid(), v_biz_restoran, 'MENU',         true, NOW()),
    (gen_random_uuid(), v_biz_restoran, 'RESERVATIONS', true, NOW()),
    (gen_random_uuid(), v_biz_restoran, 'STAFF',        true, NOW()),
    (gen_random_uuid(), v_biz_restoran, 'INVENTORY',    true, NOW());

  -- Technology: finance, projects, staff, documents, crm
  INSERT INTO business_modules (id, business_id, module, is_enabled, created_at)
  VALUES
    (gen_random_uuid(), v_biz_yazilim, 'FINANCE',   true, NOW()),
    (gen_random_uuid(), v_biz_yazilim, 'PROJECTS',  true, NOW()),
    (gen_random_uuid(), v_biz_yazilim, 'STAFF',     true, NOW()),
    (gen_random_uuid(), v_biz_yazilim, 'DOCUMENTS', true, NOW()),
    (gen_random_uuid(), v_biz_yazilim, 'CRM',       true, NOW());

  -- Retail: finance, inventory, crm, staff
  INSERT INTO business_modules (id, business_id, module, is_enabled, created_at)
  VALUES
    (gen_random_uuid(), v_biz_market, 'FINANCE',   true, NOW()),
    (gen_random_uuid(), v_biz_market, 'INVENTORY', true, NOW()),
    (gen_random_uuid(), v_biz_market, 'CRM',       true, NOW()),
    (gen_random_uuid(), v_biz_market, 'STAFF',     true, NOW());

  -- ============================================================
  -- 5. CATEGORIES
  -- ============================================================
  -- Construction categories
  INSERT INTO categories (id, business_id, name, direction, is_active, sort_order, created_at)
  VALUES
    (v_cat_malzeme, v_biz_insaat, 'Malzeme',  'EXPENSE', true, 1, NOW()),
    (v_cat_iscilik, v_biz_insaat, 'Iscilik',  'EXPENSE', true, 2, NOW()),
    (v_cat_hakedis, v_biz_insaat, 'Hakediş',  'INCOME',  true, 3, NOW());

  -- Restaurant categories
  INSERT INTO categories (id, business_id, name, direction, is_active, sort_order, created_at)
  VALUES
    (v_cat_yemek,    v_biz_restoran, 'Yemek Satisi', 'INCOME',  true, 1, NOW()),
    (v_cat_hammadde, v_biz_restoran, 'Hammadde',     'EXPENSE', true, 2, NOW()),
    (v_cat_personel, v_biz_restoran, 'Personel',     'EXPENSE', true, 3, NOW());

  -- Technology categories
  INSERT INTO categories (id, business_id, name, direction, is_active, sort_order, created_at)
  VALUES
    (v_cat_yazilim_dev, v_biz_yazilim, 'Yazilim Gelistirme', 'INCOME',  true, 1, NOW()),
    (v_cat_danismanlik, v_biz_yazilim, 'Danismanlik',        'INCOME',  true, 2, NOW()),
    (v_cat_sunucu,      v_biz_yazilim, 'Sunucu Gideri',      'EXPENSE', true, 3, NOW());

  -- Retail categories
  INSERT INTO categories (id, business_id, name, direction, is_active, sort_order, created_at)
  VALUES
    (v_cat_satis,   v_biz_market, 'Satis',   'INCOME',  true, 1, NOW()),
    (v_cat_tedarik, v_biz_market, 'Tedarik', 'EXPENSE', true, 2, NOW()),
    (v_cat_kira,    v_biz_market, 'Kira',    'EXPENSE', true, 3, NOW());

  -- ============================================================
  -- 6. TRANSACTIONS (March 2026)
  -- ============================================================

  -- CONSTRUCTION transactions (50k-500k TRY range)
  INSERT INTO transactions (id, business_id, category_id, created_by, amount, direction, currency, date, description, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_biz_insaat, v_cat_hakedis, v_admin_id, 450000.00, 'INCOME',  'TRY', '2026-03-02', 'A Blok 3. kat hakedis odemesi',       NOW(), NOW()),
    (gen_random_uuid(), v_biz_insaat, v_cat_malzeme, v_admin_id, 125000.00, 'EXPENSE', 'TRY', '2026-03-05', 'Celik ve demir malzeme alimi',         NOW(), NOW()),
    (gen_random_uuid(), v_biz_insaat, v_cat_iscilik, v_admin_id,  85000.00, 'EXPENSE', 'TRY', '2026-03-08', 'Mart ayi isci ucretleri',              NOW(), NOW()),
    (gen_random_uuid(), v_biz_insaat, v_cat_malzeme, v_admin_id,  67000.00, 'EXPENSE', 'TRY', '2026-03-12', 'Beton ve cimento siparisi',            NOW(), NOW()),
    (gen_random_uuid(), v_biz_insaat, v_cat_hakedis, v_admin_id, 320000.00, 'INCOME',  'TRY', '2026-03-15', 'B Blok temel hakedisi',                NOW(), NOW()),
    (gen_random_uuid(), v_biz_insaat, v_cat_malzeme, v_admin_id,  53000.00, 'EXPENSE', 'TRY', '2026-03-18', 'Elektrik ve tesisat malzemesi',        NOW(), NOW()),
    (gen_random_uuid(), v_biz_insaat, v_cat_iscilik, v_admin_id,  92000.00, 'EXPENSE', 'TRY', '2026-03-22', 'Taseron ekip odemesi',                 NOW(), NOW());

  -- RESTAURANT transactions (5k-50k TRY range)
  INSERT INTO transactions (id, business_id, category_id, created_by, amount, direction, currency, date, description, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_biz_restoran, v_cat_yemek,    v_admin_id, 48000.00, 'INCOME',  'TRY', '2026-03-01', 'Haftalik yemek satislari (1. hafta)', NOW(), NOW()),
    (gen_random_uuid(), v_biz_restoran, v_cat_hammadde, v_admin_id, 18500.00, 'EXPENSE', 'TRY', '2026-03-03', 'Et ve balik tedarikcisi odemesi',     NOW(), NOW()),
    (gen_random_uuid(), v_biz_restoran, v_cat_personel, v_admin_id, 35000.00, 'EXPENSE', 'TRY', '2026-03-05', 'Mutfak ve servis personeli maasi',    NOW(), NOW()),
    (gen_random_uuid(), v_biz_restoran, v_cat_yemek,    v_admin_id, 52000.00, 'INCOME',  'TRY', '2026-03-08', 'Haftalik yemek satislari (2. hafta)', NOW(), NOW()),
    (gen_random_uuid(), v_biz_restoran, v_cat_hammadde, v_admin_id, 12000.00, 'EXPENSE', 'TRY', '2026-03-10', 'Sebze meyve hal alimi',               NOW(), NOW()),
    (gen_random_uuid(), v_biz_restoran, v_cat_yemek,    v_admin_id, 45000.00, 'INCOME',  'TRY', '2026-03-15', 'Haftalik yemek satislari (3. hafta)', NOW(), NOW()),
    (gen_random_uuid(), v_biz_restoran, v_cat_hammadde, v_admin_id,  8500.00, 'EXPENSE', 'TRY', '2026-03-17', 'Icecek ve baharat tedarikcisi',       NOW(), NOW()),
    (gen_random_uuid(), v_biz_restoran, v_cat_yemek,    v_admin_id, 41000.00, 'INCOME',  'TRY', '2026-03-22', 'Haftalik yemek satislari (4. hafta)', NOW(), NOW());

  -- TECHNOLOGY transactions (20k-150k TRY range)
  INSERT INTO transactions (id, business_id, category_id, created_by, amount, direction, currency, date, description, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_biz_yazilim, v_cat_yazilim_dev, v_admin_id, 145000.00, 'INCOME',  'TRY', '2026-03-01', 'E-ticaret projesi 2. faz odemesi',  NOW(), NOW()),
    (gen_random_uuid(), v_biz_yazilim, v_cat_sunucu,      v_admin_id,  28000.00, 'EXPENSE', 'TRY', '2026-03-03', 'AWS bulut sunucu faturasi',          NOW(), NOW()),
    (gen_random_uuid(), v_biz_yazilim, v_cat_danismanlik,  v_admin_id,  65000.00, 'INCOME',  'TRY', '2026-03-07', 'Fintech danismanlik hizmeti',        NOW(), NOW()),
    (gen_random_uuid(), v_biz_yazilim, v_cat_yazilim_dev, v_admin_id,  95000.00, 'INCOME',  'TRY', '2026-03-12', 'Mobil uygulama teslim odemesi',      NOW(), NOW()),
    (gen_random_uuid(), v_biz_yazilim, v_cat_sunucu,      v_admin_id,  22000.00, 'EXPENSE', 'TRY', '2026-03-15', 'Domain ve SSL sertifika yenileme',   NOW(), NOW()),
    (gen_random_uuid(), v_biz_yazilim, v_cat_danismanlik,  v_admin_id,  40000.00, 'INCOME',  'TRY', '2026-03-20', 'Siber guvenlik denetimi',            NOW(), NOW());

  -- RETAIL transactions (2k-30k TRY range)
  INSERT INTO transactions (id, business_id, category_id, created_by, amount, direction, currency, date, description, created_at, updated_at)
  VALUES
    (gen_random_uuid(), v_biz_market, v_cat_satis,   v_admin_id, 28000.00, 'INCOME',  'TRY', '2026-03-01', 'Haftalik kasa hasılati (1. hafta)',   NOW(), NOW()),
    (gen_random_uuid(), v_biz_market, v_cat_tedarik, v_admin_id, 15000.00, 'EXPENSE', 'TRY', '2026-03-03', 'Gida toptancisi faturasi',            NOW(), NOW()),
    (gen_random_uuid(), v_biz_market, v_cat_kira,    v_admin_id, 12000.00, 'EXPENSE', 'TRY', '2026-03-05', 'Mart ayi dukkan kirasi',              NOW(), NOW()),
    (gen_random_uuid(), v_biz_market, v_cat_satis,   v_admin_id, 25000.00, 'INCOME',  'TRY', '2026-03-08', 'Haftalik kasa hasılati (2. hafta)',   NOW(), NOW()),
    (gen_random_uuid(), v_biz_market, v_cat_tedarik, v_admin_id, 18000.00, 'EXPENSE', 'TRY', '2026-03-10', 'Temizlik ve kirtasiye tedarikcisi',   NOW(), NOW()),
    (gen_random_uuid(), v_biz_market, v_cat_satis,   v_admin_id, 30000.00, 'INCOME',  'TRY', '2026-03-15', 'Haftalik kasa hasılati (3. hafta)',   NOW(), NOW()),
    (gen_random_uuid(), v_biz_market, v_cat_tedarik, v_admin_id,  9500.00, 'EXPENSE', 'TRY', '2026-03-18', 'Icecek distributorlugu odemesi',      NOW(), NOW());

  -- ============================================================
  -- 7. MONTHLY SUMMARIES (March 2026)
  -- ============================================================

  -- Construction: Income=770000, Expense=422000, Net=348000, Count=7
  INSERT INTO monthly_summaries (id, business_id, year, month, total_income, total_expense, net_profit, transaction_count, breakdown_by_category, created_at, updated_at)
  VALUES (gen_random_uuid(), v_biz_insaat, 2026, 3,
    770000.00, 422000.00, 348000.00, 7,
    '{"Hakediş": {"income": 770000.00}, "Malzeme": {"expense": 245000.00}, "Iscilik": {"expense": 177000.00}}',
    NOW(), NOW());

  -- Restaurant: Income=186000, Expense=74000, Net=112000, Count=8
  INSERT INTO monthly_summaries (id, business_id, year, month, total_income, total_expense, net_profit, transaction_count, breakdown_by_category, created_at, updated_at)
  VALUES (gen_random_uuid(), v_biz_restoran, 2026, 3,
    186000.00, 74000.00, 112000.00, 8,
    '{"Yemek Satisi": {"income": 186000.00}, "Hammadde": {"expense": 39000.00}, "Personel": {"expense": 35000.00}}',
    NOW(), NOW());

  -- Technology: Income=345000, Expense=50000, Net=295000, Count=6
  INSERT INTO monthly_summaries (id, business_id, year, month, total_income, total_expense, net_profit, transaction_count, breakdown_by_category, created_at, updated_at)
  VALUES (gen_random_uuid(), v_biz_yazilim, 2026, 3,
    345000.00, 50000.00, 295000.00, 6,
    '{"Yazilim Gelistirme": {"income": 240000.00}, "Danismanlik": {"income": 105000.00}, "Sunucu Gideri": {"expense": 50000.00}}',
    NOW(), NOW());

  -- Retail: Income=83000, Expense=54500, Net=28500, Count=7
  INSERT INTO monthly_summaries (id, business_id, year, month, total_income, total_expense, net_profit, transaction_count, breakdown_by_category, created_at, updated_at)
  VALUES (gen_random_uuid(), v_biz_market, 2026, 3,
    83000.00, 54500.00, 28500.00, 7,
    '{"Satis": {"income": 83000.00}, "Tedarik": {"expense": 42500.00}, "Kira": {"expense": 12000.00}}',
    NOW(), NOW());

END $$;

COMMIT;

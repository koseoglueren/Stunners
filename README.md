# STUNNERS Clan Farm

Knight Online USKO **STUNNERS** clanı için farm, loot ve adil paylaşım takip sitesi.

## Neler var

- **Giriş:** Her üye kendi kullanıcı adı ve şifresiyle girer. Roller: Lider, Yönetici, Üye.
- **Üyeler:** Ekle, düzenle, pasife al (geçmiş kayıtlar silinmez), şifre sıfırla.
- **Farm oturumu:** Yer, başlangıç ve bitiş saati, ekip. Aynı anda birden fazla parti açılabilir.
- **Loot kaydı:** Coin (Noah), Upgrade Scroll, Weapon, Armor, taş/malzeme, diğer. Her kayıtta "kimde" bilgisi.
  Miktarlar `150m`, `1,5b`, `250k` ya da `150.000.000` şeklinde yazılabilir.
- **Satış ve dağıtım:** Item satıldı (gerçek fiyat + satan kişi) veya üyeye verildi (değeri payından düşülür).
- **Gün sonu hesabı:** Bir veya birden fazla farm seçilir, toplam kazanç tüm katılımcılara **eşit** bölünür,
  kesinti yoktur. Sistem "kim kime ne kadar Noah verecek" listesini en az transferle çıkarır.
  Henüz satılmamış itemler hesaba girmez; satılınca aynı farmlar için ek hesap yapılır.
- **Ödemeler:** Veren "Gönderdim", alan "Aldım" der.
- **Ana panel, raporlar** (farm yeri verimi, üye katılımı, düşen itemler), **item kataloğu**, **işlem geçmişi**.

## Ücretsiz yayına alma (Vercel + Neon)

1. [vercel.com](https://vercel.com) adresinde GitHub hesabınla ücretsiz kaydol.
2. **Add New → Project** ile `koseoglueren/Stunners` reposunu içe aktar. Proje adını `stunners` yaz;
   site `https://stunners.vercel.app` adresinde açılır (isim doluysa Vercel `stunners-xxx` gibi bir ad önerir).
3. Deploy etmeden önce projede **Storage → Create Database → Neon (Postgres)** seç, ücretsiz planla oluştur ve
   projeye bağla. Bu, `DATABASE_URL` değişkenini otomatik ekler.
4. **Settings → Environment Variables** bölümüne şunları ekle:
   - `DIRECT_URL`: Neon'daki *unpooled* bağlantı adresi (Vercel bunu `DATABASE_URL_UNPOOLED` adıyla da ekler, değerini kopyala).
   - `AUTH_SECRET`: en az 32 karakterlik rastgele bir metin.
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_CHARACTER`: ilk Lider hesabı.
5. **Deploy**'a bas. Her deploy'da veritabanı tabloları otomatik güncellenir; ilk deploy'da Lider hesabı,
   farm yerleri ve örnek item kataloğu oluşur. Sonra siteye girip diğer üyeleri **Üyeler → Üye ekle** ile ekle.

Bundan sonra `main` dalına gelen her değişiklik siteye otomatik yansır.

## Yerelde çalıştırma (geliştirici için)

```bash
cp .env.example .env      # kendi PostgreSQL adresini yaz
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev               # http://localhost:3000
npm test                  # paylaşım hesabı testleri
```

## Teknik

Next.js 15 (App Router, Server Actions), TypeScript, Tailwind CSS 4, PostgreSQL + Prisma.
Tüm Noah tutarları tam sayı (BigInt) olarak tutulur, yuvarlama hatası olmaz; bölmeden kalan birkaç Noah
ilk üyelere 1'er Noah olarak dağıtılır ki paylar toplamı tam tutsun.

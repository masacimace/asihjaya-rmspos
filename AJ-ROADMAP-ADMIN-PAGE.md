Dari struktur terbaru, menu admin sekarang sudah terbagi cukup jelas: **Dashboard, Penjualan, Produk, Inventaris, Pelanggan, Operasional, Administrasi, dan Pengaturan**. Submenu Operasional juga sudah berisi Shift Kasir, Laporan Outlet, Riwayat Approval, Pergerakan Kas, dan Hardware Hub.

Roadmap `/admin` dibuat per fase seperti ini supaya development-nya tidak lompat-lompat.

### ADMIN-R1 — Audit & base polish admin shell

Tujuan: memastikan layout `/admin` siap jadi dashboard utama, konsisten dengan polish `/pos`.

Scope:

- rapikan logo brand admin shell
- rapikan label menu dan submenu
- cek active state nav
- cek responsive sidebar/mobile drawer
- cek permission-based menu
- pastikan semua route admin punya empty/loading/error state dasar

Output:

/admin layout terasa final
navigasi admin konsisten
tidak ada page yang terlihat terlalu mockup secara UI dasar

### ADMIN-R2 — Dashboard real data

Tujuan: ubah `/admin` dari mockup menjadi dashboard operasional real.

Widget yang ideal:

- penjualan hari ini
- omzet hari ini
- jumlah transaksi hari ini
- rata-rata nilai transaksi
- item terjual
- stok tersedia
- transaksi tertahan
- print job gagal
- shift aktif
- hardware hub status
- grafik penjualan 7/30 hari
- top kategori / top produk

Output:

/admin menjadi executive dashboard real data

Rekomendasi: mulai dari ini setelah admin shell, karena dashboard adalah halaman pertama yang dilihat owner/admin.

### ADMIN-R3 — Penjualan real data

Menu:

/admin/penjualan

Scope:

- list transaksi real
- search invoice/customer/SKU/barcode
- filter tanggal/status/outlet/payment method
- detail transaksi
- preview/download receipt certificate
- reprint receipt certificate
- status print job
- export CSV/XLSX
- void/refund transaksi, tapi bisa dibuat subfase karena sensitif

Subfase:

ADMIN-R3A list + detail transaksi
ADMIN-R3B reprint/download/export
ADMIN-R3C void/refund + audit

Output:

admin bisa audit semua transaksi POS

### ADMIN-R4 — Produk master management

Menu:

/admin/produk

Fokus: master product.

Scope:

- list master product real
- create/edit master product
- kategori
- brand/material/collection
- image master product
- status draft/active/inactive
- detail master product berisi item product
- search/filter kategori/status
- bulk activation jika diperlukan

Karena sekarang product item sudah punya `displayName`, halaman master product perlu jelas membedakan:

Master Product = model/kelompok produk
Item Product = item fisik yang dijual di POS

Output:

struktur product catalog rapi dan siap dipakai admin

### ADMIN-R5 — Product item / inventory item management

Menu:

/admin/inventaris
/admin/inventaris/item/[itemId]

Fokus: item fisik.

Scope:

- list item real
- create/edit item product
- field `Nama item di POS`
- barcode/QR/SKU
- berat, kadar, kadar tukar
- harga jual
- potongan per gram
- harga modal
- foto item
- status availability
- lokasi outlet
- kondisi barang
- movement history
- audit item
- print barcode/label item

Subfase:

ADMIN-R5A item form + detail polish
ADMIN-R5B inventory movement history
ADMIN-R5C barcode/label print

Output:

admin bisa mengelola item fisik jewelry secara detail

### ADMIN-R6 — Pelanggan real data

Menu:

/admin/pelanggan

Scope:

- list customer real
- create/edit customer
- search nama/kode/telepon
- detail customer
- riwayat transaksi customer
- total belanja
- last purchase
- customer notes
- merge duplicate customer, bisa nanti

Output:

customer database siap dipakai untuk transaksi dan analisa

### ADMIN-R7 — Operasional shift kasir

Menu:

/admin/operasional/shift

Scope:

- list shift real
- detail shift
- transaksi per shift
- expected cash
- actual cash
- cash variance
- cash movement
- siapa buka/tutup shift
- export closing report
- print closing report

Output:

owner/admin bisa audit shift kasir dan uang cash

### ADMIN-R8 — Pergerakan kas

Menu:

/admin/operasional/kas

Scope:

- cash sale
- cash in
- cash out
- correction
- filter shift/outlet/tanggal
- reason/catatan
- audit log
- summary cash movement

Output:

cash drawer bisa diaudit rapi

### ADMIN-R9 — Approval workflow

Menu:

/admin/operasional/approval

Scope:

- list request approval
- approval diskon/manual adjustment
- approval void/refund
- approval transfer inventory, jika nanti dipakai
- approve/reject
- audit trail

Output:

aksi sensitif tidak bisa dilakukan tanpa approval

### ADMIN-R10 — Hardware Hub management

Menu:

/admin/operasional/hardware

Scope:

- status hardware agent
- last seen
- register connected
- printer config
- print job list
- failed job retry
- certificate/receipt printer mapping
- diagnostics

Output:

admin bisa cek dan troubleshoot printer/hardware hub

### ADMIN-R11 — Laporan outlet

Menu:

/admin/laporan

Scope:

- laporan penjualan per outlet
- laporan item terjual
- laporan kategori
- laporan payment method
- laporan cash vs non-cash
- laporan stock value
- export Excel/PDF

Output:

owner punya laporan operasional toko

### ADMIN-R12 — Administrasi user, role, outlet

Menu:

/admin/administrasi

Scope:

- user management
- role/permission
- outlet management
- register management
- organization settings
- staff outlet access

Output:

multi-user dan multi-outlet lebih aman

### ADMIN-R13 — Pengaturan sistem

Menu:

/admin/pengaturan

Scope:

- profile toko
- logo receipt/certificate
- format invoice
- receipt terms
- default printer behavior
- payment method settings
- POS settings
- stock/hold cart settings
- QR verification settings

Output:

setting operasional bisa diatur tanpa ubah code

## Urutan development yang aku rekomendasikan

Supaya paling aman dan terasa progresnya, menurutku urutannya seperti ini:

ADMIN-R1 Admin shell polish
ADMIN-R2 Dashboard real data
ADMIN-R3 Penjualan real data
ADMIN-R5 Inventory item management
ADMIN-R4 Product master management
ADMIN-R6 Pelanggan real data
ADMIN-R7 Shift kasir
ADMIN-R8 Pergerakan kas
ADMIN-R10 Hardware Hub
ADMIN-R11 Laporan outlet
ADMIN-R12 Administrasi
ADMIN-R13 Pengaturan
ADMIN-R9 Approval workflow

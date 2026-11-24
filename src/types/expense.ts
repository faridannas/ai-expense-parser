import { z } from 'zod';

// 1. Definisikan daftar kategori yang valid secara ketat (Enum)
export const EXPENSE_CATEGORIES = [
  'Makanan & Minuman',
  'Transportasi',
  'Belanja & Kebutuhan',
  'Tagihan & Utilitas',
  'Hiburan',
  'Kesehatan',
  'Lainnya',
] as const;

// 2. Skema Zod untuk satu item pengeluaran
export const ExpenseItemSchema = z.object({
  itemName: z
    .string()
    .min(1, 'Nama item tidak boleh kosong')
    .describe('Nama barang atau jasa yang dibeli, dirapikan kapitalisasinya'),
  category: z
    .enum(EXPENSE_CATEGORIES)
    .describe('Kategori pengeluaran yang paling sesuai'),
  quantity: z
    .number()
    .int()
    .positive()
    .default(1)
    .describe('Jumlah unit barang, default 1 jika tidak disebutkan'),
  unitPrice: z
    .number()
    .nonnegative()
    .describe('Harga satuan dalam Rupiah (angka murni tanpa titik/koma)'),
  totalPrice: z
    .number()
    .nonnegative()
    .describe('Total harga untuk item ini (quantity * unitPrice)'),
});

// 3. Skema Zod untuk keseluruhan hasil parsing struk/catatan
export const ReceiptParseResultSchema = z.object({
  merchantName: z
    .string()
    .nullable()
    .describe('Nama toko/merchant jika terdeteksi, atau null jika catatan pribadi'),
  transactionDate: z
    .string()
    .nullable()
    .describe('Tanggal transaksi dalam format YYYY-MM-DD jika ada, atau null'),
  currency: z
    .string()
    .default('IDR')
    .describe('Kode mata uang, default IDR'),
  items: z
    .array(ExpenseItemSchema)
    .min(1, 'Minimal harus ada 1 item pengeluaran'),
  grandTotal: z
    .number()
    .nonnegative()
    .describe('Total keseluruhan pengeluaran dari semua item'),
  notes: z
    .string()
    .nullable()
    .describe('Catatan tambahan seperti diskon, pajak, atau metode pembayaran jika ada'),
});

// 4. Skema untuk validasi request body dari Frontend ke Backend API
export const ParseRequestSchema = z.object({
  rawText: z
    .string()
    .trim()
    .min(3, 'Teks terlalu pendek untuk dianalisis')
    .max(5000, 'Teks maksimal 5000 karakter'),
});

// 5. Ekstrak Tipe TypeScript murni langsung dari Skema Zod (Zero Duplication!)
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseItem = z.infer<typeof ExpenseItemSchema>;
export type ReceiptParseResult = z.infer<typeof ReceiptParseResultSchema>;
export type ParseRequest = z.infer<typeof ParseRequestSchema>;
'use client';

import { useState, FormEvent } from 'react';
import {
  Receipt,
  Sparkles,
  Copy,
  Check,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import type { ReceiptParseResult } from '@/types/expense';

const SAMPLE_TEXTS = [
  {
    label: 'Catatan Harian',
    value:
      'Hari ini beli kopi susu 22rb, nasi ayam geprek 2x @18000, sama parkir motor 4rb. Bayar QRIS.',
  },
  {
    label: 'Struk Belanja',
    value:
      'TOKO BERKAH JAYA\nTgl: 23/11/2026\nRoti Gandum 100% x2  38.000\nAir Mineral 600ml x3  4.000\nDiskon member: 5.000',
  },
];

function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function escapeCsvCell(value: string | number | null): string {
  const str = value === null ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function HomePage() {
  const [rawText, setRawText] = useState<string>('');
  const [result, setResult] = useState<ReceiptParseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copiedJson, setCopiedJson] = useState<boolean>(false);

  async function handleParse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setCopiedJson(false);

    if (!rawText.trim()) {
      setErrorMsg('Masukkan teks struk atau catatan pengeluaran terlebih dahulu.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText }),
      });

      const payload: unknown = await res.json();

      if (!res.ok) {
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          'error' in payload &&
          typeof payload.error === 'string'
            ? payload.error
            : 'Gagal memproses teks pengeluaran.';
        setErrorMsg(message);
        setResult(null);
        return;
      }

      if (
        typeof payload === 'object' &&
        payload !== null &&
        'data' in payload &&
        payload.data
      ) {
        setResult(payload.data as ReceiptParseResult);
      } else {
        setErrorMsg('Format respons API tidak dikenali.');
      }
    } catch {
      setErrorMsg('Terjadi kesalahan jaringan saat menghubungi server.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCopyJson() {
    if (!result) return;
    await navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  }

  function handleDownloadCsv() {
    if (!result) return;

    const headers = [
      'Merchant',
      'Tanggal',
      'Item',
      'Kategori',
      'Qty',
      'Harga Satuan',
      'Total Item',
      'Mata Uang',
    ];

    const rows = result.items.map((item) => [
      escapeCsvCell(result.merchantName),
      escapeCsvCell(result.transactionDate),
      escapeCsvCell(item.itemName),
      escapeCsvCell(item.category),
      escapeCsvCell(item.quantity),
      escapeCsvCell(item.unitPrice),
      escapeCsvCell(item.totalPrice),
      escapeCsvCell(result.currency),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `expenses-${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 px-4 py-10">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <Receipt className="w-3.5 h-3.5" />
            TypeScript Strict + Zod + Gemini Structured Outputs
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            AI Receipt &amp; Expense Parser
          </h1>
          <p className="text-slate-400 text-sm">
            Ubah teks struk atau catatan pengeluaran bebas menjadi data terstruktur yang siap disalin sebagai JSON atau diunduh ke CSV.
          </p>
        </header>

        {/* Form Input */}
        <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="expense-input"
              className="text-sm font-medium text-slate-200"
            >
              Teks Struk / Catatan Pengeluaran
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Contoh cepat:</span>
              {SAMPLE_TEXTS.map((sample) => (
                <button
                  key={sample.label}
                  type="button"
                  onClick={() => {
                    setRawText(sample.value);
                    setErrorMsg(null);
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleParse} className="space-y-4">
            <textarea
              id="expense-input"
              rows={5}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Contoh: Beli kopi susu 22rb, nasi goreng 18000, parkir 3rb..."
              className="w-full rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-none p-3.5 text-sm text-slate-100 placeholder:text-slate-500"
            />

            <div className="flex items-center justify-end gap-3">
              {rawText && (
                <button
                  type="button"
                  onClick={() => {
                    setRawText('');
                    setResult(null);
                    setErrorMsg(null);
                  }}
                  className="px-4 py-2.5 rounded-xl text-sm text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Bersihkan
                </button>
              )}
              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Parse Pengeluaran
                  </>
                )}
              </button>
            </div>
          </form>

          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </section>

        {/* Hasil Parsing */}
        {result && (
          <section className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {result.merchantName ?? 'Catatan Pengeluaran'}
                </h2>
                <p className="text-xs text-slate-400">
                  Tanggal: {result.transactionDate ?? 'Tidak terdeteksi'} • Mata uang:{' '}
                  {result.currency}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyJson}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition cursor-pointer"
                >
                  {copiedJson ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Tersalin
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy JSON
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* Tabel Item */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs">
                    <th className="py-2.5 pr-4">Item</th>
                    <th className="py-2.5 px-4">Kategori</th>
                    <th className="py-2.5 px-4 text-right">Qty</th>
                    <th className="py-2.5 px-4 text-right">Harga Satuan</th>
                    <th className="py-2.5 pl-4 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {result.items.map((item, idx) => (
                    <tr key={`${item.itemName}-${idx}`} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-4 font-medium text-slate-100">
                        {item.itemName}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs bg-slate-800 text-emerald-300 border border-slate-700">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-300">
                        {item.quantity}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-300">
                        {formatRupiah(item.unitPrice)}
                      </td>
                      <td className="py-3 pl-4 text-right font-semibold text-white">
                        {formatRupiah(item.totalPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Ringkasan Total & Catatan */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-800">
              <p className="text-xs text-slate-400">
                {result.notes ? `Catatan: ${result.notes}` : 'Tidak ada catatan tambahan.'}
              </p>
              <div className="text-right">
                <span className="text-xs text-slate-400 block">Grand Total</span>
                <span className="text-xl font-bold text-emerald-400">
                  {formatRupiah(result.grandTotal)}
                </span>
              </div>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import {
  EXPENSE_CATEGORIES,
  ParseRequestSchema,
  ReceiptParseResultSchema,
  type ReceiptParseResult,
  type ExpenseItem,
} from "@/types/expense";

// Skema JSON untuk Structured Outputs Gemini agar selaras dengan ExpenseItem & ReceiptParseResult
const receiptResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    merchantName: {
      type: Type.STRING,
      nullable: true,
      description:
        "Nama toko/merchant jika terdeteksi, atau null jika catatan pribadi",
    },
    transactionDate: {
      type: Type.STRING,
      nullable: true,
      description:
        "Tanggal transaksi dalam format YYYY-MM-DD jika ada, atau null",
    },
    currency: {
      type: Type.STRING,
      description: "Kode mata uang, default IDR",
    },
    items: {
      type: Type.ARRAY,
      description: "Daftar item pengeluaran yang terdeteksi",
      items: {
        type: Type.OBJECT,
        properties: {
          itemName: {
            type: Type.STRING,
            description:
              "Nama barang atau jasa yang dibeli, dirapikan kapitalisasinya",
          },
          category: {
            type: Type.STRING,
            enum: [...EXPENSE_CATEGORIES],
            description: "Kategori pengeluaran yang paling sesuai",
          },
          quantity: {
            type: Type.INTEGER,
            description: "Jumlah unit barang, default 1 jika tidak disebutkan",
          },
          unitPrice: {
            type: Type.NUMBER,
            description:
              "Harga satuan dalam Rupiah (angka murni tanpa titik/koma)",
          },
          totalPrice: {
            type: Type.NUMBER,
            description: "Total harga untuk item ini (quantity * unitPrice)",
          },
        },
        required: [
          "itemName",
          "category",
          "quantity",
          "unitPrice",
          "totalPrice",
        ],
      },
    },
    grandTotal: {
      type: Type.NUMBER,
      description: "Total keseluruhan pengeluaran dari semua item",
    },
    notes: {
      type: Type.STRING,
      nullable: true,
      description:
        "Catatan tambahan seperti diskon, pajak, atau metode pembayaran jika ada",
    },
  },
  required: ["currency", "items", "grandTotal"],
};

// Fallback parser deterministik saat server Gemini mengalami lonjakan trafik (503/429)
function buildFallbackResult(rawText: string): ReceiptParseResult {
  const lines = rawText
    .split(/[\n,]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const items: ExpenseItem[] = [];

  for (const line of lines) {
    const priceMatch = line.match(/(\d+(?:[.,]\d+)?)\s*(rb|k)?/i);
    if (!priceMatch || !priceMatch[1]) continue;

    const rawNum = Number(priceMatch[1].replace(/[.,]/g, ""));
    const suffix = (priceMatch[2] ?? "").toLowerCase();
    const amount = suffix === "rb" || suffix === "k" ? rawNum * 1000 : rawNum;

    if (amount >= 500) {
      const cleanedName = line
        .replace(priceMatch[0], "")
        .replace(/[@xX*\-:]/g, " ")
        .trim();

      items.push({
        itemName: cleanedName || "Item Pengeluaran",
        category: "Lainnya",
        quantity: 1,
        unitPrice: amount,
        totalPrice: amount,
      });
    }
  }

  const safeItems: ExpenseItem[] =
    items.length > 0
      ? items
      : [
          {
            itemName: rawText.slice(0, 40),
            category: "Lainnya",
            quantity: 1,
            unitPrice: 0,
            totalPrice: 0,
          },
        ];

  const grandTotal = safeItems.reduce((sum, item) => sum + item.totalPrice, 0);

  return {
    merchantName: null,
    transactionDate: new Date().toISOString().slice(0, 10),
    currency: "IDR",
    items: safeItems,
    grandTotal,
    notes:
      "Diproses via Fallback Parser karena server Gemini sedang sibuk (503).",
  };
}

export async function POST(req: NextRequest) {
  try {
    // 1. Pastikan GEMINI_API_KEY tersedia di environment
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY belum dikonfigurasi di environment." },
        { status: 500 },
      );
    }

    // 2. Parse & validasi body request dari client menggunakan Zod
    const body: unknown = await req.json();
    const parsedRequest = ParseRequestSchema.safeParse(body);

    if (!parsedRequest.success) {
      return NextResponse.json(
        {
          error: "Input tidak valid.",
          details: parsedRequest.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { rawText } = parsedRequest.data;

    // 3. Inisialisasi Google Gen AI SDK & panggil Gemini dengan Structured Outputs
    const ai = new GoogleGenAI({ apiKey });
    const sleep = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));

    let rawJsonText: string | undefined;
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Ekstrak data pengeluaran dari teks struk atau catatan berikut ke dalam format terstruktur. Jika nominal ditulis pakai singkatan seperti "rb" atau "k", ubah menjadi angka penuh (contoh: 25rb -> 25000). Jika hanya ada total per item tanpa harga satuan eksplisit, hitung unitPrice = totalPrice / quantity.\n\nTeks:\n${rawText}`,
                },
              ],
            },
          ],
          config: {
            systemInstruction:
              "Kamu adalah asisten akuntansi presisi tinggi yang mengekstrak data pengeluaran menjadi JSON terstruktur tanpa mengarang data yang tidak ada.",
            responseMimeType: "application/json",
            responseSchema: receiptResponseSchema,
            temperature: 0.1,
          },
        });

        rawJsonText = response.text;
        if (rawJsonText) break;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : "";
        const isTransient = msg.includes("503") || msg.includes("429");

        if (!isTransient || attempt === 3) break;

        console.warn(
          `Attempt ${attempt} sibuk (503/429), mencoba ulang dalam 1.5 detik...`,
        );
        await sleep(1500 * attempt);
      }
    }

    // Jika Gemini gagal karena server sibuk (503/429), gunakan Fallback Parser agar UX tetap jalan
    if (!rawJsonText) {
      const errMsg = lastError instanceof Error ? lastError.message : "";
      if (errMsg.includes("503") || errMsg.includes("429")) {
        const fallbackData = ReceiptParseResultSchema.parse(
          buildFallbackResult(rawText),
        );
        return NextResponse.json({ data: fallbackData }, { status: 200 });
      }

      throw (
        lastError ??
        new Error("Model sedang sibuk, silakan coba beberapa saat lagi.")
      );
    }

    // 4. Validasi output JSON dari Gemini dengan Zod (runtime type safety)
    const jsonOutput: unknown = JSON.parse(rawJsonText);
    const validatedResult = ReceiptParseResultSchema.safeParse(jsonOutput);

    if (!validatedResult.success) {
      return NextResponse.json(
        {
          error: "Hasil parsing AI tidak sesuai skema yang diharapkan.",
          details: validatedResult.error.flatten(),
        },
        { status: 500 },
      );
    }

    return NextResponse.json({ data: validatedResult.data }, { status: 200 });
  } catch (error) {
    console.error("Error di /api/parse:", error);
    const detailMessage =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Gagal memproses: ${detailMessage}` },
      { status: 500 },
    );
  }
}
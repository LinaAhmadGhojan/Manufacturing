import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import Barcode from "./Barcode";
import { PrintButton } from "./Confirm";
import { btn, btn2 } from "./ui";

/** Print sheet wrapper. ?fmt=thermal → one 100×60 mm label per page, default → A4 grid. */
export function LabelSheet({ title, back, fmt, children, count }: { title: string; back: string; fmt?: string; children: React.ReactNode; count: number }) {
  const thermal = fmt === "thermal";
  return (
    <div>
      <style>{thermal
        ? `@page{size:100mm 60mm;margin:0}@media print{.label{page-break-after:always;border:none!important;margin:0!important;width:100mm!important;height:60mm!important}}`
        : `@page{size:A4;margin:8mm}@media print{.label{break-inside:avoid}}`}</style>
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-muted">{count} label{count === 1 ? "" : "s"} · {thermal ? "thermal 100×60 mm, one per page" : "A4 sheet, 2 per row"}</p>
        </div>
        <div className="flex gap-2">
          <Link href={back} className={btn2}><ArrowLeft size={14} /> Back</Link>
          <Link href={`?fmt=${thermal ? "sheet" : "thermal"}`} className={btn2}>{thermal ? "A4 sheet" : "Thermal format"}</Link>
          <PrintButton className={btn}><Printer size={14} /> Print</PrintButton>
        </div>
      </div>
      <div className={thermal ? "flex flex-col items-start gap-4 print:gap-0" : "grid grid-cols-1 gap-3 md:grid-cols-2 print:gap-2"}>{children}</div>
    </div>
  );
}

const box = "label flex h-[60mm] w-[100mm] flex-col justify-between overflow-hidden rounded border-2 border-black bg-white p-[3mm] text-black";

function Head({ left, right }: { left: string; right?: string }) {
  return (
    <div className="flex items-center justify-between border-b-2 border-black pb-1">
      <span className="text-[11px] font-black tracking-widest">MFP · {left}</span>
      <span className="text-[10px] font-semibold">{right}</span>
    </div>
  );
}

export function SerialLabel({ serial, product, code, model, refrigerant, voltage, poNo, lot, date }: { serial: string; product: string; code: string; model?: string | null; refrigerant?: string | null; voltage?: string | null; poNo: string; lot?: string | null; date: Date }) {
  return (
    <div className={box}>
      <Head left="PRODUCT SERIAL" right={date.toLocaleDateString()} />
      <div>
        <div className="text-[13px] font-bold leading-tight">{product}</div>
        <div className="text-[10px]">Item {code}{model ? ` · Model ${model}` : ""}</div>
        <div className="text-[10px]">{[refrigerant && `Refrigerant ${refrigerant}`, voltage && voltage].filter(Boolean).join(" · ")}</div>
      </div>
      <div className="mx-auto w-[88mm]"><Barcode value={serial} height={30} /></div>
      <div className="flex justify-between text-[9px]"><span>S/N <b>{serial}</b></span><span>PO {poNo}{lot ? ` · Lot ${lot}` : ""}</span></div>
    </div>
  );
}

export function BatchLabel({ code, product, productCode, qty, uom, supplier, received, expiry }: { code: string; product: string; productCode: string; qty: number; uom: string; supplier?: string | null; received: Date; expiry?: Date | null }) {
  return (
    <div className={box}>
      <Head left="RAW MATERIAL BATCH" right={`Rec. ${received.toLocaleDateString()}`} />
      <div>
        <div className="text-[13px] font-bold leading-tight">{product}</div>
        <div className="text-[10px]">Item {productCode} · Qty {qty} {uom}{supplier ? ` · ${supplier}` : ""}</div>
        <div className={`text-[11px] font-bold ${expiry ? "" : "text-neutral-500"}`}>{expiry ? `EXPIRY ${expiry.toLocaleDateString()}` : "No expiry"}</div>
      </div>
      <div className="mx-auto w-[88mm]"><Barcode value={code} height={30} /></div>
      <div className="text-[9px]">Batch <b>{code}</b></div>
    </div>
  );
}

export function LotLabel({ lot, product, productCode, qty, uom, poNo, date }: { lot: string; product: string; productCode: string; qty: number; uom: string; poNo: string; date: Date }) {
  return (
    <div className={box}>
      <Head left="FINISHED GOODS LOT" right={date.toLocaleDateString()} />
      <div>
        <div className="text-[13px] font-bold leading-tight">{product}</div>
        <div className="text-[10px]">Item {productCode} · Quantity {qty} {uom} · {poNo}</div>
      </div>
      <div className="mx-auto w-[88mm]"><Barcode value={lot} height={30} /></div>
      <div className="text-[9px]">Lot <b>{lot}</b></div>
    </div>
  );
}

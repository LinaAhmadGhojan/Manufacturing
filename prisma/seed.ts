// Realistic demo data: an air-conditioner manufacturing plant.
// Orders are driven through the same lib functions the UI uses, so history is consistent.
import { db } from "../src/lib/db";
import { createOrder, releaseOrder, serialFor } from "../src/lib/po";
import { completeStep, consumeMaterial, logEquipment, logTime, receiveFinished, recordQc, recordReading, verifyStep, setSuspended, closeOrder, addExpense } from "../src/lib/exec";
import { createPurchaseRequest } from "../src/lib/inventory";

const day = 864e5;
const inDays = (n: number) => new Date(Date.now() + n * day);

async function wipe() {
  for (const m of [
    "repairLog", "qcCheck", "readingEntry", "equipmentEntry", "timeEntry", "consumption", "receipt", "expense", "stockMove", "productionStep", "productionUnit",
    "poMaterial", "purchaseRequest", "productionOrder", "productionRequest", "bomOpAsset", "bomOpReading", "bomOpExpense", "bomOpSub", "bomMaterial", "bomOperation", "bom",
    "batch", "qcTemplatePoint", "qcTemplate", "teamOperation", "teamMember", "lineAsset", "lineProduct", "productionLine", "operationSub", "operation", "subProcess",
    "parameter", "expenseType", "asset", "client", "supplier", "product", "category", "uom", "store", "branch", "reason", "setting",
  ]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any)[m].deleteMany();
  }
}

async function main() {
  await wipe();

  // ── Organisation ─────────────────────────────────────────────
  const [mp, annex] = await Promise.all([
    db.branch.create({ data: { code: "MP", name: "Main Plant", city: "Amman" } }),
    db.branch.create({ data: { code: "AN", name: "Assembly Annex", city: "Zarqa" } }),
  ]);
  const st = Object.fromEntries(await Promise.all([
    ["RM1", "Raw materials store", "RAW", mp.id], ["RM2", "Electronics store", "RAW", mp.id], ["FG1", "Finished goods warehouse", "FINISHED", mp.id],
    ["SC1", "Scrap yard", "SCRAP", mp.id], ["WIP", "Work in progress", "WIP", mp.id], ["RM3", "Annex raw store", "RAW", annex.id], ["FG2", "Annex finished goods", "FINISHED", annex.id],
  ].map(async ([code, name, kind, branchId]) => [code, await db.store.create({ data: { code: code as string, name: name as string, kind: kind as string, branchId: branchId as number } })] as const)));

  await db.uom.createMany({ data: [["PCS", "Piece"], ["KG", "Kilogram"], ["M", "Meter"], ["L", "Litre"], ["SET", "Set"], ["BOX", "Box"]].map(([code, name]) => ({ code, name })) });
  const catNames = ["Compressors", "Copper & tubing", "Electronics", "Motors & fans", "Refrigerants & gases", "Sheet metal", "Plastics", "Packaging", "Fasteners & consumables", "Finished goods"];
  const cat = Object.fromEntries(await Promise.all(catNames.map(async (n) => [n, (await db.category.create({ data: { name: n } })).id] as const)));

  const suppliers = await Promise.all([
    ["SUP-001", "Gulf Compressor Trading", "+962 6 555 0101", "sales@gulfcompressor.example"], ["SUP-002", "Levant Copper Industries", "+962 6 555 0102", "orders@levantcopper.example"],
    ["SUP-003", "Nova Electronics", "+962 6 555 0103", "b2b@novaelec.example"], ["SUP-004", "ChemCool Refrigerants", "+962 6 555 0104", "info@chemcool.example"],
    ["SUP-005", "Delta Packaging", "+962 6 555 0105", "sales@deltapack.example"], ["SUP-006", "Atlas Metals & Sheet", "+962 6 555 0106", "atlas@atlasmetals.example"],
  ].map(([code, name, phone, email]) => db.supplier.create({ data: { code, name, phone, email } })));
  await db.client.createMany({ data: [
    { code: "CL-001", name: "Al-Noor Home Appliances", phone: "+962 7 9000 1001" }, { code: "CL-002", name: "CoolHouse Retail", phone: "+962 7 9000 1002" },
    { code: "CL-003", name: "Horizon Contracting", phone: "+962 7 9000 1003" }, { code: "CL-004", name: "Petra Hotels Group", phone: "+962 7 9000 1004" }, { code: "CL-005", name: "Export — Gulf Distributor", phone: "+971 4 555 0199" },
  ] });

  // ── Assets, parameters, expenses, sub-processes ──────────────
  const A = Object.fromEntries(await Promise.all([
    ["PRS", "Sheet metal press", 14], ["FIN", "Fin press line", 11], ["BND", "CNC tube bender", 9], ["BRZ", "Brazing station", 7], ["CNV", "Assembly conveyor", 5],
    ["VAC", "Vacuum pump 2-stage", 6], ["CHG", "Gas charging machine", 8], ["LKT", "Leak test chamber", 10], ["RUN", "Run-test bench", 12], ["LBL", "Label printer", 2],
  ].map(async ([c, n, r]) => [c, await db.asset.create({ data: { code: `AST-${c}`, name: n as string, hourRate: r as number, branchId: mp.id } })] as const)));
  const P = Object.fromEntries(await Promise.all([
    ["VAC", "Vacuum level", "micron", 0, 500], ["CHG", "Refrigerant charge", "g", 0, 0], ["CUR", "Running current", "A", 2, 9], ["SUC", "Suction pressure", "psi", 90, 140],
    ["DIS", "Discharge pressure", "psi", 300, 450], ["VLT", "Supply voltage", "V", 200, 240], ["INS", "Insulation resistance", "MΩ", 2, 1000],
  ].map(async ([c, n, u, lo, hi]) => [c, await db.parameter.create({ data: { code: `PRM-${c}`, name: n as string, unit: u as string, lowRange: lo as number, highRange: hi as number } })] as const)));
  const X = Object.fromEntries(await Promise.all([["ELC", "Electricity"], ["CON", "Consumables"], ["OUT", "Outsourced testing"], ["OVH", "Factory overhead"]].map(async ([c, n]) => [c, await db.expenseType.create({ data: { code: `EXP-${c}`, name: n } })] as const)));
  const SP = Object.fromEntries(await Promise.all(["Cleaning", "Deburring", "Flaring", "Nitrogen purge", "Evacuation", "Visual inspection", "Labeling"].map(async (n, i) => [n, await db.subProcess.create({ data: { code: `SUB-${i + 1}`, name: n } })] as const)));

  // ── Operations ───────────────────────────────────────────────
  const opDefs: [string, string, string, boolean, boolean, string[]][] = [
    ["CUT", "CUT", "Sheet cutting & pressing", false, false, ["Deburring", "Cleaning"]], ["BND", "BND", "Tube bending", false, false, ["Flaring", "Cleaning"]],
    ["BRZ", "BRZ", "Brazing of coils & joints", false, true, ["Nitrogen purge", "Visual inspection"]], ["ASM", "ASM", "Unit assembly", false, false, ["Cleaning"]],
    ["VAC", "VAC", "Vacuum & evacuation", false, false, ["Evacuation"]], ["CHG", "CHG", "Refrigerant charging", false, false, []],
    ["LKT", "LKT", "Leak test", true, false, ["Visual inspection"]], ["ELT", "ELT", "Electrical run test", true, false, []], ["PCK", "PCK", "Labeling & packing", false, false, ["Labeling"]],
  ];
  const O: Record<string, { id: number }> = {};
  for (const [code, short, name, qc, verify, subs] of opDefs) {
    const o = await db.operation.create({ data: { code, shortName: short, name, requiresQc: qc, requiresVerify: verify, subProcesses: { create: subs.map((s) => ({ subProcessId: SP[s].id })) } } });
    O[code] = o;
  }

  // ── QC templates ─────────────────────────────────────────────
  const qcT = {
    LKT: await db.qcTemplate.create({ data: { name: "Leak test inspection", specs: "Helium sniffer, pressure decay ≤ 0.3 psi / 10 min", points: { create: [
      { label: "No visible oil traces at joints", essential: true }, { label: "Pressure decay within limit", criteria: "≤ 0.3 psi in 10 min", essential: true }, { label: "Service valves tight" }] } } }),
    ELT: await db.qcTemplate.create({ data: { name: "Final run test", genSerial: true, specs: "30-minute continuous run in cooling mode", points: { create: [
      { label: "Cooling performance", criteria: "ΔT ≥ 8°C after 15 min", essential: true }, { label: "Noise level", criteria: "≤ 42 dB(A) indoor" }, { label: "Remote & display function", essential: true }, { label: "Condensate drainage OK" }] } } }),
    BRZ: await db.qcTemplate.create({ data: { name: "Brazing joint inspection", points: { create: [{ label: "Complete alloy flow around joint", essential: true }, { label: "No overheating / oxidation" }] } } }),
    PCK: await db.qcTemplate.create({ data: { name: "Packaging check", points: { create: [{ label: "Accessories & manual present" }, { label: "Serial label matches carton", essential: true }] } } }),
  };

  // ── Products ─────────────────────────────────────────────────
  type Raw = [code: string, name: string, cat: string, uom: string, cost: number, stock: number, min: number, batch?: boolean, shelf?: number];
  const raws: Raw[] = [
    ["RM-CMP-12", "Rotary compressor 12K BTU", "Compressors", "PCS", 62, 120, 30, true], ["RM-CMP-18", "Rotary compressor 18K BTU", "Compressors", "PCS", 88, 80, 20, true],
    ["RM-CMP-24", "Scroll compressor 24K BTU", "Compressors", "PCS", 118, 14, 15, true], ["RM-CU-14", "Copper tube 1/4\" coil", "Copper & tubing", "M", 2.1, 3000, 800],
    ["RM-CU-38", "Copper tube 3/8\" coil", "Copper & tubing", "M", 3.4, 2500, 600], ["RM-CU-12", "Copper tube 1/2\" coil", "Copper & tubing", "M", 4.8, 2000, 500],
    ["RM-CU-58", "Copper tube 5/8\" coil", "Copper & tubing", "M", 6.2, 1200, 300], ["RM-AL-FIN", "Aluminium fin sheet", "Sheet metal", "KG", 4.2, 1800, 400],
    ["RM-STL-SHT", "Galvanized steel sheet 0.8 mm", "Sheet metal", "KG", 1.1, 5000, 1000], ["RM-PLS-ABS", "ABS panel set (indoor)", "Plastics", "SET", 7.5, 400, 100],
    ["RM-MTR-IDF", "Indoor fan motor", "Motors & fans", "PCS", 9.5, 300, 80], ["RM-MTR-ODF", "Outdoor fan motor", "Motors & fans", "PCS", 14, 260, 60],
    ["RM-FAN-CF", "Cross-flow fan blade", "Motors & fans", "PCS", 3.2, 350, 80], ["RM-FAN-AX", "Axial fan blade", "Motors & fans", "PCS", 3.8, 300, 70],
    ["RM-PCB-IDU", "Indoor controller PCB", "Electronics", "PCS", 18, 280, 70, true], ["RM-PCB-ODU", "Outdoor inverter PCB", "Electronics", "PCS", 32, 240, 60, true],
    ["RM-RMT", "Remote controller", "Electronics", "PCS", 3.5, 500, 100], ["RM-VLV-4W", "4-way reversing valve", "Electronics", "PCS", 6.8, 200, 50],
    ["RM-EXV", "Electronic expansion valve", "Electronics", "PCS", 5.5, 300, 60], ["RM-CAP", "Run capacitor 35 µF", "Electronics", "PCS", 1.2, 800, 200],
    ["RM-WIRE", "Wiring harness set", "Electronics", "SET", 4.4, 500, 120], ["RM-GAS-410", "Refrigerant R410A", "Refrigerants & gases", "KG", 9.5, 600, 150, true, 1095],
    ["RM-GAS-32", "Refrigerant R32", "Refrigerants & gases", "KG", 11, 36, 100, true, 1095], ["RM-ALLOY", "Silver brazing alloy rod", "Fasteners & consumables", "KG", 38, 80, 20, true, 730],
    ["RM-N2", "Nitrogen gas (purge)", "Refrigerants & gases", "KG", 1.8, 300, 50], ["RM-INS", "Insulation foam tube", "Fasteners & consumables", "M", 0.9, 4000, 900],
    ["RM-SCRW", "Screw & clip set", "Fasteners & consumables", "SET", 0.45, 6000, 1500], ["RM-PKG-BOX", "Carton box (indoor+outdoor)", "Packaging", "PCS", 1.9, 400, 120],
    ["RM-PKG-FOM", "EPS foam packing set", "Packaging", "SET", 1.1, 420, 120], ["RM-MAN", "Manual & warranty card", "Packaging", "SET", 0.3, 900, 200],
  ];
  const prod: Record<string, { id: number; avgCost: number }> = {};
  for (const [code, name, c, uom, cost, stock, min, batch, shelf] of raws) {
    const p = await db.product.create({
      data: { code, name, kind: "RAW", categoryId: cat[c], uom, avgCost: cost, qtyOnHand: stock, minStock: min, reorderQty: min * 2, requireBatch: !!batch, shelfLifeDays: shelf ?? null, barcode: `62900${String(Math.abs(code.split("").reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7)) % 1e7).padStart(7, "0")}` },
    });
    prod[code] = p;
    if (batch) {
      // Split stock across lots; one lot per supplier, FEFO matters.
      const parts = stock >= 100 ? [0.55, 0.45] : [1];
      let n = 0;
      for (const f of parts) {
        n++;
        const q = Math.round(stock * f * 100) / 100;
        await db.batch.create({
          data: { productId: p.id, code: `${code.slice(3)}-${new Date().getFullYear()}-${String(n).padStart(2, "0")}`, qtyIn: q, qtyOnHand: q, unitCost: cost * (n === 1 ? 0.98 : 1.02), receivedAt: inDays(-90 + n * 25), expiryDate: shelf ? inDays(Math.round(shelf * 0.35 * n)) : n === 1 ? inDays(25) : inDays(400), supplierId: suppliers[n % suppliers.length].id, supplierRef: `INV-${1000 + n * 7}` },
        });
      }
    }
  }
  // An expired lot to exercise the expiry rules/report
  await db.batch.create({ data: { productId: prod["RM-ALLOY"].id, code: "ALLOY-OLD-01", qtyIn: 4, qtyOnHand: 4, unitCost: 36, receivedAt: inDays(-900), expiryDate: inDays(-20), supplierId: suppliers[3].id } });
  await db.product.update({ where: { id: prod["RM-ALLOY"].id }, data: { qtyOnHand: { increment: 4 } } });

  const fg: [string, string, string][] = [["AC-SPL-12", "Split AC 12,000 BTU Inverter", "SPL12"], ["AC-SPL-18", "Split AC 18,000 BTU Inverter", "SPL18"], ["AC-SPL-24", "Split AC 24,000 BTU Inverter", "SPL24"], ["AC-WIN-12", "Window AC 12,000 BTU", "WIN12"]];
  for (const [code, name] of fg) prod[code] = await db.product.create({ data: { code, name, kind: "FINISHED", categoryId: cat["Finished goods"], uom: "PCS", serialBase: true, requireBatch: true, minStock: 5, barcode: `62901${String(Math.abs(code.length * 98765)).padStart(7, "0")}` } });

  // ── Production lines ─────────────────────────────────────────
  const L1 = await db.productionLine.create({ data: { code: "LN-SPL1", name: "Split line 1", description: "Main split-unit assembly line", branchId: mp.id, rawStoreId: st.RM1.id, fgStoreId: st.FG1.id, capacity: 40 } });
  const L2 = await db.productionLine.create({ data: { code: "LN-SPL2", name: "Split line 2", branchId: mp.id, rawStoreId: st.RM2.id, fgStoreId: st.FG1.id, capacity: 30 } });
  const L3 = await db.productionLine.create({ data: { code: "LN-WIN", name: "Window unit line", branchId: annex.id, rawStoreId: st.RM3.id, fgStoreId: st.FG2.id, capacity: 25 } });
  await db.lineProduct.createMany({ data: [
    { lineId: L1.id, productId: prod["AC-SPL-12"].id }, { lineId: L1.id, productId: prod["AC-SPL-18"].id }, { lineId: L2.id, productId: prod["AC-SPL-18"].id }, { lineId: L2.id, productId: prod["AC-SPL-24"].id }, { lineId: L3.id, productId: prod["AC-WIN-12"].id },
  ] });
  await db.lineAsset.createMany({ data: [...Object.values(A)].map((a) => ({ lineId: L1.id, assetId: a.id })).concat(["BND", "BRZ", "VAC", "CHG", "LKT", "RUN"].map((c) => ({ lineId: L2.id, assetId: A[c].id }))) });

  // ── Team ─────────────────────────────────────────────────────
  type M = [no: string, name: string, pos: string, rate: number, line: number, ops: string[], leader?: boolean, qc?: boolean, hold?: boolean];
  const team: M[] = [
    ["E-1001", "Omar Haddad", "Line supervisor", 14, L1.id, ["CUT", "BND", "BRZ", "ASM", "VAC", "CHG", "LKT", "ELT", "PCK"], true], ["E-1002", "Sami Nasser", "Press operator", 9, L1.id, ["CUT", "BND"]],
    ["E-1003", "Nabil Farah", "Press operator", 9, L1.id, ["CUT", "BND"]], ["E-1004", "Layla Qasem", "Brazing technician", 12, L1.id, ["BRZ", "ASM"]], ["E-1005", "Tariq Hijazi", "Brazing technician", 12, L1.id, ["BRZ"]],
    ["E-1006", "Khaled Aziz", "Assembler", 9.5, L1.id, ["ASM", "PCK"]], ["E-1007", "Rana Saleh", "Gas technician", 12.5, L1.id, ["VAC", "CHG"]], ["E-1008", "Yousef Barakat", "Test technician", 12, L1.id, ["LKT", "ELT"], false, true],
    ["E-1009", "Dina Mansour", "QC inspector", 13, L1.id, ["LKT", "ELT"], false, true], ["E-1010", "Hala Odeh", "Packer", 8, L1.id, ["PCK"]], ["E-1011", "Maya Khoury", "Test technician", 12, L2.id, ["ELT", "LKT"], false, true], ["E-1012", "Fadi Rahman", "Holding-area clerk", 8.5, L1.id, ["PCK"], false, false, true],
  ];
  const mem: Record<string, { id: number; ops: string[] }> = {};
  for (const [no, name, pos, rate, line, ops, leader, qc, hold] of team) {
    const m = await db.teamMember.create({ data: { employeeNo: no, name, position: pos, hourRate: rate, lineId: line, defaultOpId: O[ops[0]].id, isLeader: !!leader, canQc: !!qc, canHold: !!hold, phone: `+962 79 ${Math.floor(1000000 + Math.random() * 8999999)}`, allowedOps: { create: ops.map((o) => ({ operationId: O[o].id })) } } });
    mem[no] = { id: m.id, ops };
  }
  await db.reason.createMany({ data: [
    { name: "Order completed", kind: "CLOSE" }, { name: "Customer cancelled", kind: "CLOSE" }, { name: "Quantity reduced", kind: "CLOSE" },
    { name: "Material unavailable", kind: "SUSPEND" }, { name: "Machine breakdown", kind: "SUSPEND" }, { name: "Awaiting customer approval", kind: "SUSPEND" },
    { name: "Brazing defect", kind: "SCRAP" }, { name: "Leak — not repairable", kind: "SCRAP" }, { name: "Stock count difference", kind: "ADJUST" }, { name: "Damaged in handling", kind: "ADJUST" },
  ] });

  // ── BOMs ─────────────────────────────────────────────────────
  type Spec = { code: string; name: string; model: string; refrigerant: string; voltage: string; cmp: string; gas: string; gasKg: number; gasG: [number, number]; cu: [string, number][]; steel: number; fin: number; hrs: number; isDefault?: boolean; window?: boolean };
  const specs: Spec[] = [
    { code: "AC-SPL-12", name: "Split 12K — standard", model: "SPL12", refrigerant: "R410A", voltage: "220V/50Hz", cmp: "RM-CMP-12", gas: "RM-GAS-410", gasKg: 0.85, gasG: [800, 900], cu: [["RM-CU-14", 5], ["RM-CU-38", 5]], steel: 6.5, fin: 1.6, hrs: 1, isDefault: true },
    { code: "AC-SPL-12", name: "Split 12K — value (v2)", model: "SPL12", refrigerant: "R410A", voltage: "220V/50Hz", cmp: "RM-CMP-12", gas: "RM-GAS-410", gasKg: 0.8, gasG: [750, 850], cu: [["RM-CU-14", 4.6], ["RM-CU-38", 4.6]], steel: 6, fin: 1.5, hrs: 0.92 },
    { code: "AC-SPL-18", name: "Split 18K — standard", model: "SPL18", refrigerant: "R32", voltage: "220V/50Hz", cmp: "RM-CMP-18", gas: "RM-GAS-32", gasKg: 1.1, gasG: [1050, 1150], cu: [["RM-CU-14", 6], ["RM-CU-12", 6]], steel: 8.5, fin: 2.4, hrs: 1.25, isDefault: true },
    { code: "AC-SPL-24", name: "Split 24K — standard", model: "SPL24", refrigerant: "R32", voltage: "380V/50Hz", cmp: "RM-CMP-24", gas: "RM-GAS-32", gasKg: 1.55, gasG: [1480, 1620], cu: [["RM-CU-38", 7], ["RM-CU-58", 7]], steel: 11, fin: 3.2, hrs: 1.6, isDefault: true },
    { code: "AC-WIN-12", name: "Window 12K — standard", model: "WIN12", refrigerant: "R410A", voltage: "220V/50Hz", cmp: "RM-CMP-12", gas: "RM-GAS-410", gasKg: 0.62, gasG: [580, 660], cu: [["RM-CU-14", 2.2], ["RM-CU-38", 2.2]], steel: 9, fin: 1.2, hrs: 0.9, isDefault: true, window: true },
  ];
  const boms: Record<string, number> = {};
  for (const s of specs) {
    const mats: { productId: number; qty: number; qtyType: "RATIO" | "FIXED"; wastePct: number; essential: boolean }[] = [
      { productId: prod[s.cmp].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true },
      ...s.cu.map(([c, q]) => ({ productId: prod[c].id, qty: q, qtyType: "RATIO" as const, wastePct: 4, essential: true })),
      { productId: prod["RM-AL-FIN"].id, qty: s.fin, qtyType: "RATIO", wastePct: 3, essential: true }, { productId: prod["RM-STL-SHT"].id, qty: s.steel, qtyType: "RATIO", wastePct: 6, essential: true },
      { productId: prod[s.gas].id, qty: s.gasKg, qtyType: "RATIO", wastePct: 3, essential: true }, { productId: prod["RM-ALLOY"].id, qty: 0.03, qtyType: "RATIO", wastePct: 5, essential: true },
      { productId: prod["RM-N2"].id, qty: 0.05, qtyType: "RATIO", wastePct: 0, essential: false },
      { productId: prod["RM-MTR-ODF"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true }, { productId: prod["RM-FAN-AX"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true },
      { productId: prod["RM-PCB-ODU"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true }, { productId: prod["RM-CAP"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true },
      { productId: prod["RM-WIRE"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true }, { productId: prod["RM-SCRW"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: false },
      { productId: prod["RM-PKG-BOX"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true }, { productId: prod["RM-PKG-FOM"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true }, { productId: prod["RM-MAN"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: false },
    ];
    if (!s.window) mats.push(
      { productId: prod["RM-PLS-ABS"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true }, { productId: prod["RM-MTR-IDF"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true },
      { productId: prod["RM-FAN-CF"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true }, { productId: prod["RM-PCB-IDU"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true },
      { productId: prod["RM-RMT"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true }, { productId: prod["RM-VLV-4W"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true },
      { productId: prod["RM-EXV"].id, qty: 1, qtyType: "RATIO", wastePct: 0, essential: true }, { productId: prod["RM-INS"].id, qty: 1.2, qtyType: "RATIO", wastePct: 2, essential: false },
    );
    const h = s.hrs;
    const ops: { op: string; hours: number; cost: number; qc?: string; sub?: string[]; assets: [string, number][]; reads?: { p: string; min: number; max: number; mand: boolean }[]; exp?: [string, number][] }[] = [
      { op: "CUT", hours: 0.35 * h, cost: 11, sub: ["Deburring", "Cleaning"], assets: [["PRS", 0.2], ["FIN", 0.15]], exp: [["CON", 0.4]] },
      { op: "BND", hours: 0.4 * h, cost: 11, sub: ["Flaring"], assets: [["BND", 0.35]] },
      { op: "BRZ", hours: 0.6 * h, cost: 12, qc: "BRZ", sub: ["Nitrogen purge", "Visual inspection"], assets: [["BRZ", 0.55]], exp: [["CON", 0.9]] },
      { op: "ASM", hours: 0.9 * h, cost: 10, assets: [["CNV", 0.9]] },
      { op: "VAC", hours: 0.25, cost: 12.5, sub: ["Evacuation"], assets: [["VAC", 0.25]], reads: [{ p: "VAC", min: 0, max: 500, mand: true }] },
      { op: "CHG", hours: 0.2, cost: 12.5, assets: [["CHG", 0.2]], reads: [{ p: "CHG", min: s.gasG[0], max: s.gasG[1], mand: true }] },
      { op: "LKT", hours: 0.3, cost: 12, qc: "LKT", assets: [["LKT", 0.3]] },
      { op: "ELT", hours: 0.5, cost: 12, qc: "ELT", assets: [["RUN", 0.5]], exp: [["ELC", 1.2]], reads: [{ p: "CUR", min: 3, max: s.window ? 6.5 : 7.5, mand: true }, { p: "VLT", min: 200, max: 240, mand: false }, { p: "SUC", min: 100, max: 135, mand: false }] },
      { op: "PCK", hours: 0.25, cost: 8, qc: "PCK", sub: ["Labeling"], assets: [["LBL", 0.1]] },
    ];
    const b = await db.bom.create({
      data: {
        name: s.name, productId: prod[s.code].id, outputQty: 1, durationHrs: ops.reduce((a, o) => a + o.hours, 0), isDefault: !!s.isDefault, serialBase: true, prodLevelQc: true,
        model: s.model, refrigerant: s.refrigerant, voltage: s.voltage, remark: s.window ? "Window type — no indoor unit" : "Indoor + outdoor unit",
        materials: { create: mats },
        operations: {
          create: ops.map((o, i) => ({
            operationId: O[o.op].id, seq: i + 1, hours: Math.round(o.hours * 100) / 100, hoursType: "RATIO" as const, costPerHour: o.cost, qcTemplateId: o.qc ? qcT[o.qc as keyof typeof qcT].id : null, qcMandatory: !!o.qc,
            subs: { create: (o.sub ?? []).map((n) => ({ subProcessId: SP[n].id })) }, assets: { create: o.assets.map(([c, hrs]) => ({ assetId: A[c].id, hours: hrs })) },
            readings: { create: (o.reads ?? []).map((r) => ({ parameterId: P[r.p].id, min: r.min, max: r.max, mandatory: r.mand })) },
            expenses: { create: (o.exp ?? []).map(([c, amt]) => ({ expenseTypeId: X[c].id, amount: amt, amountType: "RATIO" as const })) },
          })),
        },
      },
    });
    boms[s.name] = b.id;
  }
  void serialFor;

  // ── Execution helpers (same lib the UI uses) ─────────────────
  async function consumeFraction(orderId: number, frac: number) {
    const mats = await db.poMaterial.findMany({ where: { orderId }, include: { product: true } });
    for (const m of mats) {
      let need = Math.round(m.plannedQty * frac * 1000) / 1000;
      if (need <= 0) continue;
      if (m.product.requireBatch) {
        const batches = await db.batch.findMany({ where: { productId: m.productId, qtyOnHand: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] }, orderBy: [{ expiryDate: "asc" }, { id: "asc" }] });
        for (const b of batches) {
          if (need <= 0) break;
          const take = Math.min(b.qtyOnHand, need);
          await consumeMaterial({ orderId, productId: m.productId, qty: take, batchId: b.id });
          need -= take;
        }
        if (need > 1e-9) throw new Error(`Seed: not enough batch stock for ${m.product.code}`);
      } else await consumeMaterial({ orderId, productId: m.productId, qty: need });
    }
  }
  const memberFor = (opCode: string, i: number) => { const c = Object.values(mem).filter((m) => m.ops.includes(opCode)); return c[i % c.length].id; };
  const opCodeById = Object.fromEntries(Object.entries(O).map(([c, o]) => [o.id, c]));
  const equipFor = async (stepId: number, bomOpId: number) => {
    for (const a of await db.bomOpAsset.findMany({ where: { bomOpId } })) await logEquipment({ stepId, assetId: a.assetId, minutes: Math.max(5, Math.round(a.hours * 60)) });
  };
  /** Walk a unit through its first `n` operations (all if omitted). */
  async function advance(unitId: number, n = 99, failQcAt?: "HOLD" | "SCRAP", i = 0) {
    const steps = await db.productionStep.findMany({ where: { unitId }, include: { bomOp: { include: { readings: true } } }, orderBy: { bomOp: { seq: "asc" } } });
    let k = 0;
    for (const s of steps) {
      if (k++ >= n) break;
      const code = opCodeById[s.bomOp.operationId];
      await logTime({ stepId: s.id, memberId: memberFor(code, i), minutes: Math.round(s.bomOp.hours * 60 * (0.85 + Math.random() * 0.4)) });
      await equipFor(s.id, s.bomOpId);
      for (const r of s.bomOp.readings) await recordReading({ stepId: s.id, parameterId: r.parameterId, value: r.max > r.min ? Math.round((r.min + (r.max - r.min) * (0.35 + Math.random() * 0.3)) * 10) / 10 : 1 });
      await completeStep(s.id);
      const cur = await db.productionStep.findUniqueOrThrow({ where: { id: s.id } });
      if (cur.status === "VERIFY") await verifyStep(s.id);
      const now = await db.productionStep.findUniqueOrThrow({ where: { id: s.id } });
      if (now.status === "QC_PENDING") {
        if (failQcAt && code === "LKT") { await recordQc({ stepId: s.id, result: "FAIL", failAction: failQcAt, remark: failQcAt === "HOLD" ? "Slow pressure decay at suction joint" : "Cracked brazed joint" }); return; }
        await recordQc({ stepId: s.id, result: "PASS" });
      }
    }
  }
  const unitsOf = (orderId: number) => db.productionUnit.findMany({ where: { orderId }, orderBy: { id: "asc" } });

  // ── Orders in all lifecycle stages ───────────────────────────
  // 1) CLOSED: AC-SPL-12 × 10, fully produced
  const o1 = await createOrder({ bomId: boms["Split 12K — standard"], qty: 10, lineId: L1.id, plannedStart: inDays(-30), plannedEnd: inDays(-18), priority: 2, remark: "Stock replenishment — retail" });
  await releaseOrder(o1.id); await consumeFraction(o1.id, 1);
  let i = 0; for (const u of await unitsOf(o1.id)) await advance(u.id, 99, undefined, i++);
  await receiveFinished(o1.id); await addExpense({ orderId: o1.id, name: "Extra test-bench electricity", amount: 18.5, expenseTypeId: X.ELC.id }); await closeOrder(o1.id, "Order completed");

  // 2) RELEASED: AC-SPL-18 × 12 — 5 delivered, others at different stages, 1 held by QC
  const o2 = await createOrder({ bomId: boms["Split 18K — standard"], qty: 12, lineId: L1.id, plannedStart: inDays(-8), plannedEnd: inDays(4), priority: 1, remark: "CoolHouse retail — spring promo" });
  await releaseOrder(o2.id); await consumeFraction(o2.id, 1);
  const u2 = await unitsOf(o2.id);
  for (let k = 0; k < 5; k++) await advance(u2[k].id, 99, undefined, k);
  await receiveFinished(o2.id);
  await advance(u2[5].id, 99, undefined, 5);            // finished, awaiting receipt
  await advance(u2[6].id, 99, undefined, 6);
  await advance(u2[7].id, 7, undefined, 7);              // stops at leak test → QC pending
  await advance(u2[8].id, 7, "HOLD", 8);                 // failed leak test → holding area
  await advance(u2[9].id, 4, undefined, 9);
  await advance(u2[10].id, 2, undefined, 10);
  const hold = await db.productionUnit.findFirstOrThrow({ where: { orderId: o2.id, status: "HOLDING" } });
  await db.repairLog.create({ data: { orderId: o2.id, unitId: hold.id, issue: "Slow pressure decay at suction joint — re-braze required", status: "OPEN" } });

  // 3) RELEASED: AC-SPL-24 × 8 — just started, materials partly issued
  const o3 = await createOrder({ bomId: boms["Split 24K — standard"], qty: 8, lineId: L2.id, plannedStart: inDays(-2), plannedEnd: inDays(10), priority: 2, remark: "Petra Hotels — project phase 1" });
  await releaseOrder(o3.id); await consumeFraction(o3.id, 0.4);
  const u3 = await unitsOf(o3.id); await advance(u3[0].id, 3, undefined, 0); await advance(u3[1].id, 1, undefined, 1);

  // 4) RELEASED & OVERDUE: window unit × 20
  const o4 = await createOrder({ bomId: boms["Window 12K — standard"], qty: 20, lineId: L3.id, plannedStart: inDays(-20), plannedEnd: inDays(-3), priority: 1, remark: "Export order — Gulf distributor" });
  await releaseOrder(o4.id); await consumeFraction(o4.id, 1);
  const u4 = await unitsOf(o4.id); for (let k = 0; k < 6; k++) await advance(u4[k].id, 99, undefined, k);
  await receiveFinished(o4.id);

  // 5) SUSPENDED
  const o5 = await createOrder({ bomId: boms["Split 12K — value (v2)"], qty: 6, lineId: L2.id, plannedStart: inDays(-5), plannedEnd: inDays(7), remark: "Trial of the value BOM" });
  await releaseOrder(o5.id); await consumeFraction(o5.id, 0.3); await setSuspended(o5.id, true);

  // 6) Drafts
  await createOrder({ bomId: boms["Split 12K — standard"], qty: 40, lineId: L1.id, plannedEnd: inDays(21), priority: 2, remark: "Q3 forecast build" });
  await createOrder({ bomId: boms["Split 24K — standard"], qty: 15, lineId: L2.id, plannedEnd: inDays(28), priority: 3 });

  // ── Requests ─────────────────────────────────────────────────
  const clients = await db.client.findMany();
  const rq = async (bom: string, productCode: string, qty: number, due: number, c: number, ref: string, status: "NEW" | "REJECTED", pri = 2) => {
    const n = await db.productionRequest.count();
    await db.productionRequest.create({ data: { no: `PR-${String(n + 1).padStart(6, "0")}`, productId: prod[productCode].id, bomId: boms[bom], qty, dueDate: inDays(due), clientId: clients[c].id, salesRef: ref, status, priority: pri } });
  };
  await rq("Split 18K — standard", "AC-SPL-18", 30, 14, 0, "SO-2026-0412", "NEW", 1);
  await rq("Split 12K — standard", "AC-SPL-12", 60, 21, 1, "SO-2026-0418", "NEW");
  await rq("Split 24K — standard", "AC-SPL-24", 12, 18, 3, "SO-2026-0421", "NEW", 1);
  await rq("Window 12K — standard", "AC-WIN-12", 25, 30, 4, "SO-2026-0399", "REJECTED", 3);

  // ── Purchasing ───────────────────────────────────────────────
  await createPurchaseRequest({ productId: prod["RM-CMP-24"].id, qty: 40, supplierId: suppliers[0].id, remark: "Below minimum — hotel project" });
  await createPurchaseRequest({ productId: prod["RM-GAS-32"].id, qty: 200, supplierId: suppliers[3].id, remark: "R32 running low" });

  // Settings
  await db.setting.createMany({ data: [{ key: "mustConsumeAllEssential", value: "1" }, { key: "autoAcceptRequests", value: "0" }, { key: "nearDeliveryDays", value: "7" }, { key: "workingHoursPerDay", value: "7" }, { key: "workingDaysPerWeek", value: "6" }] });

  const counts = { products: await db.product.count(), batches: await db.batch.count(), boms: await db.bom.count(), orders: await db.productionOrder.count(), units: await db.productionUnit.count(), steps: await db.productionStep.count() };
  console.log("Seeded:", counts);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());

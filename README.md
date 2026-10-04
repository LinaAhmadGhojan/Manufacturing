# MFP — Manufacturing from Raw Materials

A full manufacturing-execution module built with **Next.js 16, TypeScript, Prisma and Tailwind**: from *bill of materials* to *production request*, *production order*, *shop-floor execution* (batch & serial tracked), *quality control*, *finished-goods receipt*, *costing*, *reports* and *barcode labels*.

It is a clean, standalone re-implementation of the ideas of a legacy Laravel ERP manufacturing module — with real foreign keys, enums instead of magic status characters, atomic transactions and an automated integrity test-suite.

> The demo data is an **air-conditioner factory** (split & window units): compressors, copper tube, refrigerant gas, PCBs, brazing, vacuum, gas charging, leak and run tests.

![Dashboard](docs/screenshots/01-dashboard.png)

---

## Contents

- [Features](#features)
- [How it works — the production lifecycle](#how-it-works--the-production-lifecycle)
- [Screenshots](#screenshots)
- [Batch & serial traceability](#batch--serial-traceability)
- [Costing](#costing)
- [Data model](#data-model)
- [Getting started](#getting-started)
- [Testing](#testing)
- [Project structure](#project-structure)
- [Design decisions](#design-decisions)
- [Roadmap](#roadmap)
- [الشرح بالعربي](#الشرح-بالعربي)

---

## Features

| Area | What you get |
|---|---|
| **Dashboard** | KPIs, order/unit status donuts, production-line load vs capacity, raw material on-hand vs committed, delivery watch (overdue / due soon), technicians' minutes today, cost vs plan. |
| **Master data (16 entities)** | Products, categories, units, suppliers, clients, branches, stores, equipment, operations, sub-processes, reading parameters, production lines (with allowed products & equipment), QC templates, team (hour rate, allowed operations, roles), expense types, reasons. Every entity has a data grid (search, sort, filters, pagination) and add / edit / delete forms with validation and safe-delete protection. |
| **Bill of materials** | Raw materials (fixed or ratio, waste %, essential flag), ordered operations, and per-operation sub-processes, equipment hours, expenses, readings (min–max, mandatory) and QC template. Live cost estimate, copy-as-new-version, default BOM per product. A BOM used by orders is locked. |
| **Production requests** | Demand from sales (client, sales ref, priority, due date) → accept (creates and optionally releases an order) or reject. Auto-accept rule available. |
| **Production orders** | Plan calculated from the BOM (materials, labour, equipment, expenses), edit while draft, release → serials + commitment, suspend / resume, close. Add or remove extra materials. 8 tabs: overview, materials, serials, manpower & equipment, readings, expenses, receive & close, stock ledger. |
| **Shop floor** | Per serial × operation: capture readings, log labour (only employees allowed on that operation), log equipment, complete operations **strictly in sequence**. |
| **Quality control** | Inspection queue per operation with template check points; on failure choose *return to technician*, *holding area* or *scrap*. |
| **Supervisor** | Verify operations, holding area, repair log (report → fix → approve returns the unit to production). |
| **Inventory** | Stock with min / reorder levels, batches with expiry, movement ledger, purchase requests (raise directly from an order shortage), receive stock (weighted-average cost), adjustments. |
| **Traceability** | Serial → material batches it was built from; batch → every unit it went into (recall use-case); production lot → delivered serials. |
| **Labels** | Code 128 barcodes — serial labels (per unit or whole order), raw-material batch labels, finished-goods lot labels. A4 sheet or 100×60 mm thermal. |
| **Reports** | Production planning, material utilisation, shortage, cost analysis, manpower, batches & expiry, serial status. |
| **Rules** | Behaviour switches (must consume essential materials before completing an operation, auto-accept requests, working hours…). |

---

## How it works — the production lifecycle

```mermaid
flowchart LR
  BOM[Bill of materials] --> PR[Production request]
  PR -- accept --> PO[Production order<br/>DRAFT]
  PO -- release --> REL[RELEASED<br/>serials generated<br/>materials committed]
  REL --> EXEC
  EXEC --> RCV[Receive finished goods<br/>into a production lot]
  RCV --> CLS[Close order<br/>commitment released]
  REL -. suspend .-> SUS[SUSPENDED] -. resume .-> REL

  subgraph EXEC [Execution per serial × operation]
    direction LR
    A[Issue materials<br/>by batch] --> B[Readings · time · equipment]
    B --> C[Complete operation]
    C --> D{verify?}
    D -- yes --> V[Supervisor verifies]
    D -- no --> E
    V --> E{QC mandatory?}
    E -- yes --> Q[QC inspection]
    E -- no --> DONE[DONE]
    Q -- pass --> DONE
    Q -- fail --> F[return · holding · scrap]
  end
```

**Operation (step) status:** `PENDING → IN_PROGRESS → (VERIFY) → (QC_PENDING) → DONE`, or `HOLDING` / `SCRAP` after a failed inspection. A unit's status is derived from its steps; a unit is receivable when every step is `DONE`.

**Receiving rule:** receivable quantity is limited by the scarcest **essential ratio material** that has actually been consumed, and — for serial products — by units that finished all operations.

---

## Screenshots

### Master data & BOM

| | |
|---|---|
| ![Products](docs/screenshots/02-products-grid.png) **Products grid** — search, filters, sort, paging, stock warnings | ![Product form](docs/screenshots/03-product-form.png) **Product form** — sections, tracking flags |
| ![Production line](docs/screenshots/04-production-line-form.png) **Production line** — stores, capacity, products & equipment | ![QC template](docs/screenshots/05-qc-template-form.png) **QC template** — check points with criteria |
| ![BOM list](docs/screenshots/06-bom-list.png) **BOM list** — estimated cost per unit | ![BOM editor](docs/screenshots/07-bom-editor.png) **BOM editor** — operations with sub-processes, equipment, expenses, readings |

### Requests, orders & execution

| | |
|---|---|
| ![Requests](docs/screenshots/08-production-requests.png) **Production requests** | ![Orders](docs/screenshots/09-production-orders.png) **Production orders** |
| ![Order overview](docs/screenshots/10-order-overview.png) **Order overview** — routing with sub-processes, equipment, QC and readings | ![Materials](docs/screenshots/11-order-materials.png) **Materials** — issue by batch, shortage → purchase request |
| ![Serials](docs/screenshots/12-order-serials.png) **Serials × operations** | ![Receive](docs/screenshots/13-order-receive.png) **Receive & close** |
| ![Shop floor](docs/screenshots/14-shop-floor.png) **Shop floor** — readings, time, equipment | ![QC](docs/screenshots/15-quality-control.png) **Quality control** |

![Supervisor](docs/screenshots/16-supervisor.png)
*Supervisor — verification queue, holding area, repair log.*

### Inventory, traceability & labels

| | |
|---|---|
| ![Stock](docs/screenshots/17-inventory-stock.png) **Stock** | ![Batches](docs/screenshots/18-inventory-batches.png) **Batches & expiry** |
| ![Trace serial](docs/screenshots/19-trace-serial.png) **Trace a serial** — operations, readings, material batches | ![Trace batch](docs/screenshots/20-trace-batch.png) **Trace a lot / batch** — which units it reached |
| ![Labels hub](docs/screenshots/21-labels-hub.png) **Labels hub** | ![Serial labels](docs/screenshots/22-serial-labels.png) **Serial labels** — Code 128 |

![Batch labels](docs/screenshots/23-batch-labels.png)

### Reports & settings

| | |
|---|---|
| ![Cost](docs/screenshots/24-report-cost.png) **Cost analysis** | ![Batches report](docs/screenshots/25-report-batches.png) **Batches & expiry** |
| ![Planning](docs/screenshots/26-report-planning.png) **Production planning** | ![Settings](docs/screenshots/27-settings.png) **Rules & settings** |

---

## Batch & serial traceability

* **Serial tracked** finished goods get one serial per unit when the order is released: `<model><YYMM>-<order>-<seq>` e.g. `SPL122610-0002-0007`.
* **Batch tracked** materials (compressors, PCBs, refrigerant, brazing alloy…) must be issued **from a named batch**. The system enforces: right product, enough quantity in the batch, **not expired**, and suggests first-expired-first-out.
* Receiving finished goods creates / tops-up a **production lot** (`LOT-PO-…`) so finished stock is batch-tracked too.
* Invariant guaranteed by the test-suite: *product stock = Σ batch stock*, and *order material cost = Σ consumptions*.

## Costing

```
planned material  = Σ  qty × (1 + waste%) × avg cost               (ratio qty scales with order qty ÷ BOM output)
planned resources = Σ  operation hours × labour rate  +  Σ equipment hours × equipment rate
planned expenses  = Σ  operation expenses (per-unit or fixed)

actual material   = Σ  issued qty × batch unit cost
actual resources  = Σ  logged minutes × employee rate  +  equipment minutes × equipment rate
actual expenses   = Σ  manual expenses on the order

unit cost on receipt = (actual material + resources + expenses) ÷ produced qty
finished product avg cost = weighted average of previous stock and the new lot
```

## Data model

```mermaid
erDiagram
  PRODUCT ||--o{ BOM : "is made by"
  BOM ||--|{ BOM_MATERIAL : contains
  BOM ||--|{ BOM_OPERATION : routes
  BOM_OPERATION ||--o{ BOM_OP_ASSET : uses
  BOM_OPERATION ||--o{ BOM_OP_READING : measures
  BOM_OPERATION ||--o{ BOM_OP_EXPENSE : costs
  BOM_OPERATION }o--o| QC_TEMPLATE : inspected-by
  PRODUCTION_REQUEST }o--|| BOM : requests
  PRODUCTION_REQUEST |o--o| PRODUCTION_ORDER : becomes
  PRODUCTION_ORDER ||--|{ PO_MATERIAL : "snapshots"
  PRODUCTION_ORDER ||--o{ PRODUCTION_UNIT : "serials / batch"
  PRODUCTION_UNIT ||--|{ PRODUCTION_STEP : "unit × operation"
  PRODUCTION_STEP ||--o{ TIME_ENTRY : labour
  PRODUCTION_STEP ||--o{ EQUIPMENT_ENTRY : equipment
  PRODUCTION_STEP ||--o{ READING_ENTRY : readings
  PRODUCTION_UNIT ||--o{ QC_CHECK : inspected
  PRODUCTION_ORDER ||--o{ CONSUMPTION : issues
  BATCH ||--o{ CONSUMPTION : "consumed from"
  PRODUCT ||--o{ BATCH : "lots of"
  PRODUCT ||--o{ STOCK_MOVE : ledger
```

All tables, relations and enums are in [`prisma/schema.prisma`](prisma/schema.prisma). A snapshot of BOM materials is copied into each order so later BOM changes never rewrite history.

---

## Getting started

Requirements: **Node.js 20+**.

```bash
npm install
cp .env.example .env          # DATABASE_URL="file:./dev.db" (SQLite)
npx prisma db push            # create the database
npm run seed                  # realistic demo data (also drives sample orders through the real workflow)
npm run dev                   # http://localhost:3000
```

| Script | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build |
| `npm run seed` | Wipe & recreate the demo data set |
| `npm test` | Unit tests (BOM math, Code 128, numbering) |
| `npm run e2e` | End-to-end lifecycle & integrity checks against the dev database |
| `node scripts/screenshots.mjs` | Regenerate `docs/screenshots` (uses the locally installed Edge/Chrome) |

To use PostgreSQL instead of SQLite change the `provider` and `DATABASE_URL` in `prisma/schema.prisma` / `.env`.

## Testing

`npm test` runs pure unit tests; `npm run e2e` runs ~80 checks against the database, including:

* a completed order cannot be edited or consumed; operations must run in sequence;
* essential materials must be consumed before completing an operation; mandatory readings required;
* employees can only work on operations they are allowed on;
* batch rules (required, wrong product, expired, insufficient);
* receipts create production lots; weighted-average cost; expenses add / reverse cost;
* **integrity invariants** across the whole database (stock = Σ batches, cost = Σ consumptions, no negative stock).

## Project structure

```
prisma/            schema.prisma · seed.ts (realistic AC-factory data)
scripts/           e2e.ts · screenshots.mjs
src/lib/           domain logic — bom.ts (pure math) · po.ts (orders) · exec.ts (execution)
                   inventory.ts · crud.ts (entity config) · code128.ts · numbering.ts · settings.ts
src/components/    ui kit · Sidebar · EntityForm · Barcode · Label
src/app/           dashboard, master/[entity] (generic CRUD), boms, requests, orders,
                   shop-floor, qc, supervisor, inventory, trace, labels, reports, settings
docs/screenshots/  images used in this README
```

## Design decisions

* **Domain logic lives in `src/lib`**, not in pages or controllers. Every mutation (`consumeMaterial`, `completeStep`, `receiveFinished`, …) runs in **one database transaction** and re-checks its rules.
* **Config-driven CRUD**: one entity definition (`src/lib/crud.ts`) drives the grid, form, validation, many-to-many and child-line editing.
* **Plan vs actual are separate**: orders snapshot BOM materials; actual costs are summed from ledgers.
* **Race-safe numbering**: document and serial numbers derive from the order number, not `max(id)`.
* **Improvements over the legacy module**: typed enums instead of single-letter status codes, real foreign keys, expense costs tracked separately, edit-while-draft orders, batch/expiry enforcement and an integrity test-suite.

## Roadmap

- [ ] Arabic / RTL interface
- [ ] Users, roles & permissions (technician / supervisor / manager) and sign-in
- [ ] PDF export for labels and reports
- [ ] Per-store stock (currently stock is per product + batch)
- [ ] Integration with purchasing / accounting / sales order modules

---

## الشرح بالعربي

**MFP** نظام تصنيع من المواد الخام إلى المنتج النهائي، مبني بـ **Next.js وPrisma**، ومستوحى من موديول التصنيع في نظام ERP قديم (Laravel) مع تحسينات في التصميم.

**الدورة الكاملة:**
1. **قائمة المواد (BOM):** المواد الخام (ثابتة أو نسبية مع نسبة هدر)، والعمليات بالترتيب، ولكل عملية: عمليات فرعية، معدات، مصاريف، قراءات (حدّ أدنى/أعلى)، وقالب جودة.
2. **طلب الإنتاج:** من المبيعات (عميل، أولوية، تاريخ)، ثم قبول يحوّله إلى أمر إنتاج أو رفض.
3. **أمر الإنتاج:** تُحسب الخطة من الـ BOM (مواد، عمالة، معدات، مصاريف)، وعند الإطلاق تُولَّد الـ **Serials** وتُحجز المواد.
4. **التنفيذ على الأرض:** صرف المواد **بحسب الدفعة (Batch)** مع منع المنتهية الصلاحية، وتسجيل القراءات ووقت العمال والمعدات، وإكمال العمليات **بالتسلسل**.
5. **الجودة والمشرف:** فحص الجودة (نجاح/فشل → إعادة للفني أو منطقة الحجز أو إتلاف)، وتحقق المشرف، وسجل الإصلاح.
6. **الاستلام والإغلاق:** استلام المنتج النهائي في **لوت إنتاج**، وحساب تكلفة الوحدة الفعلية، ثم إغلاق الأمر.

**التتبّع واللصاقات:** يمكن تتبّع أي Serial وصولاً إلى دفعات المواد التي صُنع منها، وتتبّع أي دفعة إلى كل الوحدات التي دخلت فيها (مفيد للاستدعاء)، وطباعة لصاقات باركود (Code 128) للـ Serial ودفعات المواد ولوت المنتج النهائي بصيغة A4 أو طابعة حرارية.

**الشاشات:** لوحة تحكم، 16 كياناً للماستر داتا (إضافة/تعديل/حذف مع بحث وترتيب وفلاتر)، محرر BOM، طلبات، أوامر، شاشة المصنع، الجودة، المشرف، المخزون (دفعات وانتهاء صلاحية وطلبات شراء)، التتبّع، اللصاقات، التقارير، والقواعد.

**التشغيل:** `npm install` ثم `cp .env.example .env` ثم `npx prisma db push` ثم `npm run seed` ثم `npm run dev`.

**الاختبارات:** `npm test` للوحدات و`npm run e2e` لنحو 80 فحصاً شاملاً تشمل سلامة البيانات (رصيد المنتج = مجموع الدفعات، وتكلفة الأمر = مجموع الصرف).

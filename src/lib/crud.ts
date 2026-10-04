// Config-driven master-data CRUD: one definition per entity drives the
// data grid (search/sort/filter/paginate), the form, and save/delete.

export type FieldType = "text" | "number" | "bool" | "textarea" | "date" | "select" | "ref" | "multi" | "lines";

export interface Field {
  name: string;
  label: string;
  type: FieldType;
  section?: string;
  required?: boolean;
  def?: string | number | boolean | null;
  help?: string;
  options?: string[]; // select
  ref?: string; // lookup key for ref / multi
  refValue?: "id" | "code"; // what a ref stores (default id)
  createOnly?: boolean; // editable only when creating (e.g. opening stock)
  /** multi: many-to-many through a join model */
  multi?: { join: string; own: string; other: string; rel: string };
  /** lines: child rows edited as textarea, one per line */
  lines?: { model: string; own: string; rel: string; parse: (line: string) => Record<string, unknown> | null; format: (row: Record<string, unknown>) => string };
  width?: "sm" | "md" | "lg" | "full";
}

export type ColKind = "text" | "num" | "money" | "bool" | "date" | "badge" | "tags";

export interface Col {
  key: string; // supports dotted path: branch.name
  label: string;
  kind?: ColKind;
  tags?: [string, string][]; // for kind "tags": [booleanField, label]
  warnBelow?: string; // field name; highlights red if value < that field
  mono?: boolean;
}

export interface Entity {
  key: string;
  title: string;
  singular: string;
  model: string;
  group: string;
  search: string[];
  columns: Col[];
  fields: Field[];
  include?: Record<string, unknown>;
  orderBy?: Record<string, "asc" | "desc">;
  filters?: { field: string; label: string; options: string[] }[];
  boolFilters?: { field: string; label: string }[];
}

export const LOOKUPS: Record<string, { model: string; label: string; extra?: string }> = {
  branch: { model: "branch", label: "name" },
  store: { model: "store", label: "name" },
  category: { model: "category", label: "name" },
  uom: { model: "uom", label: "code" },
  operation: { model: "operation", label: "name" },
  subProcess: { model: "subProcess", label: "name" },
  line: { model: "productionLine", label: "name" },
  product: { model: "product", label: "name", extra: "code" },
  rawProduct: { model: "product", label: "name", extra: "code" },
  asset: { model: "asset", label: "name" },
  supplier: { model: "supplier", label: "name" },
  client: { model: "client", label: "name" },
  parameter: { model: "parameter", label: "name" },
  expenseType: { model: "expenseType", label: "name" },
  qcTemplate: { model: "qcTemplate", label: "name" },
};

const S = {
  basic: "General",
  stock: "Stock & tracking",
  more: "Additional",
};

const parsePoint = (line: string) => {
  const t = line.trim();
  if (!t) return null;
  const essential = t.startsWith("*");
  const [label, criteria] = t.replace(/^\*/, "").split("|").map((x) => x.trim());
  return label ? { label, criteria: criteria || null, essential } : null;
};

export const ENTITIES: Record<string, Entity> = {
  products: {
    key: "products", title: "Products", singular: "Product", model: "product", group: "Catalog",
    search: ["code", "name", "barcode"],
    include: { category: true },
    orderBy: { code: "asc" },
    filters: [{ field: "kind", label: "Kind", options: ["RAW", "SEMI", "FINISHED"] }],
    boolFilters: [{ field: "active", label: "Active" }, { field: "serialBase", label: "Serial tracked" }, { field: "requireBatch", label: "Batch tracked" }],
    columns: [
      { key: "code", label: "Code", mono: true },
      { key: "name", label: "Name" },
      { key: "kind", label: "Kind", kind: "badge" },
      { key: "category.name", label: "Category" },
      { key: "uom", label: "UoM" },
      { key: "qtyOnHand", label: "On hand", kind: "num", warnBelow: "minStock" },
      { key: "minStock", label: "Min", kind: "num" },
      { key: "avgCost", label: "Avg cost", kind: "money" },
      { key: "tracking", label: "Tracking", kind: "tags", tags: [["serialBase", "Serial"], ["requireBatch", "Batch"]] },
      { key: "active", label: "Active", kind: "bool" },
    ],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, section: S.basic, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true, section: S.basic, width: "lg" },
      { name: "kind", label: "Kind", type: "select", options: ["RAW", "SEMI", "FINISHED"], def: "RAW", section: S.basic, width: "sm" },
      { name: "categoryId", label: "Category", type: "ref", ref: "category", section: S.basic },
      { name: "uom", label: "Unit of measure", type: "ref", ref: "uom", refValue: "code", def: "PCS", section: S.basic, width: "sm" },
      { name: "barcode", label: "Barcode", type: "text", section: S.basic },
      { name: "description", label: "Description", type: "textarea", section: S.basic, width: "full" },
      { name: "avgCost", label: "Average cost", type: "number", def: 0, section: S.stock, help: "Updated automatically by purchases and production receipts" },
      { name: "qtyOnHand", label: "Opening stock", type: "number", def: 0, createOnly: true, section: S.stock, help: "Later changes go through Inventory → adjustments" },
      { name: "minStock", label: "Minimum stock", type: "number", def: 0, section: S.stock },
      { name: "reorderQty", label: "Reorder quantity", type: "number", def: 0, section: S.stock },
      { name: "serialBase", label: "Serial tracked (finished goods)", type: "bool", section: S.stock },
      { name: "requireBatch", label: "Batch / lot tracked", type: "bool", section: S.stock, help: "Receipts and consumption must name a batch" },
      { name: "shelfLifeDays", label: "Shelf life (days)", type: "number", section: S.stock },
      { name: "active", label: "Active", type: "bool", def: true, section: S.more },
    ],
  },
  categories: {
    key: "categories", title: "Product categories", singular: "Category", model: "category", group: "Catalog",
    search: ["name"], orderBy: { name: "asc" },
    columns: [{ key: "name", label: "Name" }],
    fields: [{ name: "name", label: "Name", type: "text", required: true }],
  },
  uoms: {
    key: "uoms", title: "Units of measure", singular: "Unit", model: "uom", group: "Catalog",
    search: ["code", "name"], orderBy: { code: "asc" },
    columns: [{ key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true },
    ],
  },
  suppliers: {
    key: "suppliers", title: "Suppliers", singular: "Supplier", model: "supplier", group: "Catalog",
    search: ["code", "name", "phone", "email"], orderBy: { code: "asc" },
    boolFilters: [{ field: "active", label: "Active" }],
    columns: [{ key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email" }, { key: "active", label: "Active", kind: "bool" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true, width: "lg" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "email", label: "Email", type: "text" },
      { name: "active", label: "Active", type: "bool", def: true },
    ],
  },
  clients: {
    key: "clients", title: "Clients", singular: "Client", model: "client", group: "Catalog",
    search: ["code", "name", "phone"], orderBy: { code: "asc" },
    boolFilters: [{ field: "active", label: "Active" }],
    columns: [{ key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }, { key: "phone", label: "Phone" }, { key: "active", label: "Active", kind: "bool" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true, width: "lg" },
      { name: "phone", label: "Phone", type: "text" },
      { name: "active", label: "Active", type: "bool", def: true },
    ],
  },
  branches: {
    key: "branches", title: "Branches", singular: "Branch", model: "branch", group: "Organization",
    search: ["code", "name", "city"], orderBy: { code: "asc" },
    columns: [{ key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }, { key: "city", label: "City" }, { key: "active", label: "Active", kind: "bool" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true, width: "lg" },
      { name: "city", label: "City", type: "text" },
      { name: "active", label: "Active", type: "bool", def: true },
    ],
  },
  stores: {
    key: "stores", title: "Stores", singular: "Store", model: "store", group: "Organization",
    search: ["code", "name"], include: { branch: true }, orderBy: { code: "asc" },
    filters: [{ field: "kind", label: "Kind", options: ["RAW", "FINISHED", "SCRAP", "WIP"] }],
    columns: [{ key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }, { key: "kind", label: "Kind", kind: "badge" }, { key: "branch.name", label: "Branch" }, { key: "active", label: "Active", kind: "bool" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true, width: "lg" },
      { name: "kind", label: "Kind", type: "select", options: ["RAW", "FINISHED", "SCRAP", "WIP"], def: "RAW" },
      { name: "branchId", label: "Branch", type: "ref", ref: "branch" },
      { name: "active", label: "Active", type: "bool", def: true },
    ],
  },
  assets: {
    key: "assets", title: "Equipment & assets", singular: "Asset", model: "asset", group: "Organization",
    search: ["code", "name"], include: { branch: true }, orderBy: { code: "asc" },
    boolFilters: [{ field: "active", label: "Active" }],
    columns: [{ key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }, { key: "branch.name", label: "Branch" }, { key: "hourRate", label: "Hour rate", kind: "money" }, { key: "active", label: "Active", kind: "bool" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true, width: "lg" },
      { name: "branchId", label: "Branch", type: "ref", ref: "branch" },
      { name: "hourRate", label: "Hour rate (cost)", type: "number", def: 0 },
      { name: "notes", label: "Notes", type: "textarea", width: "full" },
      { name: "active", label: "Active", type: "bool", def: true },
    ],
  },
  operations: {
    key: "operations", title: "Operations", singular: "Operation", model: "operation", group: "Manufacturing setup",
    search: ["code", "name", "shortName"], include: { subProcesses: { include: { subProcess: true } } }, orderBy: { code: "asc" },
    boolFilters: [{ field: "requiresQc", label: "Requires QC" }, { field: "requiresVerify", label: "Requires verify" }, { field: "active", label: "Active" }],
    columns: [
      { key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }, { key: "shortName", label: "Short" },
      { key: "flags", label: "Rules", kind: "tags", tags: [["requiresQc", "QC"], ["requiresVerify", "Verify"]] },
      { key: "active", label: "Active", kind: "bool" },
    ],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm", section: S.basic },
      { name: "name", label: "Name", type: "text", required: true, width: "lg", section: S.basic },
      { name: "shortName", label: "Short name", type: "text", width: "sm", section: S.basic },
      { name: "description", label: "Description", type: "textarea", width: "full", section: S.basic },
      { name: "requiresQc", label: "Requires quality control", type: "bool", section: "Rules" },
      { name: "requiresVerify", label: "Requires supervisor verification", type: "bool", section: "Rules" },
      { name: "active", label: "Active", type: "bool", def: true, section: "Rules" },
      { name: "subProcesses", label: "Sub-processes", type: "multi", ref: "subProcess", section: "Sub-processes", width: "full", multi: { join: "operationSub", own: "operationId", other: "subProcessId", rel: "subProcesses" } },
    ],
  },
  "sub-processes": {
    key: "sub-processes", title: "Sub-processes", singular: "Sub-process", model: "subProcess", group: "Manufacturing setup",
    search: ["code", "name"], orderBy: { code: "asc" },
    columns: [{ key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }, { key: "active", label: "Active", kind: "bool" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true, width: "lg" },
      { name: "active", label: "Active", type: "bool", def: true },
    ],
  },
  parameters: {
    key: "parameters", title: "Reading parameters", singular: "Parameter", model: "parameter", group: "Manufacturing setup",
    search: ["code", "name"], orderBy: { code: "asc" },
    columns: [{ key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }, { key: "unit", label: "Unit" }, { key: "lowRange", label: "Low", kind: "num" }, { key: "highRange", label: "High", kind: "num" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true, width: "lg" },
      { name: "unit", label: "Unit", type: "text", width: "sm" },
      { name: "lowRange", label: "Normal low", type: "number", def: 0 },
      { name: "highRange", label: "Normal high", type: "number", def: 0 },
    ],
  },
  lines: {
    key: "lines", title: "Production lines", singular: "Production line", model: "productionLine", group: "Manufacturing setup",
    search: ["code", "name"],
    include: { branch: true, rawStore: true, fgStore: true, products: { include: { product: true } }, assets: { include: { asset: true } } },
    orderBy: { code: "asc" },
    boolFilters: [{ field: "active", label: "Active" }],
    columns: [
      { key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }, { key: "branch.name", label: "Branch" },
      { key: "rawStore.name", label: "Raw store" }, { key: "fgStore.name", label: "Finished store" },
      { key: "capacity", label: "Capacity/day", kind: "num" }, { key: "active", label: "Active", kind: "bool" },
    ],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm", section: S.basic },
      { name: "name", label: "Name", type: "text", required: true, width: "lg", section: S.basic },
      { name: "description", label: "Description", type: "textarea", width: "full", section: S.basic },
      { name: "branchId", label: "Branch", type: "ref", ref: "branch", section: "Location & capacity" },
      { name: "rawStoreId", label: "Raw material store", type: "ref", ref: "store", section: "Location & capacity" },
      { name: "fgStoreId", label: "Finished goods store", type: "ref", ref: "store", section: "Location & capacity" },
      { name: "capacity", label: "Capacity (units / working day)", type: "number", def: 0, section: "Location & capacity" },
      { name: "active", label: "Active", type: "bool", def: true, section: "Location & capacity" },
      { name: "products", label: "Products this line can make", type: "multi", ref: "product", section: "Products & equipment", width: "full", multi: { join: "lineProduct", own: "lineId", other: "productId", rel: "products" } },
      { name: "assets", label: "Equipment on this line", type: "multi", ref: "asset", section: "Products & equipment", width: "full", multi: { join: "lineAsset", own: "lineId", other: "assetId", rel: "assets" } },
    ],
  },
  "qc-templates": {
    key: "qc-templates", title: "QC templates", singular: "QC template", model: "qcTemplate", group: "Manufacturing setup",
    search: ["name"], include: { points: true }, orderBy: { name: "asc" },
    boolFilters: [{ field: "active", label: "Active" }],
    columns: [{ key: "name", label: "Name" }, { key: "points.length", label: "Check points", kind: "num" }, { key: "genSerial", label: "Generates serial", kind: "bool" }, { key: "active", label: "Active", kind: "bool" }],
    fields: [
      { name: "name", label: "Name", type: "text", required: true, width: "lg", section: S.basic },
      { name: "specs", label: "Specifications", type: "textarea", width: "full", section: S.basic },
      { name: "genSerial", label: "Generates product serial", type: "bool", section: S.basic },
      { name: "active", label: "Active", type: "bool", def: true, section: S.basic },
      {
        name: "points", label: "Check points", type: "lines", section: "Check points", width: "full",
        help: "One per line:  label | acceptance criteria   — prefix with * for an essential point",
        lines: {
          model: "qcTemplatePoint", own: "templateId", rel: "points", parse: parsePoint,
          format: (r) => `${r.essential ? "*" : ""}${r.label}${r.criteria ? ` | ${r.criteria}` : ""}`,
        },
      },
    ],
  },
  team: {
    key: "team", title: "Production team", singular: "Team member", model: "teamMember", group: "Manufacturing setup",
    search: ["name", "employeeNo", "position", "phone"], include: { line: true, defaultOp: true, allowedOps: { include: { operation: true } } }, orderBy: { name: "asc" },
    boolFilters: [{ field: "active", label: "Active" }, { field: "isLeader", label: "Team leader" }],
    columns: [
      { key: "employeeNo", label: "Emp #", mono: true }, { key: "name", label: "Name" }, { key: "position", label: "Position" },
      { key: "line.name", label: "Line" }, { key: "defaultOp.name", label: "Default op" }, { key: "hourRate", label: "Hour rate", kind: "money" },
      { key: "roles", label: "Roles", kind: "tags", tags: [["isLeader", "Leader"], ["canQc", "QC"], ["canHold", "Holding"]] },
      { key: "active", label: "Active", kind: "bool" },
    ],
    fields: [
      { name: "employeeNo", label: "Employee no.", type: "text", width: "sm", section: S.basic },
      { name: "name", label: "Full name", type: "text", required: true, width: "lg", section: S.basic },
      { name: "position", label: "Position", type: "text", section: S.basic },
      { name: "phone", label: "Phone", type: "text", section: S.basic },
      { name: "hourRate", label: "Hour rate (cost)", type: "number", def: 0, section: "Assignment" },
      { name: "lineId", label: "Production line", type: "ref", ref: "line", section: "Assignment" },
      { name: "defaultOpId", label: "Default operation", type: "ref", ref: "operation", section: "Assignment" },
      { name: "isLeader", label: "Team leader", type: "bool", section: "Assignment" },
      { name: "canQc", label: "Works in QC area", type: "bool", section: "Assignment" },
      { name: "canHold", label: "Works in holding area", type: "bool", section: "Assignment" },
      { name: "active", label: "Active", type: "bool", def: true, section: "Assignment" },
      { name: "allowedOps", label: "Allowed operations", type: "multi", ref: "operation", section: "Permissions", width: "full", multi: { join: "teamOperation", own: "memberId", other: "operationId", rel: "allowedOps" } },
    ],
  },
  "expense-types": {
    key: "expense-types", title: "Expense types", singular: "Expense type", model: "expenseType", group: "Manufacturing setup",
    search: ["code", "name"], orderBy: { code: "asc" },
    columns: [{ key: "code", label: "Code", mono: true }, { key: "name", label: "Name" }],
    fields: [
      { name: "code", label: "Code", type: "text", required: true, width: "sm" },
      { name: "name", label: "Name", type: "text", required: true, width: "lg" },
    ],
  },
  reasons: {
    key: "reasons", title: "Reasons", singular: "Reason", model: "reason", group: "Manufacturing setup",
    search: ["name"], orderBy: { name: "asc" },
    filters: [{ field: "kind", label: "Kind", options: ["CLOSE", "SUSPEND", "SCRAP", "ADJUST"] }],
    columns: [{ key: "name", label: "Reason" }, { key: "kind", label: "Used for", kind: "badge" }],
    fields: [
      { name: "name", label: "Reason", type: "text", required: true, width: "lg" },
      { name: "kind", label: "Used for", type: "select", options: ["CLOSE", "SUSPEND", "SCRAP", "ADJUST"], def: "CLOSE" },
    ],
  },
};

export const GROUPS = ["Catalog", "Manufacturing setup", "Organization"];

/** Read a dotted path (supports `.length`) from a record. */
export function pick(rec: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o == null ? o : (o as Record<string, unknown>)[k]), rec);
}

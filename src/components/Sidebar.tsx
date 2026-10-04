"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Boxes, Network, Cog, Factory, ClipboardCheck, Users, MessageSquareWarning, Inbox, ClipboardList, HardHat, ShieldCheck, UserCog,
  BarChart3, PackageSearch, Wallet, Timer, CalendarRange, Settings, Warehouse, ScanLine, Tag, Truck, Building2, Store, Wrench, Ruler, Layers, Gauge, Receipt,
  GitBranch, Handshake, CalendarClock, Hash, type LucideIcon,
} from "lucide-react";

const menu: { group: string; items: [string, string, LucideIcon][] }[] = [
  { group: "", items: [["/", "Dashboard", LayoutDashboard]] },
  {
    group: "Process",
    items: [
      ["/requests", "Production requests", Inbox],
      ["/orders", "Production orders", ClipboardList],
      ["/shop-floor", "Shop floor", HardHat],
      ["/qc", "Quality control", ShieldCheck],
      ["/supervisor", "Supervisor", UserCog],
    ],
  },
  {
    group: "Inventory & tracking",
    items: [
      ["/inventory", "Stock, batches & purchasing", Warehouse],
      ["/trace", "Traceability", ScanLine],
      ["/labels", "Labels & barcodes", Tag],
    ],
  },
  {
    group: "Catalog",
    items: [
      ["/master/products", "Products", Boxes],
      ["/boms", "Bills of materials", Network],
      ["/master/categories", "Categories", Layers],
      ["/master/uoms", "Units of measure", Ruler],
      ["/master/suppliers", "Suppliers", Truck],
      ["/master/clients", "Clients", Handshake],
    ],
  },
  {
    group: "Manufacturing setup",
    items: [
      ["/master/operations", "Operations", Cog],
      ["/master/sub-processes", "Sub-processes", GitBranch],
      ["/master/parameters", "Reading parameters", Gauge],
      ["/master/lines", "Production lines", Factory],
      ["/master/qc-templates", "QC templates", ClipboardCheck],
      ["/master/team", "Team", Users],
      ["/master/expense-types", "Expense types", Receipt],
      ["/master/reasons", "Reasons", MessageSquareWarning],
    ],
  },
  {
    group: "Organization",
    items: [
      ["/master/branches", "Branches", Building2],
      ["/master/stores", "Stores", Store],
      ["/master/assets", "Equipment & assets", Wrench],
    ],
  },
  {
    group: "Reports",
    items: [
      ["/reports/planning", "Production planning", CalendarRange],
      ["/reports/materials", "Material utilization", BarChart3],
      ["/reports/shortage", "Material shortage", PackageSearch],
      ["/reports/cost", "Cost analysis", Wallet],
      ["/reports/manpower", "Manpower", Timer],
      ["/reports/batches", "Batches & expiry", CalendarClock],
      ["/reports/serials", "Serial status", Hash],
    ],
  },
  { group: "System", items: [["/settings", "Rules & settings", Settings]] },
];

export default function Sidebar() {
  const path = usePathname();
  const active = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));
  return (
    <aside className="shrink-0 bg-navy-950 text-slate-300 md:sticky md:top-0 md:h-screen md:w-60 md:overflow-y-auto">
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white shadow-lg shadow-blue-900/50"><Factory size={20} /></div>
        <div>
          <div className="text-base font-semibold leading-tight text-white">MFP</div>
          <div className="text-[11px] uppercase tracking-widest text-blue-300/70">Manufacturing</div>
        </div>
      </div>
      <div className="hazard h-1" />
      <nav className="flex flex-wrap gap-x-3 px-2 py-3 md:block">
        {menu.map((g) => (
          <div key={g.group} className="mb-2 md:mb-4">
            {g.group && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300/50">{g.group}</div>}
            {g.items.map(([href, label, Icon]) => (
              <Link key={href} href={href} className={`group flex items-center gap-3 rounded-md px-3 py-1.5 text-sm transition-colors ${active(href) ? "bg-brand/20 text-white ring-1 ring-brand/40" : "hover:bg-white/5 hover:text-white"}`}>
                <Icon size={16} className={active(href) ? "text-blue-400" : "text-blue-400/60 group-hover:text-blue-400"} />
                {label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

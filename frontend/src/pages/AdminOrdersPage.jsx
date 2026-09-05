import { useEffect, useState } from "react";
import { api, inr } from "../lib/api";
import { ShoppingBag, Package } from "lucide-react";

const STATUS_META = {
  placed: { label: "Placed", cls: "bg-terracotta/15 text-terracotta" },
  confirmed: { label: "Confirmed", cls: "bg-sage/15 text-sage" },
  shipped: { label: "Shipped", cls: "bg-ochre/15 text-ochre" },
  out_for_delivery: { label: "Out for Delivery", cls: "bg-terracotta/15 text-terracotta" },
  delivered: { label: "Delivered", cls: "bg-sage/15 text-sage" },
  cancelled: { label: "Cancelled", cls: "bg-destructive/10 text-destructive" },
};

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState(null);
  const [status, setStatus] = useState("all");

  useEffect(() => {
    api.get("/admin/orders", { params: status !== "all" ? { status } : {} }).then((r) => setOrders(r.data));
  }, [status]);

  if (!orders) return <div className="text-charcoal-muted">Loading orders…</div>;

  return (
    <div data-testid="admin-orders-page">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-heading font-semibold text-2xl text-charcoal">Orders ({orders.length})</h2>
        <div className="flex gap-2 flex-wrap">
          {["all", "placed", "confirmed", "shipped", "out_for_delivery", "delivered", "cancelled"].map((s) => (
            <button
              key={s}
              data-testid={`admin-orders-filter-${s}`}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 text-xs uppercase tracking-widest border-2 transition-colors ${status === s ? "border-terracotta text-terracotta bg-terracotta/5" : "border-border text-charcoal-muted hover:border-charcoal"}`}
            >
              {s === "all" ? "All" : (STATUS_META[s]?.label || s)}
            </button>
          ))}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white border border-dashed border-border p-10 text-center">
          <ShoppingBag className="w-10 h-10 mx-auto text-charcoal-muted mb-3" />
          <div className="text-sm text-charcoal-muted">No orders yet in this filter.</div>
        </div>
      ) : (
        <div className="bg-white border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]" data-testid="admin-orders-table">
            <thead className="bg-off-white-alt text-xs uppercase tracking-[0.15em] text-charcoal-muted">
              <tr>
                <th className="text-left px-4 py-3">Order</th>
                <th className="text-left px-4 py-3">Buyer</th>
                <th className="text-left px-4 py-3">Items</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Payment</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-left px-4 py-3">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const meta = STATUS_META[o.status] || STATUS_META.placed;
                return (
                  <tr key={o.id} className="border-t border-border" data-testid={`admin-order-row-${o.short_id}`}>
                    <td className="px-4 py-3">
                      <div className="font-heading font-bold text-charcoal">{o.short_id}</div>
                      <div className="text-[11px] text-charcoal-muted">{o.seller_ids?.length || 0} seller(s)</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-charcoal">{o.address?.name}</div>
                      <div className="text-[11px] text-charcoal-muted">{o.address?.phone} · {o.address?.pincode}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-charcoal-muted">
                        <Package className="w-3 h-3" /> {o.items?.length} item(s)
                      </div>
                      <div className="text-[11px] text-charcoal-muted line-clamp-1 max-w-[220px]">
                        {(o.items || []).map((it) => it.title).join(" · ")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 ${meta.cls}`}>{meta.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-charcoal uppercase text-xs font-medium">{o.payment_method}</div>
                      {o.payment_status && <div className="text-[10px] uppercase tracking-widest text-charcoal-muted">{o.payment_status}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-heading font-bold text-charcoal">{inr(o.total)}</td>
                    <td className="px-4 py-3 text-xs text-charcoal-muted whitespace-nowrap">{new Date(o.created_at).toLocaleString("en-IN")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

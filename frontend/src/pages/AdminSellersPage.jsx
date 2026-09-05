import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { ShieldCheck, ShieldAlert, Trash2, Search, Store } from "lucide-react";
import { toast } from "sonner";

export default function AdminSellersPage() {
  const [sellers, setSellers] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all"); // all | verified | pending

  const load = () => api.get("/admin/sellers").then((r) => setSellers(r.data));
  useEffect(() => { load(); }, []);

  const setVerified = async (s, verified) => {
    try {
      await api.patch(`/admin/sellers/${s.id}/verify?verified=${verified}`);
      toast.success(verified ? "Seller verified" : "Verification revoked");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const del = async (s) => {
    if (!confirm(`Remove seller "${s.business_name}" and all their products? This cannot be undone.`)) return;
    try {
      const { data } = await api.delete(`/admin/sellers/${s.id}`);
      toast.success(`Removed seller (${data.products_removed} products deleted)`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  if (!sellers) return <div className="text-charcoal-muted">Loading sellers…</div>;

  const filtered = sellers.filter((s) => {
    if (filter === "verified" && !s.verified) return false;
    if (filter === "pending" && s.verified) return false;
    if (q && !(`${s.business_name} ${s.owner_email} ${s.gst_number}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  return (
    <div data-testid="admin-sellers-page">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-heading font-semibold text-2xl text-charcoal">Sellers ({sellers.length})</h2>
        <div className="flex gap-2 flex-wrap items-center">
          <div className="relative">
            <Search className="w-4 h-4 text-charcoal-muted absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name / email / GST"
              data-testid="admin-sellers-search"
              className="border-2 border-border focus:border-terracotta bg-white pl-8 pr-3 py-2 text-sm outline-none w-56"
            />
          </div>
          {["all", "verified", "pending"].map((f) => (
            <button
              key={f}
              data-testid={`admin-sellers-filter-${f}`}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs uppercase tracking-widest border-2 transition-colors ${filter === f ? "border-terracotta text-terracotta bg-terracotta/5" : "border-border text-charcoal-muted hover:border-charcoal"}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-border p-10 text-center">
          <Store className="w-10 h-10 mx-auto text-charcoal-muted mb-3" />
          <div className="text-sm text-charcoal-muted">No sellers match your filters.</div>
        </div>
      ) : (
        <div className="bg-white border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]" data-testid="admin-sellers-table">
            <thead className="bg-off-white-alt text-xs uppercase tracking-[0.15em] text-charcoal-muted">
              <tr>
                <th className="text-left px-4 py-3">Business</th>
                <th className="text-left px-4 py-3">Owner</th>
                <th className="text-left px-4 py-3">GST</th>
                <th className="text-right px-4 py-3">Products</th>
                <th className="text-right px-4 py-3">Orders</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-t border-border" data-testid={`admin-seller-row-${s.id}`}>
                  <td className="px-4 py-3 font-medium text-charcoal">{s.business_name}</td>
                  <td className="px-4 py-3 text-charcoal-muted">
                    <div>{s.owner_name}</div>
                    <div className="text-[11px]">{s.owner_email}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-charcoal-muted font-mono">{s.gst_number || "—"}</td>
                  <td className="px-4 py-3 text-right font-medium">{s.products_count}</td>
                  <td className="px-4 py-3 text-right text-charcoal-muted">{s.orders_count}</td>
                  <td className="px-4 py-3">
                    {s.verified ? (
                      <span className="inline-flex items-center gap-1 text-xs text-sage font-semibold uppercase tracking-widest"><ShieldCheck className="w-3.5 h-3.5" /> Verified</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-ochre font-semibold uppercase tracking-widest"><ShieldAlert className="w-3.5 h-3.5" /> Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2 flex-wrap">
                      {s.verified ? (
                        <button
                          onClick={() => setVerified(s, false)}
                          data-testid={`revoke-verify-${s.id}`}
                          className="text-xs border border-ochre/50 text-ochre hover:bg-ochre/10 px-2 py-1"
                        >
                          Reject
                        </button>
                      ) : (
                        <button
                          onClick={() => setVerified(s, true)}
                          data-testid={`approve-verify-${s.id}`}
                          className="text-xs border border-sage/50 text-sage hover:bg-sage/10 px-2 py-1"
                        >
                          Approve
                        </button>
                      )}
                      <button
                        onClick={() => del(s)}
                        data-testid={`delete-seller-${s.id}`}
                        className="text-xs border border-destructive/40 text-destructive hover:bg-destructive/10 px-2 py-1 inline-flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

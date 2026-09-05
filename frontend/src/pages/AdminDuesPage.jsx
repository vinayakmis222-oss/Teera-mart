import { useEffect, useState } from "react";
import { api, inr } from "../lib/api";
import { AlertTriangle, ShieldCheck, ShieldAlert, PauseCircle, PlayCircle, IndianRupee, Percent } from "lucide-react";
import { toast } from "sonner";

export default function AdminDuesPage() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [d, s] = await Promise.all([api.get("/admin/dues"), api.get("/admin/settings")]);
    setData(d.data); setSettings(s.data);
  };
  useEffect(() => { load(); }, []);

  const saveSettings = async () => {
    setBusy(true);
    try {
      const { data } = await api.patch("/admin/settings", settings);
      setSettings(data);
      toast.success("Settings saved");
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const markPaid = async (s) => {
    const raw = prompt(`Mark dues paid for ${s.business_name}. Amount (blank = clear full ₹${s.pending_dues}):`, "");
    if (raw === null) return;
    const amount = raw.trim() ? parseFloat(raw) : null;
    try {
      const { data } = await api.post(`/admin/dues/${s.id}/mark-paid`, { amount, note: "offline (admin)" });
      toast.success(`Cleared ${data.cleared_count} due(s); remaining ${inr(data.remaining_dues)}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  const togglePause = async (s) => {
    try {
      await api.patch(`/admin/sellers/${s.id}/pause`, { paused: !s.paused_by_admin });
      toast.success(`Seller ${!s.paused_by_admin ? "paused" : "unpaused"}`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };

  if (!data || !settings) return <div className="text-charcoal-muted">Loading…</div>;

  return (
    <div className="space-y-6" data-testid="admin-dues-page">
      {/* Settings editor */}
      <div className="bg-white border border-border p-5 md:p-6" data-testid="admin-settings-card">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold">Platform Settings</div>
        </div>
        <div className="grid md:grid-cols-5 gap-3">
          <Field label="Subscription (₹/mo)" icon={IndianRupee} value={settings.subscription_price} onChange={(v) => setSettings({ ...settings, subscription_price: parseFloat(v) || 0 })} testid="setting-subscription-price" />
          <Field label="Sub period (days)" value={settings.subscription_period_days} onChange={(v) => setSettings({ ...settings, subscription_period_days: parseInt(v) || 30 })} testid="setting-sub-period" />
          <Field label="Commission (%)" icon={Percent} value={settings.default_commission_rate} onChange={(v) => setSettings({ ...settings, default_commission_rate: parseFloat(v) || 0 })} testid="setting-commission" />
          <Field label="Dues threshold (₹)" icon={IndianRupee} value={settings.dues_threshold} onChange={(v) => setSettings({ ...settings, dues_threshold: parseFloat(v) || 0 })} testid="setting-threshold" />
          <Field label="Grace (days)" value={settings.dues_grace_days} onChange={(v) => setSettings({ ...settings, dues_grace_days: parseInt(v) || 0 })} testid="setting-grace-days" />
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={saveSettings} disabled={busy} data-testid="save-settings-btn" className="btn-terracotta text-sm py-2 px-4">
            {busy ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      {/* Dues table */}
      <div>
        <h2 className="font-heading font-semibold text-2xl text-charcoal mb-4">Seller Dues</h2>
        <div className="bg-white border border-border overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]" data-testid="admin-dues-table">
            <thead className="bg-off-white-alt text-xs uppercase tracking-[0.15em] text-charcoal-muted">
              <tr>
                <th className="text-left px-4 py-3">Seller</th>
                <th className="text-right px-4 py-3">Commission rate</th>
                <th className="text-right px-4 py-3">Pending dues</th>
                <th className="text-left px-4 py-3">Subscription</th>
                <th className="text-left px-4 py-3">Last payment</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.sellers.map((s) => (
                <tr key={s.id} className={`border-t border-border ${s.over_threshold ? "bg-destructive/5" : ""}`} data-testid={`dues-row-${s.id}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-charcoal">{s.business_name}</div>
                    <div className="text-[11px] text-charcoal-muted inline-flex items-center gap-1">
                      {s.verified ? <><ShieldCheck className="w-3 h-3 text-sage" /> Verified</> : <><ShieldAlert className="w-3 h-3 text-ochre" /> Pending</>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-charcoal-muted">{s.commission_rate}%</td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-heading font-bold text-charcoal">{inr(s.pending_dues)}</div>
                    {s.over_threshold && (
                      <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-destructive font-bold mt-1" data-testid={`over-threshold-${s.id}`}>
                        <AlertTriangle className="w-3 h-3" /> Over ₹{new Intl.NumberFormat("en-IN").format(data.threshold)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] uppercase tracking-widest font-semibold px-2 py-0.5 ${s.subscription_status === "active" ? "bg-sage/15 text-sage" : s.subscription_status === "expired" ? "bg-destructive/10 text-destructive" : "bg-ochre/15 text-ochre"}`}>
                      {s.subscription_status}
                    </span>
                    <div className="text-[11px] text-charcoal-muted mt-1">
                      {s.subscription_expires_at ? `Exp: ${new Date(s.subscription_expires_at).toLocaleDateString("en-IN")}` : "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-charcoal-muted">{s.last_dues_paid_at ? new Date(s.last_dues_paid_at).toLocaleDateString("en-IN") : "Never"}</td>
                  <td className="px-4 py-3">
                    {s.effective_paused ? (
                      <span className="text-[10px] uppercase tracking-widest text-destructive font-semibold inline-flex items-center gap-1">
                        <PauseCircle className="w-3 h-3" /> Paused {s.auto_paused && "(auto)"}
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-widest text-sage font-semibold inline-flex items-center gap-1">
                        <PlayCircle className="w-3 h-3" /> Live
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 flex-wrap">
                      <button
                        onClick={() => markPaid(s)}
                        disabled={s.pending_dues <= 0}
                        data-testid={`mark-paid-${s.id}`}
                        className="text-xs border border-sage/50 text-sage hover:bg-sage/10 px-2 py-1 disabled:opacity-40"
                      >
                        Mark paid
                      </button>
                      <button
                        onClick={() => togglePause(s)}
                        data-testid={`toggle-pause-${s.id}`}
                        className="text-xs border border-charcoal-muted text-charcoal hover:bg-off-white-alt px-2 py-1"
                      >
                        {s.paused_by_admin ? "Unpause" : "Pause"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Field({ label, icon: Icon, value, onChange, testid }) {
  return (
    <label className="block">
      <div className="text-[10px] uppercase tracking-[0.2em] text-charcoal-muted mb-1 inline-flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testid}
        className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none"
      />
    </label>
  );
}

import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Plus, MapPin, Trash2, Edit3, Home, Briefcase } from "lucide-react";
import { SERVICEABLE_PINCODE, SERVICEABLE_AREAS } from "../context/DeliveryContext";
import { toast } from "sonner";

export default function AddressesPage() {
  const [addrs, setAddrs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = () => api.get("/addresses").then((r) => setAddrs(r.data));
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!confirm("Delete this address?")) return;
    await api.delete(`/addresses/${id}`);
    toast.success("Address removed");
    load();
  };

  return (
    <div data-testid="addresses-page">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-heading font-semibold text-xl text-charcoal">Saved addresses</h2>
        <button onClick={() => { setEditing(null); setShowForm(true); }} data-testid="new-address-btn" className="btn-terracotta text-sm py-2 px-4">
          <Plus className="w-4 h-4" /> Add new
        </button>
      </div>

      {addrs.length === 0 && !showForm && (
        <div className="bg-white border border-dashed border-border p-10 text-center">
          <MapPin className="w-10 h-10 mx-auto text-charcoal-muted mb-3" />
          <div className="font-heading text-lg text-charcoal mb-1">No addresses yet</div>
          <div className="text-sm text-charcoal-muted mb-4">Add a delivery address to speed up checkout.</div>
          <button onClick={() => setShowForm(true)} className="btn-terracotta">Add first address</button>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {addrs.map((a) => (
          <div key={a.id} className="bg-white border border-border p-5" data-testid={`address-card-${a.id}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="text-[10px] uppercase tracking-widest bg-off-white-alt px-2 py-0.5 text-charcoal-muted inline-flex items-center gap-1">
                  {a.type === "work" ? <Briefcase className="w-3 h-3" /> : <Home className="w-3 h-3" />} {a.type}
                </div>
                {a.is_default && <span className="text-[10px] uppercase tracking-widest text-terracotta font-semibold">Default</span>}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditing(a); setShowForm(true); }} data-testid={`address-edit-${a.id}`} className="p-2 hover:bg-off-white-alt text-charcoal-muted"><Edit3 className="w-4 h-4" /></button>
                <button onClick={() => del(a.id)} data-testid={`address-delete-${a.id}`} className="p-2 hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
            <div className="text-sm">
              <div className="font-semibold text-charcoal">{a.name}</div>
              <div className="text-charcoal-muted mt-1">{a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} — {a.pincode}</div>
              <div className="text-charcoal-muted mt-1">Phone: {a.phone}</div>
            </div>
          </div>
        ))}
      </div>

      {showForm && <AddrForm existing={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </div>
  );
}

function AddrForm({ existing, onClose, onSaved }) {
  const [f, setF] = useState(existing || { name: "", phone: "", pincode: SERVICEABLE_PINCODE, line1: "", line2: "", city: "Lucknow", state: "Uttar Pradesh", type: "home", is_default: false });
  const [busy, setBusy] = useState(false);
  const pinBad = f.pincode && f.pincode !== SERVICEABLE_PINCODE;
  const submit = async (e) => {
    e.preventDefault();
    if (f.pincode !== SERVICEABLE_PINCODE) {
      toast.error(`We deliver only to Pincode ${SERVICEABLE_PINCODE} (${SERVICEABLE_AREAS})`);
      return;
    }
    setBusy(true);
    try {
      if (existing) await api.patch(`/addresses/${existing.id}`, f);
      else await api.post("/addresses", f);
      toast.success("Address saved");
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="mt-6 bg-white border border-border p-6">
      <h3 className="font-heading font-semibold text-lg text-charcoal mb-4">{existing ? "Edit address" : "Add new address"}</h3>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid md:grid-cols-2 gap-3">
          <input required data-testid="addr-name" placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none" />
          <input required data-testid="addr-phone" placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none" />
        </div>
        <input required data-testid="addr-line1" placeholder="Address line 1" value={f.line1} onChange={(e) => setF({ ...f, line1: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none" />
        <input data-testid="addr-line2" placeholder="Address line 2 (optional)" value={f.line2} onChange={(e) => setF({ ...f, line2: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input required placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} data-testid="addr-city" className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none" />
          <input required placeholder="State" value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} data-testid="addr-state" className="border-2 border-border focus:border-terracotta bg-off-white px-3 py-2 outline-none" />
          <div>
            <input
              required
              placeholder="Pincode"
              value={f.pincode}
              onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              data-testid="addr-pincode"
              className={`w-full border-2 focus:border-terracotta bg-off-white px-3 py-2 outline-none ${pinBad ? "border-destructive" : "border-border"}`}
            />
            {pinBad && (
              <div className="text-[11px] text-destructive mt-1" data-testid="addr-pincode-error">
                We deliver only to {SERVICEABLE_PINCODE}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {["home", "work", "other"].map((t) => (
              <button key={t} type="button" data-testid={`addr-type-${t}`} onClick={() => setF({ ...f, type: t })} className={`px-3 py-1.5 text-xs uppercase tracking-widest border-2 ${f.type === t ? "border-terracotta text-terracotta bg-terracotta/5" : "border-border text-charcoal-muted"}`}>{t}</button>
            ))}
          </div>
          <label className="text-sm inline-flex items-center gap-2 text-charcoal">
            <input type="checkbox" checked={f.is_default} onChange={(e) => setF({ ...f, is_default: e.target.checked })} data-testid="addr-default" className="accent-terracotta" />
            Set as default
          </label>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-charcoal-muted hover:text-charcoal">Cancel</button>
          <button type="submit" disabled={busy || pinBad} data-testid="addr-save" className="btn-terracotta text-sm py-2 px-4">{busy ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

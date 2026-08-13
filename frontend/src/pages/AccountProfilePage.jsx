import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { toast } from "sonner";

export default function AccountProfilePage() {
  const { user, updateProfile } = useAuth();
  const [f, setF] = useState({ name: user.name || "", phone: user.phone || "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await updateProfile(f);
    setBusy(false);
    if (res.ok) toast.success("Profile updated");
    else toast.error(res.error);
  };

  return (
    <div className="bg-white border border-border p-6 md:p-8" data-testid="account-profile">
      <h2 className="font-heading font-semibold text-xl text-charcoal mb-1">Profile details</h2>
      <p className="text-sm text-charcoal-muted mb-6">Manage your personal information.</p>
      <form onSubmit={submit} className="space-y-4 max-w-lg">
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-charcoal-muted font-semibold mb-1 block">Name</label>
          <input data-testid="profile-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-charcoal-muted font-semibold mb-1 block">Phone</label>
          <input data-testid="profile-phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="w-full border-2 border-border focus:border-terracotta bg-off-white px-3 py-3 outline-none" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.2em] text-charcoal-muted font-semibold mb-1 block">Email</label>
          <input value={user.email} disabled className="w-full border-2 border-border bg-off-white-alt text-charcoal-muted px-3 py-3 outline-none" />
        </div>
        <button disabled={busy} className="btn-terracotta" data-testid="profile-save">
          {busy ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

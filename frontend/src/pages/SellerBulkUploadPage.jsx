import { useEffect, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import Papa from "papaparse";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, Download, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const REQUIRED_COLS = ["name", "category", "price"];
const CATEGORY_SLUGS = ["tiles", "wall-stencils", "wall-stickers", "wallpapers", "paints", "home-decor", "flooring"];

function parseVariants(str) {
  if (!str) return [];
  // Accept "Size:600x600@0;Size:800x800@250" OR JSON
  const trimmed = String(str).trim();
  if (trimmed.startsWith("[")) {
    try { return JSON.parse(trimmed); } catch { return []; }
  }
  return trimmed.split(";").map((piece) => piece.trim()).filter(Boolean).map((piece) => {
    const [nv, delta] = piece.split("@");
    const [name, value] = (nv || "").split(":");
    return { name: (name || "").trim() || "Option", value: (value || "").trim() || nv, price_delta: parseFloat(delta || "0") || 0 };
  });
}

function parseImages(str) {
  if (!str) return [];
  return String(str).split(/[,;|]/).map((s) => s.trim()).filter(Boolean);
}

export default function SellerBulkUploadPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState([]);
  const [errors, setErrors] = useState([]);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  if (loading || user === null) return <div className="container-x py-16 text-charcoal-muted">Loading…</div>;
  if (!user) return <Navigate to="/seller/login" replace />;
  if (user.role !== "seller") return <Navigate to="/" replace />;

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      complete: (res) => {
        const errs = [];
        const parsed = res.data.map((row, i) => {
          const p = {
            name: (row.name || row.title || "").trim(),
            category: (row.category || "").trim().toLowerCase(),
            price: parseFloat(row.price || "0"),
            mrp: row.mrp ? parseFloat(row.mrp) : null,
            stock: parseInt(row.stock || "0", 10) || 0,
            description: (row.description || "").trim(),
            material: (row.material || "").trim(),
            images: parseImages(row.image_urls || row.images || row.image || ""),
            variants: parseVariants(row.variants || ""),
          };
          if (!p.name) errs.push({ row: i + 1, error: "Missing name" });
          if (!p.category || !CATEGORY_SLUGS.includes(p.category)) errs.push({ row: i + 1, error: `Bad category '${p.category}'` });
          if (!p.price || p.price <= 0) errs.push({ row: i + 1, error: "Invalid price" });
          if (p.images.length === 0) errs.push({ row: i + 1, error: "No image URL(s)" });
          return p;
        });
        setRows(parsed);
        setErrors(errs);
      },
      error: (err) => toast.error(err.message || "CSV parse failed"),
    });
  };

  const submit = async () => {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      const { data } = await api.post("/seller/products/bulk", { products: rows });
      setResult(data);
      toast.success(`Imported ${data.inserted} product(s)`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Bulk upload failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadSample = () => {
    const csv = [
      "name,category,price,mrp,stock,description,material,image_urls,variants",
      `Sample Terracotta Tile,tiles,899,1299,100,Warm terracotta floor tile,Ceramic,https://images.unsplash.com/photo-1706629503571-c165023a7792?w=800|https://images.unsplash.com/photo-1615873968403-89e068629265?w=800,"Size:600x600@0;Size:800x800@250"`,
      `Damask Stencil Kit,wall-stencils,349,599,50,Reusable damask stencil,Mylar,https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=800,"Size:A3@0;Size:A2@100"`,
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "terramart-bulk-upload-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container-x py-8 md:py-12" data-testid="bulk-upload-page">
      <Link to="/seller/dashboard" className="inline-flex items-center gap-1 text-sm text-charcoal-muted hover:text-terracotta mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to dashboard
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-terracotta font-semibold mb-2">Seller Tools</div>
          <h1 className="font-heading font-bold text-3xl md:text-4xl text-charcoal">Bulk Product Upload</h1>
          <p className="text-sm text-charcoal-muted mt-1">Upload a CSV with your products. Columns: <span className="font-mono text-xs">name, category, price, mrp, stock, description, material, image_urls, variants</span></p>
        </div>
        <button onClick={downloadSample} data-testid="download-sample-csv" className="btn-outline-charcoal text-sm py-2 px-4">
          <Download className="w-4 h-4" /> Sample CSV
        </button>
      </div>

      {/* Uploader */}
      <label className="block border-2 border-dashed border-border hover:border-terracotta bg-white p-8 md:p-12 text-center cursor-pointer transition-colors" data-testid="csv-dropzone">
        <input type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" data-testid="csv-file-input" />
        <UploadCloud className="w-10 h-10 text-terracotta mx-auto mb-3" />
        <div className="font-heading font-semibold text-charcoal">{fileName || "Choose a CSV file"}</div>
        <div className="text-xs text-charcoal-muted mt-1">or drag it here — you'll see a preview before we import anything</div>
      </label>

      {/* Preview */}
      {rows.length > 0 && !result && (
        <div className="mt-6 bg-white border border-border" data-testid="preview-panel">
          <div className="px-5 md:px-6 py-4 border-b border-border flex items-center justify-between flex-wrap gap-2">
            <div className="inline-flex items-center gap-2">
              <FileText className="w-4 h-4 text-terracotta" />
              <span className="font-heading font-semibold text-charcoal">Preview — {rows.length} row(s)</span>
              {errors.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="w-3 h-3" /> {errors.length} row(s) with issues</span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setRows([]); setErrors([]); setFileName(""); }} className="text-sm text-charcoal-muted hover:text-charcoal px-3 py-2">Cancel</button>
              <button onClick={submit} disabled={busy || rows.length === 0 || errors.length === rows.length} className="btn-terracotta text-sm py-2 px-4" data-testid="confirm-import-btn">
                {busy ? "Importing…" : `Confirm import (${rows.length - errors.length})`}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]" data-testid="preview-table">
              <thead className="bg-off-white-alt text-xs uppercase tracking-[0.15em] text-charcoal-muted">
                <tr>
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-4 py-3">Image</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-right px-4 py-3">Price</th>
                  <th className="text-right px-4 py-3">Stock</th>
                  <th className="text-left px-4 py-3">Variants</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const rowErr = errors.find((e) => e.row === i + 1);
                  return (
                    <tr key={i} className={`border-t border-border ${rowErr ? "bg-destructive/5" : ""}`} data-testid={`preview-row-${i}`}>
                      <td className="px-4 py-3 text-charcoal-muted">{i + 1}</td>
                      <td className="px-4 py-3">
                        {r.images[0] ? <img src={r.images[0]} alt="" className="w-12 h-12 object-cover" loading="lazy" /> : <div className="w-12 h-12 bg-off-white-alt" />}
                      </td>
                      <td className="px-4 py-3 text-charcoal font-medium">{r.name}</td>
                      <td className="px-4 py-3 text-charcoal-muted">{r.category}</td>
                      <td className="px-4 py-3 text-right font-medium">₹{r.price}</td>
                      <td className="px-4 py-3 text-right text-charcoal-muted">{r.stock}</td>
                      <td className="px-4 py-3 text-xs text-charcoal-muted">{r.variants.length} variant(s)</td>
                      <td className="px-4 py-3">
                        {rowErr ? (
                          <span className="inline-flex items-center gap-1 text-xs text-destructive">
                            <AlertTriangle className="w-3 h-3" /> {rowErr.error}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-sage">
                            <CheckCircle2 className="w-3 h-3" /> Ready
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="mt-6 bg-white border border-border p-6" data-testid="import-result">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 grid place-items-center bg-sage/15 text-sage rounded-full">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="font-heading font-semibold text-lg text-charcoal">Import complete</div>
              <div className="text-sm text-charcoal-muted">{result.inserted} product(s) added to your catalogue.</div>
            </div>
          </div>
          {result.errors?.length > 0 && (
            <div className="mt-4 border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <div className="font-semibold text-destructive mb-1">{result.errors.length} row(s) were skipped:</div>
              <ul className="list-disc pl-5 text-charcoal-muted space-y-1">
                {result.errors.map((e, i) => <li key={i}>Row {e.row} — {e.name}: {e.error}</li>)}
              </ul>
            </div>
          )}
          <div className="mt-5 flex gap-2">
            <button onClick={() => { setRows([]); setErrors([]); setFileName(""); setResult(null); }} className="btn-outline-charcoal text-sm py-2 px-4">Upload another CSV</button>
            <Link to="/seller/dashboard" className="btn-terracotta text-sm py-2 px-4">Back to dashboard</Link>
          </div>
        </div>
      )}
    </div>
  );
}

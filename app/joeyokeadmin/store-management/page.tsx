"use client";

import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import { 
  Package, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  X, 
  Upload, 
  CheckCircle2, 
  Coins, 
  RefreshCw, 
  Eye, 
  EyeOff,
  Boxes,
  Sparkles,
  Infinity as InfinityIcon
} from "lucide-react";

export default function StoreManagement() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [mounted, setMounted] = useState(false);

  // --- MODAL STATES ---
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // --- FORM STATES ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formCategory, setFormCategory] = useState("digital");
  const [formCosmeticType, setFormCosmeticType] = useState("game_cosmetic");
  const [formGameTarget, setFormGameTarget] = useState("");
  const [originalCosmeticType, setOriginalCosmeticType] = useState("game_cosmetic");
  const [formProfileCardLayout, setFormProfileCardLayout] = useState("centered");
  const [formPricePoints, setFormPricePoints] = useState<number | "">(100);
  const [formPriceFiat, setFormPriceFiat] = useState<number | "">("");
  const [formPriceCurrency, setFormPriceCurrency] = useState("points");
  const [formGemAmount, setFormGemAmount] = useState<number | "">(100);
  const [formBonusGems, setFormBonusGems] = useState<number | "">(0);
  const [formAppleProductId, setFormAppleProductId] = useState("");
  const [formGoogleProductId, setFormGoogleProductId] = useState("");
  const [formStatus, setFormStatus] = useState<"draft" | "active" | "disabled">("active");
  const [formSortOrder, setFormSortOrder] = useState<number | "">(0);
  const [formStock, setFormStock] = useState<number | "">(-1);
  const [isInfiniteStock, setIsInfiniteStock] = useState(true);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState("");

  useEffect(() => {
    setMounted(true);
    fetchStoreItems();
  }, []);

  const fetchStoreItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("store_items")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (data) setItems(data);
    } catch (err: any) {
      console.error("Error fetching store items:", err.message);
    } finally {
      setLoading(false);
    }
  };

  // --- MODAL HANDLERS ---
  const openAddModal = () => {
    setEditingId(null);
    setFormName("");
    setFormSku(`SKU-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormDesc("");
    setFormCategory("digital");
    setFormCosmeticType("game_cosmetic");
    setFormGameTarget("");
    setOriginalCosmeticType("game_cosmetic");
    setFormProfileCardLayout("centered");
    setFormPricePoints(100);
    setFormPriceFiat("");
    setFormPriceCurrency("points");
    setFormGemAmount(100);
    setFormBonusGems(0);
    setFormAppleProductId("");
    setFormGoogleProductId("");
    setFormStatus("active");
    setFormSortOrder(0);
    setFormStock(-1);
    setIsInfiniteStock(true);
    setFormImageFile(null);
    setCurrentImageUrl("");
    setIsModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormSku(item.sku);
    setFormDesc(item.description || "");
    setFormCategory(item.category || "digital");
    const cosmeticType = item.cosmetic_type || "game_cosmetic";
    setFormCosmeticType(cosmeticType);
    setFormGameTarget(item.game_target || "");
    setOriginalCosmeticType(cosmeticType);
    setFormProfileCardLayout(item.profile_card_layout || "centered");
    setFormPricePoints(item.price_points ?? 0);
    setFormPriceFiat(item.price_fiat ?? "");
    setFormPriceCurrency(item.price_currency || "points");
    setFormGemAmount(item.gem_amount ?? 0);
    setFormBonusGems(item.bonus_gems ?? 0);
    setFormAppleProductId(item.apple_product_id || "");
    setFormGoogleProductId(item.google_product_id || "");
    setFormStatus(item.status || (item.is_active ? "active" : "disabled"));
    setFormSortOrder(item.sort_order ?? 0);
    const stockVal = item.stock_quantity ?? -1;
    setFormStock(stockVal);
    setIsInfiniteStock(stockVal === -1);
    setFormImageFile(null);
    setCurrentImageUrl(item.image_url || "");
    setIsModalOpen(true);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) return alert("Please upload an image file.");
      if (file.size > 2 * 1024 * 1024) return alert("File size too large. Max 2MB.");
      if (formCosmeticType === "avatar_frame" && !["image/png", "image/webp"].includes(file.type)) {
        return alert("Avatar borders must be uploaded as a transparent PNG or WebP.");
      }
      const preview = new Image();
      preview.onload = () => {
        URL.revokeObjectURL(preview.src);
        const ratio = preview.width / preview.height;
        if (formCosmeticType === "avatar_frame" && Math.abs(ratio - 1) > 0.02) {
          return alert("Avatar borders must be 1:1 square images (for example 1024 × 1024).");
        }
        if (formCosmeticType === "profile_card" && Math.abs(ratio - 5 / 4) > 0.04) {
          return alert("Profile card backgrounds must use a 5:4 image (for example 1500 × 1200).");
        }
        setFormImageFile(file);
      };
      preview.onerror = () => alert("This image could not be read. Please choose another file.");
      preview.src = URL.createObjectURL(file);
    }
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setFormCategory(val);
    if (val === "currency") {
      setFormPriceCurrency("fiat_usd");
      setFormPricePoints(0);
      setFormGemAmount((current) => current === "" || current <= 0 ? 100 : current);
      setFormStatus((current) => current === "active" ? "draft" : current);
    } else if (formPriceCurrency === "fiat_usd") {
      setFormPriceCurrency("points");
      setFormPriceFiat("");
    }
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formSku.trim()) return alert("Name and SKU are required.");
    if (formCategory === "currency") {
      if (formStatus === "active" && (formGemAmount === "" || Number(formGemAmount) <= 0)) {
        return alert("Enter the number of Gems this pack grants.");
      }
      if (formStatus === "active" && (formPriceFiat === "" || Number(formPriceFiat) <= 0)) {
        return alert("Enter a valid USD price for this Gem pack.");
      }
      if (formStatus === "active" && !formAppleProductId.trim() && !formGoogleProductId.trim()) {
        return alert("An active Gem pack needs at least one storefront product ID. Keep it as Draft until Apple App Store or Google Play is configured.");
      }
    }
    if (
      formCategory === "digital" &&
      formCosmeticType === "avatar_frame" &&
      formCosmeticType !== originalCosmeticType &&
      !formImageFile
    ) {
      return alert("Upload a new transparent 1:1 PNG or WebP when converting an item into an Avatar Border.");
    }
    setUploading(true);

    try {
      let finalImageUrl = currentImageUrl;

      if (formImageFile) {
        const fileExt = formImageFile.name.split(".").pop();
        const fileName = `store_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("store_images")
          .upload(fileName, formImageFile);

        if (!uploadError) {
          const { data: { publicUrl } } = supabase.storage
            .from("store_images")
            .getPublicUrl(fileName);
          finalImageUrl = publicUrl;
        }
      }

      const finalStock = isInfiniteStock 
        ? -1 
        : (formStock === "" || formStock < 0 ? 0 : Number(formStock));

      const itemData = {
        name: formName.trim(),
        sku: formSku.trim().toUpperCase(),
        description: formDesc.trim(),
        category: formCategory,
        cosmetic_type: formCategory === "digital" ? formCosmeticType : "game_cosmetic",
        game_target: formCategory === "digital" && formCosmeticType === "game_cosmetic" ? formGameTarget || null : null,
        profile_card_layout: formCategory === "digital" && formCosmeticType === "profile_card" ? formProfileCardLayout : "centered",
        price_points: formCategory === "currency" ? 0 : (formPricePoints === "" ? 0 : Number(formPricePoints)),
        price_fiat: formCategory === "currency" ? (formPriceFiat === "" ? null : Number(formPriceFiat)) : null,
        price_currency: formPriceCurrency,
        gem_amount: formCategory === "currency" ? Number(formGemAmount || 0) : 0,
        bonus_gems: formCategory === "currency" ? Number(formBonusGems || 0) : 0,
        apple_product_id: formCategory === "currency" ? formAppleProductId.trim() || null : null,
        google_product_id: formCategory === "currency" ? formGoogleProductId.trim() || null : null,
        status: formStatus,
        sort_order: formSortOrder === "" ? 0 : Number(formSortOrder),
        stock_quantity: finalStock,
        is_active: formStatus === "active",
        image_url: finalImageUrl || "https://img.icons8.com/color/96/present.png",
      };

      if (editingId) {
        const { error } = await supabase
          .from("store_items")
          .update(itemData)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("store_items").insert(itemData);
        if (error) throw error;
      }

      setIsModalOpen(false);
      fetchStoreItems();
    } catch (err: any) {
      alert("Error saving store item: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteItem = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove "${name}" from the inventory?`)) return;
    const { error } = await supabase.from("store_items").delete().eq("id", id);
    if (error) alert("Error deleting item: " + error.message);
    else fetchStoreItems();
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("store_items")
      .update({ status: currentStatus ? "disabled" : "active", is_active: !currentStatus })
      .eq("id", id);
    if (error) alert("Error toggling item status: " + error.message);
    else fetchStoreItems();
  };

  const filteredItems = items.filter((item) => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-1">Admin / Store Management</p>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">Storefront Inventory</h2>
          <p className="font-body text-xs text-neutral-400 mt-1">Manage digital assets, cosmetics, and physical prize pools.</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchStoreItems} 
            className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group"
            title="Refresh Inventory"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
          <button 
            onClick={openAddModal}
            className="flex items-center gap-2 bg-[#CCFF00] px-5 py-2.5 rounded-xl text-xs font-black text-black hover:bg-[#b3e600] transition-all shadow-[0_0_20px_rgba(204,255,0,0.25)] active:scale-95"
          >
            <Plus className="w-4 h-4" /> Inject New Item
          </button>
        </div>
      </header>

      {/* FILTER BAR */}
      <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-4 flex flex-col md:flex-row gap-4 justify-between items-center shadow-xl">
        <div className="relative w-full md:w-96 group">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 group-focus-within:text-[#CCFF00] transition-colors" />
          <input 
            type="text" 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search inventory by name or SKU..." 
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] focus:bg-white/10 transition-all"
          />
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white/5 border border-white/10 text-xs font-bold text-white px-4 py-2.5 rounded-xl focus:outline-none focus:border-[#CCFF00] w-full md:w-auto appearance-none cursor-pointer"
          >
            <option value="all" className="bg-[#18181b]">All Categories</option>
            <option value="digital" className="bg-[#18181b]">Digital Cosmetics</option>
            <option value="physical" className="bg-[#18181b]">Physical Prizes</option>
            <option value="currency" className="bg-[#18181b]">Gem Packs</option>
          </select>
        </div>
      </div>

      {/* INVENTORY GRID */}
      {loading ? (
        <div className="py-20 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">
          Scanning Storefront Database...
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-16 flex flex-col items-center justify-center text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <Package className="w-8 h-8 text-neutral-500" />
          </div>
          <h3 className="font-headline text-lg font-black text-white tracking-wide">No Store Items Found</h3>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm leading-relaxed">
            {searchTerm || categoryFilter !== "all" 
              ? "No items matched your search query or selected category filter." 
              : "The storefront is currently empty. Inject a new item to populate the marketplace for your players."}
          </p>
          <button 
            onClick={openAddModal}
            className="mt-6 bg-[#CCFF00] text-black text-xs font-black px-6 py-3 rounded-xl hover:bg-[#b3e600] transition-all shadow-[0_0_15px_rgba(204,255,0,0.2)]"
          >
            Inject First Item
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map((item) => (
            <div 
              key={item.id} 
              className={`bg-[#18181b] border rounded-[24px] overflow-hidden shadow-xl flex flex-col group relative transition-all ${
                item.status === "active" ? "border-white/10 hover:border-white/20" : item.status === "draft" ? "border-amber-400/30" : "border-rose-500/20 opacity-60"
              }`}
            >
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                <button 
                  onClick={() => handleToggleActive(item.id, item.status === "active")}
                  className={`p-2 rounded-xl text-white shadow-lg transition-all ${
                    item.status === "active" ? "bg-black/60 hover:bg-rose-500" : "bg-emerald-500 hover:bg-emerald-600"
                  }`}
                  title={item.status === "active" ? "Disable Item" : "Activate Item"}
                >
                  {item.status === "active" ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => openEditModal(item)}
                  className="p-2 bg-black/60 backdrop-blur-md text-white rounded-xl hover:bg-indigo-500 shadow-lg transition-all"
                  title="Edit Item"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => handleDeleteItem(item.id, item.name)}
                  className="p-2 bg-black/60 backdrop-blur-md text-white rounded-xl hover:bg-rose-500 shadow-lg transition-all"
                  title="Delete Item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 border-b border-white/10 flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center p-2 shrink-0 overflow-hidden border border-white/10">
                  <img src={item.image_url} alt={item.name} className="w-full h-full object-contain" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">{item.sku}</span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border ${
                      item.category === "digital" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                      item.category === "physical" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                      "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                    }`}>
                      {item.category === "currency" ? "Gem Pack" : item.category}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest border ${
                      item.status === "active" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" :
                      item.status === "draft" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" :
                      "border-rose-500/20 bg-rose-500/10 text-rose-300"
                    }`}>{item.status || (item.is_active ? "active" : "disabled")}</span>
                    {item.category === "digital" && (
                      <span className="px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/20">
                        {(item.cosmetic_type || "game_cosmetic").replaceAll("_", " ")}
                      </span>
                    )}
                  </div>
                  <h3 className="font-headline text-base font-black text-white tracking-wide truncate mt-1">{item.name}</h3>
                  <p className="font-body text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">{item.description || "No description provided."}</p>
                </div>
              </div>

              <div className="p-6 flex-1 flex flex-col justify-end space-y-4 bg-white/[0.02]">
                {item.category === "currency" && (
                  <div className="flex items-center justify-between rounded-xl border border-violet-400/15 bg-violet-400/[0.06] px-3 py-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-violet-200">Grants</span>
                    <span className="font-headline text-sm font-black text-violet-300">💎 {(Number(item.gem_amount || 0) + Number(item.bonus_gems || 0)).toLocaleString()} Gems</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Coins className={`w-3.5 h-3.5 ${item.price_currency === 'fiat_usd' ? 'text-emerald-500' : item.price_currency === 'gems' ? 'text-indigo-400' : 'text-amber-500'}`} /> Price
                  </span>
                  <span className="font-headline text-base font-black text-[#CCFF00] drop-shadow-[0_0_10px_rgba(204,255,0,0.15)]">
                    {item.price_currency === 'fiat_usd' 
                      ? `$${Number(item.price_fiat).toFixed(2)} USD` 
                      : `${item.price_points.toLocaleString()} ${item.price_currency.toUpperCase()}`}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <span className="font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-indigo-400" /> Stock
                  </span>
                  <span className="font-mono text-xs font-bold text-white">
                    {item.stock_quantity === -1 ? "Infinite ∞" : `${item.stock_quantity} Units`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* --- PORTALED MODAL --- */}
      {isModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#18181b] border border-white/10 rounded-[28px] p-6 w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col my-auto">
            
            {/* FIXED HEADER */}
            <div className="flex justify-between items-center pb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#CCFF00]" />
                <h3 className="font-headline text-lg font-black text-white">
                  {editingId ? "Edit Store Item" : "Inject Store Item"}
                </h3>
              </div>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* SCROLLABLE FORM BODY */}
            <form id="store-item-form" onSubmit={handleSaveItem} className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 no-scrollbar">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Item Name</label>
                <input 
                  type="text" 
                  required 
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)} 
                  placeholder="e.g., Cyberpunk Avatar Frame"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors" 
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">SKU</label>
                  <input 
                    type="text" 
                    required 
                    value={formSku} 
                    onChange={(e) => setFormSku(e.target.value)} 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white font-mono focus:outline-none focus:border-[#CCFF00] transition-colors" 
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Category</label>
                  <select 
                    value={formCategory} 
                    onChange={handleCategoryChange} 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="digital" className="bg-[#18181b]">Digital Cosmetic</option>
                    <option value="physical" className="bg-[#18181b]">Physical Prize</option>
                    <option value="currency" className="bg-[#18181b]">Gem Pack</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Catalog Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as "draft" | "active" | "disabled")}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors appearance-none cursor-pointer"
                  >
                    <option value="draft" className="bg-[#18181b]">Draft — hidden from players</option>
                    <option value="active" className="bg-[#18181b]">Active — available to players</option>
                    <option value="disabled" className="bg-[#18181b]">Disabled — not for sale</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={formSortOrder}
                    onChange={(e) => setFormSortOrder(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                  />
                </div>
              </div>

              {formCategory === "digital" && (
                <div className="space-y-2 rounded-xl border border-[#CCFF00]/20 bg-[#CCFF00]/[0.03] p-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Cosmetic Type</label>
                    <select
                      value={formCosmeticType}
                      onChange={(e) => {
                        setFormCosmeticType(e.target.value);
                        setFormImageFile(null);
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors appearance-none cursor-pointer"
                    >
                      <option value="game_cosmetic" className="bg-[#18181b]">Game Cosmetic</option>
                      <option value="profile_card" className="bg-[#18181b]">Profile Card Background</option>
                      <option value="avatar_frame" className="bg-[#18181b]">Avatar Border</option>
                    </select>
                  </div>
                  {formCosmeticType === "profile_card" && (
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Card Layout</label>
                      <select
                        value={formProfileCardLayout}
                        onChange={(e) => setFormProfileCardLayout(e.target.value)}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors appearance-none cursor-pointer"
                      >
                        <option value="centered" className="bg-[#18181b]">Centered Avatar</option>
                        <option value="avatar_left" className="bg-[#18181b]">Avatar Socket on Left</option>
                      </select>
                    </div>
                  )}
                  <p className="text-[10px] leading-relaxed text-neutral-400">
                    {formCosmeticType === "avatar_frame"
                      ? "Avatar Border: upload a 1:1 transparent PNG or WebP (recommended 1024 × 1024). The decorative ring must sit at the outside edge; leave the centre transparent so the player photo remains visible."
                      : formCosmeticType === "profile_card"
                        ? formProfileCardLayout === "avatar_left"
                          ? "Profile Card Background: upload a 5:4 image (recommended 1500 × 1200). Place the avatar socket at 27% from the left and 50% from the top; keep the centre/right area clear for the player name."
                          : "Profile Card Background: upload a 5:4 image (recommended 1500 × 1200). Keep the centre clear for the avatar and player name."
                        : "Game Cosmetic: upload a square 1:1 image (recommended 1024 × 1024) for consistent store cards."}
                  </p>
                  {formCosmeticType === "game_cosmetic" && (
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Target Game</label>
                      <input
                        value={formGameTarget}
                        onChange={(e) => setFormGameTarget(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                        maxLength={64}
                        placeholder="e.g., carrom or checkers"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00] transition-colors"
                      />
                      <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">Items with the same target game replace one another. Different games can be equipped together.</p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Description</label>
                <textarea 
                  value={formDesc} 
                  onChange={(e) => setFormDesc(e.target.value)} 
                  rows={2} 
                  placeholder="Details about what the player receives upon redemption..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors resize-none"
                ></textarea>
              </div>

              {/* DYNAMIC PRICING SECTION */}
              <div className="flex gap-3">
                {formCategory === "currency" ? (
                  <>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Gems Granted</label>
                    <input
                      type="number"
                      min="0"
                      value={formGemAmount}
                      onChange={(e) => setFormGemAmount(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="e.g. 500"
                      className="w-full bg-white/5 border border-violet-400/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Price (USD)</label>
                    <input 
                      type="number" 
                      step="0.01"
                      min="0" 
                      value={formPriceFiat} 
                      onChange={(e) => setFormPriceFiat(e.target.value === "" ? "" : Number(e.target.value))} 
                      placeholder="e.g. 4.99"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors" 
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Bonus Gems</label>
                    <input
                      type="number"
                      min="0"
                      value={formBonusGems}
                      onChange={(e) => setFormBonusGems(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-white/5 border border-violet-400/30 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors"
                    />
                  </div>
                  </>
                ) : (
                  <div className="flex-1">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Price Amount</label>
                    <input 
                      type="number" 
                      min="0" 
                      value={formPricePoints} 
                      onChange={(e) => setFormPricePoints(e.target.value === "" ? "" : Number(e.target.value))} 
                      placeholder="100"
                      required
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors" 
                    />
                  </div>
                )}
                
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Currency</label>
                  <select 
                    value={formPriceCurrency} 
                    onChange={(e) => setFormPriceCurrency(e.target.value)} 
                    disabled={formCategory === "currency"}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {formCategory === "currency" ? (
                      <option value="fiat_usd" className="bg-[#18181b]">Fiat (USD)</option>
                    ) : (
                      <>
                        <option value="points" className="bg-[#18181b]">Points (PTS)</option>
                        <option value="gems" className="bg-[#18181b]">Gems</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              {formCategory === "currency" && (
                <div className="space-y-3 rounded-xl border border-sky-400/20 bg-sky-400/[0.04] p-3">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Apple App Store Product ID</label>
                    <input
                      value={formAppleProductId}
                      onChange={(e) => setFormAppleProductId(e.target.value.trim())}
                      placeholder="com.joeyoke.gems.500"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">Google Play Product ID</label>
                    <input
                      value={formGoogleProductId}
                      onChange={(e) => setFormGoogleProductId(e.target.value.trim())}
                      placeholder="gems_500"
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder:text-neutral-600 focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>
                  <p className="text-[10px] leading-relaxed text-sky-200">Real-money packs always grant Gems. A draft can be incomplete; an active pack requires at least one storefront product ID. Product IDs become locked after the first verified purchase.</p>
                </div>
              )}

              <div className="space-y-2 bg-white/[0.02] p-3 rounded-xl border border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-[#CCFF00]" /> Inventory Stock
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const nextState = !isInfiniteStock;
                      setIsInfiniteStock(nextState);
                      if (nextState) setFormStock(-1);
                      else setFormStock(50);
                    }}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-bold uppercase transition-all ${
                      isInfiniteStock 
                        ? "bg-[#CCFF00]/10 text-[#CCFF00] border border-[#CCFF00]/20" 
                        : "bg-white/5 text-neutral-400 border border-white/10 hover:text-white"
                    }`}
                  >
                    <InfinityIcon className="w-3 h-3" /> Infinite Stock
                  </button>
                </div>

                {!isInfiniteStock ? (
                  <input 
                    type="number" 
                    min="0" 
                    value={formStock === -1 ? "" : formStock} 
                    onChange={(e) => setFormStock(e.target.value === "" ? "" : Number(e.target.value))} 
                    placeholder="Enter available quantity (e.g. 50)"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-white focus:outline-none focus:border-[#CCFF00] transition-colors mt-2" 
                  />
                ) : (
                  <p className="text-[10px] text-neutral-500 font-medium italic mt-1">
                    This item has unlimited stock and will never run out in the store.
                  </p>
                )}
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                  Item Image{formCategory === "digital" ? ` · ${formCosmeticType === "avatar_frame" ? "1:1 transparent PNG/WebP" : formCosmeticType === "profile_card" ? "5:4" : "1:1 recommended"}` : ""}
                </label>
                <div 
                  onClick={() => imageInputRef.current?.click()} 
                  className="w-full h-20 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 hover:border-white/20 transition-all relative overflow-hidden group"
                >
                  {formImageFile ? (
                    <span className="text-xs font-bold text-emerald-400 flex flex-col items-center gap-1 relative z-10">
                      <CheckCircle2 className="w-4 h-4" /> New File Selected
                    </span>
                  ) : currentImageUrl ? (
                    <div className="flex items-center gap-3">
                      <img src={currentImageUrl} alt="Current" className="h-10 w-10 object-contain" />
                      <span className="text-[10px] text-neutral-400 font-bold uppercase">Click to replace</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 text-neutral-500 mb-1 group-hover:text-white transition-colors" />
                      <span className="text-xs text-neutral-500 font-bold">Click to upload thumbnail</span>
                    </>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" ref={imageInputRef} onChange={handleImageChange} />
              </div>
            </form>

            {/* FIXED FOOTER */}
            <div className="pt-4 border-t border-white/10 shrink-0">
              <button 
                type="submit" 
                form="store-item-form"
                disabled={uploading} 
                className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#b3e600] transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(204,255,0,0.2)] active:scale-[0.98]"
              >
                {uploading ? "Injecting..." : editingId ? "Save Item Changes" : "Inject Item to Store"}
              </button>
            </div>

          </div>
        </div>,
        document.body
      )}

    </div>
  );
}

"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { 
  FolderPlus, 
  PlusCircle, 
  RefreshCw, 
  X, 
  Upload, 
  CheckCircle2, 
  Edit2, 
  Star, 
  Trash2, 
  Gamepad2, 
  Activity 
} from "lucide-react";

// Native games are seeded into the backend catalog on every catalog load. This
// lets admins control their category, imagery, fee, status and featured state
// without relying on a client-side fallback list.
const NATIVE_GAME_CATALOG = [
  { title: "Mini Fighter", description: "Fast 1v1 arcade fighting with fighter specials, guard breaks, and rematches.", category: "Arcade", entry_fee: 0, status: "active", display_weight: 100, catalog_label: "new" },
  { title: "Cup Pong", description: "Arcade cup-toss challenge.", category: "Uncategorized", entry_fee: 0, status: "active" },
  { title: "Four in a Row", description: "Classic four-in-a-row strategy match.", category: "Uncategorized", entry_fee: 0, status: "active" },
  { title: "Bingo", description: "Fast-paced bingo card challenge.", category: "Uncategorized", entry_fee: 0, status: "active" },
  { title: "Ping Pong", description: "Table tennis arena match.", category: "Uncategorized", entry_fee: 0, status: "active" },
];

export default function GameCatalogManager() {
  const [games, setGames] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // --- MODAL STATES ---
  const [isGameModalOpen, setIsGameModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  
  const [uploadingGame, setUploadingGame] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState(false);
  
  const gameInputRef = useRef<HTMLInputElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  // --- GAME FORM STATES ---
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formFee, setFormFee] = useState<number>(0);
  const [formCategory, setFormCategory] = useState("");
  const [formDisplayWeight, setFormDisplayWeight] = useState(0);
  const [formCatalogLabel, setFormCatalogLabel] = useState("");
  const [formImage, setFormImage] = useState<File | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState("");

  // --- CATEGORY FORM STATES ---
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catIcon, setCatIcon] = useState<File | null>(null);
  const [currentCategoryIconUrl, setCurrentCategoryIconUrl] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const { data: catData } = await supabase.from("game_categories").select("*").order("name");
    if (catData) setCategories(catData);

    let { data: gameData } = await supabase.from("games").select("*").order("category").order("created_at");
    const existingTitles = new Set((gameData || []).map((game) => String(game.title).trim().toLowerCase()));
    const missingNativeGames = NATIVE_GAME_CATALOG.filter((game) => !existingTitles.has(game.title.toLowerCase()));
    if (missingNativeGames.length) {
      const { error } = await supabase.from("games").insert(missingNativeGames);
      if (error) {
        console.error("Unable to seed native game catalog:", error.message);
      } else {
        const refreshed = await supabase.from("games").select("*").order("category").order("created_at");
        gameData = refreshed.data;
      }
    }
    const { data: ratingData } = await supabase.rpc("get_game_catalog");
    if (gameData && ratingData) {
      const ratingsById = new Map(ratingData.map((game: any) => [game.id, game]));
      gameData = gameData.map((game: any) => ({ ...game, ...(ratingsById.get(game.id) as Record<string, unknown> | undefined) }));
    }
    if (gameData) setGames(gameData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ==========================================
  // CATEGORY MANAGEMENT
  // ==========================================
  const openAddCategoryModal = () => {
    setEditingCategoryId(null);
    setCatName("");
    setCatIcon(null);
    setCurrentCategoryIconUrl("");
    setIsCategoryModalOpen(true);
  };

  const openEditCategoryModal = (category: any) => {
    setEditingCategoryId(category.id);
    setCatName(category.name);
    setCatIcon(null);
    setCurrentCategoryIconUrl(category.icon_url || "");
    setIsCategoryModalOpen(true);
  };

  const handleCategoryIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) return alert("Please upload an image file.");
      if (file.size > 1024 * 1024) return alert("File too large. Max 1MB.");
      setCatIcon(file);
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return alert("Please provide a category name.");
    
    if (!editingCategoryId && !catIcon) return alert("Please provide an icon for the new category.");
    
    setUploadingCategory(true);

    try {
      let finalIconUrl = currentCategoryIconUrl;

      if (catIcon) {
        const fileExt = catIcon.name.split('.').pop();
        const fileName = `icon_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("category_icons").upload(fileName, catIcon);
        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage.from("category_icons").getPublicUrl(fileName);
        finalIconUrl = publicUrl;
      }

      const categoryData = { 
        name: catName.trim(), 
        icon_url: finalIconUrl 
      };

      if (editingCategoryId) {
        const { error: dbError } = await supabase.from("game_categories").update(categoryData).eq("id", editingCategoryId);
        if (dbError) throw dbError;
      } else {
        const { error: dbError } = await supabase.from("game_categories").insert(categoryData);
        if (dbError) throw dbError;
      }

      setCatName("");
      setCatIcon(null);
      setIsCategoryModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert("Error saving category: " + err.message);
    } finally {
      setUploadingCategory(false);
    }
  };

  // ==========================================
  // GAME MANAGEMENT
  // ==========================================
  const openAddGameModal = () => {
    setEditingId(null);
    setFormTitle("");
    setFormDesc("");
    setFormFee(0);
    setFormCategory(categories.length > 0 ? categories[0].name : "Uncategorized");
    setFormDisplayWeight(0);
    setFormCatalogLabel("");
    setFormImage(null);
    setCurrentImageUrl("");
    setIsGameModalOpen(true);
  };

  const openEditGameModal = (game: any) => {
    setEditingId(game.id);
    setFormTitle(game.title);
    setFormDesc(game.description || "");
    setFormFee(game.entry_fee);
    setFormCategory(game.category || "Uncategorized");
    setFormDisplayWeight(Number(game.display_weight || 0));
    setFormCatalogLabel(game.catalog_label || "");
    setFormImage(null);
    setCurrentImageUrl(game.image_url || "");
    setIsGameModalOpen(true);
  };

  const handleDeleteGame = async (id: string, title: string) => {
    if (!confirm(`Are you sure you want to delete "${title}"? This cannot be undone.`)) return;
    await supabase.from("games").delete().eq("id", id);
    fetchData();
  };

  const handleCycleStatus = async (gameId: string, currentStatus: string) => {
    const nextStatusMap: Record<string, string> = { 'active': 'maintenance', 'maintenance': 'hidden', 'hidden': 'active' };
    const newStatus = nextStatusMap[currentStatus] || 'active';
    await supabase.from("games").update({ status: newStatus }).eq("id", gameId);
    fetchData();
  };

  const handleToggleFeature = async (gameId: string, currentStatus: boolean) => {
    if (!currentStatus) {
      await supabase.from("games").update({ is_featured: false }).neq("id", "00000000-0000-0000-0000-000000000000");
    }

    const { error } = await supabase
      .from("games")
      .update({ is_featured: !currentStatus })
      .eq("id", gameId);

    if (error) {
      alert("Error updating featured status: " + error.message);
    } else {
      fetchData(); 
    }
  };

  const handleGameImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith("image/")) return alert("Please upload an image file.");
      if (file.size > 2 * 1024 * 1024) return alert("File too large. Max 2MB.");
      setFormImage(file);
    }
  };

  const handleSaveGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setUploadingGame(true);

    try {
      let finalImageUrl = currentImageUrl;
      if (formImage) {
        const fileExt = formImage.name.split('.').pop();
        const fileName = `game_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from("game_images").upload(fileName, formImage);
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage.from("game_images").getPublicUrl(fileName);
        finalImageUrl = publicUrl;
      }

      const gameData = {
        title: formTitle.trim(),
        description: formDesc.trim(),
        entry_fee: formFee,
        category: formCategory,
        display_weight: formDisplayWeight,
        catalog_label: formCatalogLabel || null,
        image_url: finalImageUrl || 'https://img.icons8.com/color/96/controller.png'
      };

      if (editingId) {
        await supabase.from("games").update(gameData).eq("id", editingId);
      } else {
        await supabase.from("games").insert(gameData);
      }

      setIsGameModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert("Error saving game: " + err.message);
    } finally {
      setUploadingGame(false);
    }
  };

  const groupedGames = games.reduce((acc: Record<string, any[]>, game) => {
    const category = game.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(game);
    return acc;
  }, {});

  return (
    <div className="space-y-8 animate-fade-in relative">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-white tracking-tight">Game Catalog</h2>
          <p className="font-body text-xs text-neutral-400 mt-1">Manage titles, images, categories, and matchmaking status.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={openAddCategoryModal} 
            className="flex items-center gap-2 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-indigo-500/20 transition-all shadow-lg"
          >
            <FolderPlus className="w-4 h-4" /> Add Category
          </button>
          
          <button 
            onClick={openAddGameModal} 
            className="flex items-center gap-2 bg-[#CCFF00] text-black px-4 py-2.5 rounded-xl text-xs font-black hover:bg-[#b3e600] transition-all shadow-[0_0_15px_rgba(204,255,0,0.2)]"
          >
            <PlusCircle className="w-4 h-4" /> Add Game
          </button>
          
          <button 
            onClick={fetchData} 
            className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white hover:border-white/20 transition-all shadow-lg group"
          >
            <RefreshCw className="w-4 h-4 group-hover:rotate-180 transition-transform duration-500" />
          </button>
        </div>
      </header>

      {/* --- ADD / EDIT CATEGORY MODAL --- */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-8 w-full max-w-md shadow-2xl relative">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline text-lg font-black text-white">{editingCategoryId ? "Edit Category" : "New Category"}</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">Category Name</label>
                <input 
                  type="text" 
                  required 
                  value={catName} 
                  onChange={(e) => setCatName(e.target.value)} 
                  placeholder="e.g., Arcade Classics" 
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCFF00] transition-colors" 
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">Upload Icon</label>
                <div 
                  onClick={() => categoryInputRef.current?.click()} 
                  className="w-full h-28 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 hover:border-white/20 transition-all group"
                >
                  {catIcon ? (
                    <span className="text-xs font-bold text-emerald-400 flex flex-col items-center gap-2">
                      <CheckCircle2 className="w-6 h-6" /> New Icon Selected
                    </span>
                  ) : currentCategoryIconUrl ? (
                    <div className="flex flex-col items-center">
                      <img src={currentCategoryIconUrl} alt="Current" className="h-10 w-10 object-contain opacity-80 mb-2" />
                      <span className="text-[9px] text-neutral-500 font-bold uppercase tracking-widest group-hover:text-neutral-300 transition-colors">Click to change</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-neutral-500 mb-2 group-hover:text-white transition-colors" />
                      <span className="text-xs text-neutral-500 font-bold group-hover:text-neutral-300 transition-colors">Click to browse files</span>
                    </>
                  )}
                </div>
                <input type="file" accept="image/png, image/svg+xml, image/webp" className="hidden" ref={categoryInputRef} onChange={handleCategoryIconChange} />
                <p className="text-[9px] text-neutral-500 mt-2 text-center uppercase tracking-widest">Format: PNG, SVG, WEBP | Max: 1MB</p>
              </div>

              <button type="submit" disabled={uploadingCategory} className="w-full bg-indigo-500 text-white font-black text-xs uppercase tracking-widest py-3.5 rounded-xl hover:bg-indigo-600 transition-all disabled:opacity-50 mt-2 shadow-[0_0_15px_rgba(99,102,241,0.2)]">
                {uploadingCategory ? "Deploying..." : (editingCategoryId ? "Save Category" : "Create Category")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD/EDIT GAME MODAL --- */}
      {isGameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
          <div className="bg-[#18181b] border border-white/10 rounded-[24px] p-8 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline text-lg font-black text-white">{editingId ? "Edit Game" : "Add New Game"}</h3>
              <button onClick={() => setIsGameModalOpen(false)} className="text-neutral-500 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGame} className="space-y-5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">Game Title</label>
                <input 
                  type="text" 
                  required 
                  value={formTitle} 
                  onChange={(e) => setFormTitle(e.target.value)} 
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCFF00] transition-colors" 
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">Description</label>
                <textarea 
                  value={formDesc} 
                  onChange={(e) => setFormDesc(e.target.value)} 
                  rows={3} 
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCFF00] transition-colors resize-none"
                ></textarea>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">Category</label>
                  <select 
                    value={formCategory} 
                    onChange={(e) => setFormCategory(e.target.value)} 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCFF00] transition-colors appearance-none"
                  >
                    <option value="Uncategorized" className="bg-[#18181b]">Uncategorized</option>
                    {categories.map(c => <option key={c.id} value={c.name} className="bg-[#18181b]">{c.name}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">Entry Fee (PTS)</label>
                  <input 
                    type="number" 
                    min="0" 
                    required 
                    value={formFee} 
                    onChange={(e) => setFormFee(parseInt(e.target.value) || 0)} 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCFF00] transition-colors" 
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="flex-1"><label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">Display Weight</label><input type="number" value={formDisplayWeight} onChange={(e) => setFormDisplayWeight(Number(e.target.value) || 0)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCFF00]" /><p className="mt-1 text-[9px] text-neutral-500">Higher appears first.</p></div>
                <div className="flex-1"><label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">Card Label</label><select value={formCatalogLabel} onChange={(e) => setFormCatalogLabel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#CCFF00]"><option value="">No label</option><option value="hot">Hot</option><option value="new">New</option><option value="popular">Popular</option><option value="featured">Featured</option></select></div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block mb-2">Cover Image</label>
                <div 
                  onClick={() => gameInputRef.current?.click()} 
                  className="w-full h-32 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-white/5 hover:border-white/20 transition-all relative overflow-hidden group"
                >
                  {formImage ? (
                    <span className="text-xs font-bold text-emerald-400 flex flex-col items-center gap-2 relative z-10">
                      <CheckCircle2 className="w-6 h-6" /> New Image Selected
                    </span>
                  ) : currentImageUrl ? (
                    <>
                      <img src={currentImageUrl} alt="Current" className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-30 transition-opacity" />
                      <span className="relative z-10 text-[9px] text-white font-bold uppercase tracking-widest px-3 py-1.5 bg-black/50 rounded-lg backdrop-blur-md">Change Image</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-neutral-500 mb-2 group-hover:text-white transition-colors" />
                      <span className="text-xs text-neutral-500 font-bold group-hover:text-neutral-300 transition-colors">Click to upload</span>
                    </>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" ref={gameInputRef} onChange={handleGameImageChange} />
              </div>

              <button type="submit" disabled={uploadingGame} className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3.5 rounded-xl hover:bg-[#b3e600] transition-all disabled:opacity-50 mt-2 shadow-[0_0_15px_rgba(204,255,0,0.2)]">
                {uploadingGame ? "Saving..." : "Save Game"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- CATALOG GRID --- */}
      {loading ? (
        <div className="py-12 text-center text-xs font-bold text-neutral-500 tracking-widest uppercase animate-pulse">Loading Catalog...</div>
      ) : (
        <div className="space-y-12 pt-4">
          {Object.entries(groupedGames).map(([categoryName, categoryGames]) => {
            const catData = categories.find(c => c.name === categoryName);
            return (
              <div key={categoryName}>
                
                {/* --- CATEGORY HEADER --- */}
                <div className="flex items-center gap-3 mb-6 border-b border-white/10 pb-3 group">
                  {catData ? (
                    <img src={catData.icon_url} alt="" className="w-6 h-6 object-contain filter brightness-200" onError={(e) => e.currentTarget.style.display = 'none'} />
                  ) : (
                    <Gamepad2 className="w-6 h-6 text-[#CCFF00]" />
                  )}
                  
                  <h3 className="font-headline text-lg font-black text-white uppercase tracking-wide">{categoryName}</h3>
                  
                  {catData && (
                    <button 
                      onClick={() => openEditCategoryModal(catData)}
                      className="ml-2 p-1.5 bg-white/5 text-neutral-400 rounded-lg hover:bg-white/10 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                      title="Edit Category"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <span className="ml-auto bg-white/5 border border-white/10 text-neutral-400 px-3 py-1 rounded-full text-[10px] font-bold">
                    {categoryGames.length} Game{categoryGames.length !== 1 && 's'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryGames.map((game) => (
                    <div key={game.id} className="bg-[#18181b] border border-white/10 rounded-[24px] overflow-hidden shadow-xl flex flex-col group relative hover:border-white/20 transition-colors">
                      
                      {/* QUICK ACTIONS */}
                      <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                        <button 
                          onClick={() => handleToggleFeature(game.id, game.is_featured)} 
                          className={`p-2 rounded-xl text-white shadow-lg transition-all ${game.is_featured ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]' : 'bg-black/50 backdrop-blur-md hover:bg-amber-500'}`}
                          title={game.is_featured ? "Featured on Hero Banner" : "Feature this game"}
                        >
                          <Star className={`w-4 h-4 ${game.is_featured ? 'fill-current' : ''}`} />
                        </button>
                        <button 
                          onClick={() => openEditGameModal(game)} 
                          className="p-2 bg-black/50 backdrop-blur-md text-white rounded-xl hover:bg-indigo-500 shadow-lg transition-all"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteGame(game.id, game.title)} 
                          className="p-2 bg-black/50 backdrop-blur-md text-white rounded-xl hover:bg-rose-500 shadow-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-6 border-b border-white/10 flex items-start gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center p-2 shrink-0 overflow-hidden border border-white/10">
                          <img src={game.image_url} alt={game.title} className="w-full h-full object-cover rounded-xl" />
                        </div>
                        <div>
                          <h3 className="font-headline text-base font-black text-white tracking-wide">{game.title}</h3>
                          <p className="font-body text-xs text-neutral-400 mt-1.5 line-clamp-2 leading-relaxed">{game.description}</p>
                        </div>
                      </div>

                      <div className="p-6 flex-1 flex flex-col justify-end space-y-4 bg-white/[0.02]">
                        <div className="flex items-center justify-between"><span className="font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Display</span><span className="text-xs font-bold text-white">Weight {game.display_weight || 0}{game.catalog_label ? ` · ${game.catalog_label.toUpperCase()}` : ""}</span></div>
                        <div className="flex items-center justify-between"><span className="font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Player Rating</span><span className="text-xs font-bold text-amber-400">★ {game.average_rating ? Number(game.average_rating).toFixed(1) : "—"} ({game.rating_count || 0})</span></div>
                        <div className="flex items-center justify-between">
                          <span className="font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Entry Cost</span>
                          <span className="font-headline text-sm font-black text-[#CCFF00] drop-shadow-[0_0_10px_rgba(204,255,0,0.1)]">
                            {game.entry_fee.toLocaleString()} PTS
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-headline text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Network Status</span>
                          <button 
                            onClick={() => handleCycleStatus(game.id, game.status)} 
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center gap-2 transition-all border ${
                              game.status === 'active' 
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                                : game.status === 'maintenance' 
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20' 
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full ${
                              game.status === 'active' ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 
                              game.status === 'maintenance' ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]' : 
                              'bg-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.6)]'
                            }`}></span>
                            {game.status}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

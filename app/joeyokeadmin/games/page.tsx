"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";

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

    const { data: gameData } = await supabase.from("games").select("*").order("category").order("created_at");
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
    
    // Require an icon if it's a brand new category
    if (!editingCategoryId && !catIcon) return alert("Please provide an icon for the new category.");
    
    setUploadingCategory(true);

    try {
      let finalIconUrl = currentCategoryIconUrl;

      // Only upload to storage if they actually selected a new file
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
        // UPDATE existing category
        const { error: dbError } = await supabase.from("game_categories").update(categoryData).eq("id", editingCategoryId);
        if (dbError) throw dbError;
      } else {
        // INSERT new category
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

  // --- TOGGLE FEATURED HERO BANNER ---
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

  // Group games by category
  const groupedGames = games.reduce((acc: Record<string, any[]>, game) => {
    const category = game.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(game);
    return acc;
  }, {});

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-6 relative">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-2xl font-black text-neutral-900 dark:text-white">Game Catalog</h2>
          <p className="font-body text-xs text-neutral-500 dark:text-white/60 mt-1">Manage titles, images, categories, and matchmaking status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={openAddCategoryModal} className="flex items-center gap-2 bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-indigo-600 transition-colors shadow-sm">
            <span className="material-symbols-outlined text-sm">category</span> Add Category
          </button>
          
          <button onClick={openAddGameModal} className="flex items-center gap-2 bg-[#c3f400] text-neutral-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#d4ff1a] transition-colors shadow-sm">
            <span className="material-symbols-outlined text-sm">add_circle</span> Add Game
          </button>
          
          <button onClick={fetchData} className="flex items-center gap-2 bg-neutral-100 dark:bg-white/10 px-4 py-2 rounded-lg border border-neutral-200 dark:border-white/5 text-xs font-bold hover:bg-neutral-200 dark:hover:bg-white/20 transition-colors shadow-sm">
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      </header>

      {/* --- ADD / EDIT CATEGORY MODAL --- */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline text-lg font-black dark:text-white">{editingCategoryId ? "Edit Game Category" : "New Game Category"}</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} className="text-neutral-500 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-white/60 block mb-1">Category Name</label>
                <input type="text" required value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g., Arcade Classics" className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm dark:text-white focus:outline-none focus:border-[#c3f400] transition-colors" />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-white/60 block mb-1">Upload Icon</label>
                <div onClick={() => categoryInputRef.current?.click()} className="w-full h-24 border-2 border-dashed border-neutral-300 dark:border-white/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors relative overflow-hidden">
                  {catIcon ? (
                    <span className="text-sm font-bold text-emerald-500 flex items-center gap-2"><span className="material-symbols-outlined">check_circle</span> New Icon Selected</span>
                  ) : currentCategoryIconUrl ? (
                    <div className="flex flex-col items-center">
                      <img src={currentCategoryIconUrl} alt="Current" className="h-10 w-10 object-contain opacity-70 mb-1" />
                      <span className="text-[10px] text-neutral-400 font-bold uppercase">Click to change</span>
                    </div>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-neutral-400 mb-1">upload_file</span>
                      <span className="text-xs text-neutral-500 font-bold">Click to browse files</span>
                    </>
                  )}
                </div>
                <input type="file" accept="image/png, image/jpeg, image/svg+xml, image/webp" className="hidden" ref={categoryInputRef} onChange={handleCategoryIconChange} />
                <p className="text-[9px] text-neutral-400 mt-2 text-center uppercase tracking-widest">Format: PNG, SVG, WEBP | Max: 1MB</p>
              </div>

              <button type="submit" disabled={uploadingCategory} className="w-full bg-indigo-500 text-white font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-indigo-600 transition-colors disabled:opacity-50 mt-4">
                {uploadingCategory ? "Deploying..." : (editingCategoryId ? "Save Category" : "Create Category")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- ADD/EDIT GAME MODAL --- */}
      {isGameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline text-lg font-black dark:text-white">{editingId ? "Edit Game" : "Add New Game"}</h3>
              <button onClick={() => setIsGameModalOpen(false)} className="text-neutral-500 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveGame} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-white/60 block mb-1">Game Title</label>
                <input type="text" required value={formTitle} onChange={(e) => setFormTitle(e.target.value)} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm dark:text-white focus:outline-none focus:border-[#c3f400] transition-colors" />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-white/60 block mb-1">Description</label>
                <textarea value={formDesc} onChange={(e) => setFormDesc(e.target.value)} rows={2} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm dark:text-white focus:outline-none focus:border-[#c3f400] transition-colors"></textarea>
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-white/60 block mb-1">Category</label>
                  <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm dark:text-white focus:outline-none focus:border-[#c3f400] transition-colors">
                    <option value="Uncategorized">Uncategorized</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-white/60 block mb-1">Entry Fee (PTS)</label>
                  <input type="number" min="0" required value={formFee} onChange={(e) => setFormFee(parseInt(e.target.value) || 0)} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm dark:text-white focus:outline-none focus:border-[#c3f400] transition-colors" />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-white/60 block mb-1">Cover Image</label>
                <div onClick={() => gameInputRef.current?.click()} className="w-full h-24 border-2 border-dashed border-neutral-300 dark:border-white/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors relative overflow-hidden">
                  {formImage ? (
                    <span className="text-sm font-bold text-emerald-500 flex items-center gap-2"><span className="material-symbols-outlined">check_circle</span> New Image Selected</span>
                  ) : currentImageUrl ? (
                    <img src={currentImageUrl} alt="Current" className="h-full w-full object-cover opacity-50" />
                  ) : (
                    <span className="text-xs text-neutral-500 font-bold">Click to upload</span>
                  )}
                </div>
                <input type="file" accept="image/*" className="hidden" ref={gameInputRef} onChange={handleGameImageChange} />
              </div>

              <button type="submit" disabled={uploadingGame} className="w-full bg-[#c3f400] text-neutral-900 font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#d4ff1a] transition-colors disabled:opacity-50 mt-4">
                {uploadingGame ? "Saving..." : "Save Game"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- CATALOG GRID --- */}
      {loading ? (
        <div className="py-12 text-center text-xs font-bold text-neutral-400 tracking-widest uppercase animate-pulse">Loading Catalog...</div>
      ) : (
        <div className="space-y-10 mt-6">
          {Object.entries(groupedGames).map(([categoryName, categoryGames]) => {
            const catData = categories.find(c => c.name === categoryName);
            return (
              <div key={categoryName}>
                
                {/* --- CATEGORY HEADER --- */}
                <div className="flex items-center gap-3 mb-4 border-b border-neutral-200 dark:border-white/10 pb-2 group">
                  {catData ? (
                    <img src={catData.icon_url} alt="" className="w-6 h-6 object-contain" onError={(e) => e.currentTarget.style.display = 'none'} />
                  ) : (
                    <span className="material-symbols-outlined text-[#c3f400]">sports_esports</span>
                  )}
                  
                  <h3 className="font-headline text-lg font-black text-neutral-900 dark:text-white uppercase tracking-wide">{categoryName}</h3>
                  
                  {/* EDIT CATEGORY BUTTON */}
                  {catData && (
                    <button 
                      onClick={() => openEditCategoryModal(catData)}
                      className="ml-2 p-1 bg-neutral-200 dark:bg-white/10 text-neutral-600 dark:text-white/60 rounded-md hover:bg-indigo-500 hover:text-white dark:hover:bg-indigo-500 transition-colors opacity-0 group-hover:opacity-100"
                      title="Edit Category"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                  )}

                  <span className="ml-auto bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-white/60 px-2.5 py-0.5 rounded-full text-[10px] font-bold">{categoryGames.length} Game{categoryGames.length !== 1 && 's'}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryGames.map((game) => (
                    <div key={game.id} className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm flex flex-col group relative">
                      
                      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                        {/* FEATURE / STAR BUTTON */}
                        <button 
                          onClick={() => handleToggleFeature(game.id, game.is_featured)} 
                          className={`p-1.5 rounded-lg text-white shadow-md transition-colors ${game.is_featured ? 'bg-amber-500' : 'bg-neutral-700 hover:bg-amber-500'}`}
                          title={game.is_featured ? "Featured on Hero Banner" : "Feature this game"}
                        >
                          <span className="material-symbols-outlined text-sm">star</span>
                        </button>

                        <button onClick={() => openEditGameModal(game)} className="p-1.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 shadow-md transition-colors"><span className="material-symbols-outlined text-sm">edit</span></button>
                        <button onClick={() => handleDeleteGame(game.id, game.title)} className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 shadow-md transition-colors"><span className="material-symbols-outlined text-sm">delete</span></button>
                      </div>

                      <div className="p-5 border-b border-neutral-200 dark:border-white/5 flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center p-2 shrink-0 overflow-hidden">
                          <img src={game.image_url} alt={game.title} className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <h3 className="font-headline text-sm font-black text-neutral-900 dark:text-white">{game.title}</h3>
                          <p className="font-body text-[10px] text-neutral-500 dark:text-white/50 mt-1 line-clamp-2">{game.description}</p>
                        </div>
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-end space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-caps text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Entry Cost</span>
                          <span className="font-headline text-sm font-black text-amber-500">{game.entry_fee.toLocaleString()} PTS</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-caps text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Network Status</span>
                          <button onClick={() => handleCycleStatus(game.id, game.status)} className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-colors ${game.status === 'active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : game.status === 'maintenance' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${game.status === 'active' ? 'bg-emerald-500' : game.status === 'maintenance' ? 'bg-amber-500' : 'bg-red-500'}`}></span>
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
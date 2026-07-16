"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../../lib/supabaseClient";

export default function GameCatalogManager() {
  const [games, setGames] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Category Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [catName, setCatName] = useState("");
  const [catIcon, setCatIcon] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch Categories
    const { data: catData } = await supabase.from("game_categories").select("*").order("name");
    if (catData) setCategories(catData);

    // Fetch Games
    const { data: gameData } = await supabase.from("games").select("*").order("category").order("created_at");
    if (gameData) setGames(gameData);

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // --- GAME ACTIONS ---
  const handleAdjustFee = async (gameId: string, currentFee: number, gameTitle: string) => {
    const feeStr = prompt(`Enter new entry fee for ${gameTitle} (Current: ${currentFee} PTS):`);
    if (!feeStr) return;
    
    const newFee = parseInt(feeStr, 10);
    if (isNaN(newFee) || newFee < 0) {
      alert("Invalid amount. Fee must be a positive number.");
      return;
    }

    await supabase.from("games").update({ entry_fee: newFee }).eq("id", gameId);
    fetchData();
  };

  const handleCycleStatus = async (gameId: string, currentStatus: string) => {
    const nextStatusMap: Record<string, string> = { 'active': 'maintenance', 'maintenance': 'hidden', 'hidden': 'active' };
    const newStatus = nextStatusMap[currentStatus] || 'active';
    await supabase.from("games").update({ status: newStatus }).eq("id", gameId);
    fetchData();
  };

  // --- CATEGORY CREATION ---
  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      // Validation: Type & Size
      if (!file.type.startsWith("image/")) {
        alert("Invalid file type. Please upload a PNG, SVG, JPG, or WEBP.");
        return;
      }
      if (file.size > 1024 * 1024) { // 1MB Limit
        alert("File is too large. Maximum size is 1MB.");
        return;
      }
      setCatIcon(file);
    }
  };

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim() || !catIcon) {
      alert("Please provide both a category name and an icon.");
      return;
    }

    setUploading(true);

    try {
      // 1. Upload the icon to Supabase Storage
      const fileExt = catIcon.name.split('.').pop();
      const fileName = `icon_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from("category_icons")
        .upload(fileName, catIcon);

      if (uploadError) throw uploadError;

      // 2. Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from("category_icons")
        .getPublicUrl(fileName);

      // 3. Save to Database
      const { error: dbError } = await supabase.from("game_categories").insert({
        name: catName.trim(),
        icon_url: publicUrl,
      });

      if (dbError) throw dbError;

      // Reset and refresh
      setCatName("");
      setCatIcon(null);
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      alert("Error creating category: " + err.message);
    } finally {
      setUploading(false);
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
          <p className="font-body text-xs text-neutral-500 dark:text-white/60 mt-1">Control matchmaking entry fees and dynamic categories.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-[#c3f400] text-neutral-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#d4ff1a] transition-colors shadow-sm">
            <span className="material-symbols-outlined text-sm">add_box</span> Add Category
          </button>
          <button onClick={fetchData} className="flex items-center gap-2 bg-neutral-100 dark:bg-white/10 px-4 py-2 rounded-lg border border-neutral-200 dark:border-white/5 text-xs font-bold hover:bg-neutral-200 dark:hover:bg-white/20 transition-colors shadow-sm">
            <span className="material-symbols-outlined text-sm">refresh</span> Refresh
          </button>
        </div>
      </header>

      {/* --- ADD CATEGORY MODAL --- */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-headline text-lg font-black dark:text-white">New Game Category</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-500 hover:text-white">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-white/60 block mb-1">Category Name</label>
                <input 
                  type="text" 
                  required
                  value={catName}
                  onChange={(e) => setCatName(e.target.value)}
                  placeholder="e.g., Arcade Classics"
                  className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm dark:text-white focus:outline-none focus:border-[#c3f400] transition-colors"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-white/60 block mb-1">Upload Icon</label>
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-neutral-300 dark:border-white/20 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors"
                >
                  {catIcon ? (
                    <span className="text-sm font-bold text-emerald-500 flex items-center gap-2"><span className="material-symbols-outlined">check_circle</span> {catIcon.name}</span>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-neutral-400 mb-1">upload_file</span>
                      <span className="text-xs text-neutral-500 font-bold">Click to browse files</span>
                    </>
                  )}
                </div>
                <input 
                  type="file" 
                  accept="image/png, image/jpeg, image/svg+xml, image/webp" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleIconChange}
                />
                <p className="text-[9px] text-neutral-400 mt-2 text-center uppercase tracking-widest">Format: PNG, SVG, WEBP | Max Size: 1MB | Rec: 128x128px</p>
              </div>

              <button 
                type="submit" 
                disabled={uploading}
                className="w-full bg-[#c3f400] text-neutral-900 font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#d4ff1a] transition-colors disabled:opacity-50 mt-4"
              >
                {uploading ? "Deploying..." : "Create Category"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- CATALOG GRID --- */}
      {loading ? (
        <div className="py-12 text-center text-xs font-bold text-neutral-400 tracking-widest uppercase animate-pulse">Loading Catalog Data...</div>
      ) : Object.keys(groupedGames).length === 0 ? (
        <div className="py-12 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 dark:border-white/10 rounded-2xl mt-6">No games found.</div>
      ) : (
        <div className="space-y-10 mt-6">
          {Object.entries(groupedGames).map(([categoryName, categoryGames]) => {
            // Find the custom category data to get the uploaded icon
            const catData = categories.find(c => c.name === categoryName);

            return (
              <div key={categoryName}>
                <div className="flex items-center gap-3 mb-4 border-b border-neutral-200 dark:border-white/10 pb-2">
                  {catData ? (
                    <img src={catData.icon_url} alt={categoryName} className="w-6 h-6 object-contain" />
                  ) : (
                    <span className="material-symbols-outlined text-[#c3f400]">sports_esports</span>
                  )}
                  <h3 className="font-headline text-lg font-black text-neutral-900 dark:text-white uppercase tracking-wide">
                    {categoryName}
                  </h3>
                  <span className="ml-auto bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-white/60 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                    {categoryGames.length} {categoryGames.length === 1 ? 'Game' : 'Games'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryGames.map((game) => (
                    <div key={game.id} className="bg-white dark:bg-[#111c33] border border-neutral-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm flex flex-col transition-transform hover:-translate-y-1">
                      <div className="p-5 border-b border-neutral-200 dark:border-white/5 flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center p-2 shrink-0">
                          <img src={game.image_url || "https://img.icons8.com/color/96/controller.png"} alt={game.title} className="w-full h-full object-contain drop-shadow-md" />
                        </div>
                        <div>
                          <h3 className="font-headline text-sm font-black text-neutral-900 dark:text-white">{game.title}</h3>
                          <p className="font-body text-[10px] text-neutral-500 dark:text-white/50 mt-1 line-clamp-2">{game.description}</p>
                        </div>
                      </div>

                      <div className="p-5 flex-1 flex flex-col justify-end space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="font-caps text-[9px] font-bold text-neutral-400 dark:text-white/40 uppercase tracking-widest">Entry Cost</span>
                          <div className="flex items-center gap-2">
                            <span className="font-headline text-sm font-black text-amber-500">{game.entry_fee.toLocaleString()} PTS</span>
                            <button onClick={() => handleAdjustFee(game.id, game.entry_fee, game.title)} className="p-1 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 rounded text-neutral-600 dark:text-white/60 transition-colors">
                              <span className="material-symbols-outlined text-[14px]">edit</span>
                            </button>
                          </div>
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
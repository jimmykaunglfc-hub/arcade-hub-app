"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabaseClient";
import {
  Trophy,
  Plus,
  Search,
  Calendar,
  Users,
  Coins,
  RefreshCw,
  X,
  Play,
  CheckCircle,
  Clock,
  Sparkles,
} from "lucide-react";

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form State
  const [title, setTitle] = useState("");
  const [games, setGames] = useState<string[]>(["Chess"]);
  const [prizePool, setPrizePool] = useState("10000");
  const [prizeCurrency, setPrizeCurrency] = useState<"points" | "gems">(
    "points"
  );
  const [entryFee, setEntryFee] = useState("0");
  const [entryFeeCurrency, setEntryFeeCurrency] = useState<"points" | "gems">(
    "gems"
  );
  const [cardImage, setCardImage] = useState<File | null>(null);
  const [maxPlayers, setMaxPlayers] = useState("32");
  const [rules, setRules] = useState("");
  const [terms, setTerms] = useState("");
  const [participationCurrency, setParticipationCurrency] = useState<
    "points" | "gems"
  >("points");
  const [participationReward, setParticipationReward] = useState("0");

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tournaments")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTournaments(
        (data || []).map((tournament) => ({
          ...tournament,
          game: tournament.game_title || tournament.game,
          max_players: tournament.max_slots ?? tournament.max_players,
          registered_count:
            tournament.current_slots ?? tournament.registered_count,
        }))
      );
    } catch (err: any) {
      console.error("Error fetching tournaments:", err.message);
      // Fallback mock data if table doesn't exist yet
      setTournaments([
        {
          id: "1",
          title: "Joe Yoke Grand Masters Season 1",
          game: "Chess",
          prize_pool: 25000,
          entry_fee: 50,
          registered_count: 28,
          max_players: 32,
          status: "active",
          start_date: "2026-08-01T14:00:00Z",
        },
        {
          id: "2",
          title: "Weekly Carrom Championship",
          game: "Carrom",
          prize_pool: 5000,
          entry_fee: 0,
          registered_count: 64,
          max_players: 64,
          status: "upcoming",
          start_date: "2026-08-05T18:00:00Z",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!games.length) {
      alert("Select at least one tournament game.");
      return;
    }
    setSaving(true);

    try {
      let cardImageUrl: string | null = null;
      if (cardImage) {
        if (!cardImage.type.startsWith("image/")) {
          throw new Error("Tournament card must be an image file.");
        }
        const extension = cardImage.name.split(".").pop() || "png";
        const path = `${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from("tournament-cards")
          .upload(path, cardImage, { contentType: cardImage.type });
        if (uploadError) throw uploadError;
        cardImageUrl = supabase.storage
          .from("tournament-cards")
          .getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("tournaments").insert({
        title,
        game_title: games[0],
        games,
        prize_pool: parseInt(prizePool),
        entry_fee: parseInt(entryFee),
        entry_fee_currency: entryFeeCurrency,
        card_image_url: cardImageUrl,
        max_slots: parseInt(maxPlayers),
        prize_currency: prizeCurrency,
        status: "upcoming",
        current_slots: 0,
        rules: rules.trim(),
        terms: terms.trim(),
        participation_points:
          participationCurrency === "points"
            ? parseInt(participationReward) || 0
            : 0,
        participation_gems:
          participationCurrency === "gems"
            ? parseInt(participationReward) || 0
            : 0,
      });

      if (error) throw error;
      setIsCreateModalOpen(false);
      fetchTournaments();
    } catch (err: any) {
      alert("Error creating tournament: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const setTournamentStatus = async (
    id: string,
    status: "active" | "completed"
  ) => {
    setSaving(true);
    const result =
      status === "completed"
        ? await supabase.rpc("complete_tournament", { target_tournament: id })
        : await supabase.from("tournaments").update({ status }).eq("id", id);
    setSaving(false);
    if (result.error) {
      alert(result.error.message);
      return;
    }
    fetchTournaments();
  };

  const filteredTournaments = tournaments.filter((t) => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.game.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === "all" || t.status === filter;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-8 animate-fade-in pb-16">
      {/* HEADER */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="font-headline text-3xl font-black text-white tracking-tight">
            Tournaments Engine
          </h2>
          <p className="font-body text-xs text-neutral-400 mt-1">
            Create, schedule, and oversee competitive bracket tournaments across
            all arcade games.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={fetchTournaments}
            className="flex items-center justify-center w-10 h-10 bg-[#18181b] border border-white/10 rounded-xl text-neutral-400 hover:text-white transition-all"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 bg-[#CCFF00] px-5 py-2.5 rounded-xl text-xs font-black text-black hover:bg-[#b3e600] transition-all shadow-[0_0_20px_rgba(204,255,0,0.25)] active:scale-95"
          >
            <Plus className="w-4 h-4" /> Create Tournament
          </button>
        </div>
      </header>

      {/* STATS OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#18181b] border border-white/10 p-5 rounded-[20px] shadow-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Active Events
            </p>
            <p className="font-headline text-2xl font-black text-white mt-1">
              {tournaments.filter((t) => t.status === "active").length}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center text-[#CCFF00]">
            <Play className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#18181b] border border-white/10 p-5 rounded-[20px] shadow-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Total Prize Pool
            </p>
            <p className="font-headline text-2xl font-black text-[#CCFF00] mt-1">
              {tournaments
                .reduce((acc, curr) => acc + (curr.prize_pool || 0), 0)
                .toLocaleString()}{" "}
              PTS
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#CCFF00]/10 border border-[#CCFF00]/20 flex items-center justify-center text-[#CCFF00]">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#18181b] border border-white/10 p-5 rounded-[20px] shadow-xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
              Total Registrations
            </p>
            <p className="font-headline text-2xl font-black text-white mt-1">
              {tournaments.reduce(
                (acc, curr) => acc + (curr.registered_count || 0),
                0
              )}{" "}
              Players
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH */}
      <div className="bg-[#18181b] border border-white/10 rounded-[20px] p-4 flex flex-col sm:flex-row items-center gap-4 justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tournament title or game..."
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-2 text-xs text-white placeholder:text-neutral-500 focus:outline-none focus:border-[#CCFF00]"
          />
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {["all", "upcoming", "active", "completed"].map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                filter === st
                  ? "bg-[#CCFF00] text-black border-[#CCFF00]"
                  : "bg-white/5 text-neutral-400 border-white/5 hover:text-white"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* TOURNAMENTS LIST */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading ? (
          <div className="col-span-2 py-16 text-center text-xs font-bold text-neutral-500 uppercase tracking-widest animate-pulse">
            Syncing Bracket Matrix...
          </div>
        ) : filteredTournaments.length === 0 ? (
          <div className="col-span-2 p-12 text-center text-xs text-neutral-500 bg-[#18181b] rounded-2xl border border-white/10">
            No tournaments found for this filter.
          </div>
        ) : (
          filteredTournaments.map((t) => (
            <div
              key={t.id}
              className="bg-[#18181b] border border-white/10 rounded-[24px] p-5 shadow-xl space-y-4 hover:border-white/20 transition-all"
            >
              <div className="flex justify-between items-start gap-2">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#CCFF00] bg-[#CCFF00]/10 border border-[#CCFF00]/20 px-2 py-0.5 rounded-md">
                    {t.game}
                  </span>
                  <h3 className="font-headline font-black text-white text-base mt-2">
                    {t.title}
                  </h3>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                    t.status === "active"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : t.status === "upcoming"
                      ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                      : "bg-neutral-500/10 text-neutral-400 border-neutral-500/30"
                  }`}
                >
                  {t.status === "active" && <Play className="w-3 h-3" />}
                  {t.status === "upcoming" && <Clock className="w-3 h-3" />}
                  {t.status === "completed" && (
                    <CheckCircle className="w-3 h-3" />
                  )}
                  {t.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-white/[0.02] p-3 rounded-xl border border-white/5 text-xs">
                <div>
                  <span className="text-[9px] text-neutral-500 uppercase font-bold block">
                    Prize Pool
                  </span>
                  <span className="font-bold text-[#CCFF00]">
                    {t.prize_pool?.toLocaleString()}{" "}
                    {t.prize_currency === "gems" ? "GEMS" : "PTS"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 uppercase font-bold block">
                    Entry Fee
                  </span>
                  <span className="font-bold text-white">
                    {t.entry_fee > 0
                      ? `${t.entry_fee} ${
                          t.entry_fee_currency === "points" ? "Points" : "Gems"
                        }`
                      : "Free"}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-500 uppercase font-bold block">
                    Slots
                  </span>
                  <span className="font-bold text-white">
                    {t.registered_count || 0} / {t.max_players}
                  </span>
                </div>
              </div>
              <div className="text-[11px] text-neutral-400 space-y-1">
                <p>
                  <span className="font-bold text-white">Rules:</span>{" "}
                  {t.rules || "Not configured"}
                </p>
                <p>
                  <span className="font-bold text-white">Participation:</span> +
                  {t.participation_points || 0} PTS · +
                  {t.participation_gems || 0} Gems
                </p>
              </div>
              {t.status === "upcoming" && (
                <button
                  onClick={() => void setTournamentStatus(t.id, "active")}
                  disabled={saving}
                  className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-black text-white"
                >
                  Start Tournament
                </button>
              )}
              {t.status === "active" && (
                <button
                  onClick={() => void setTournamentStatus(t.id, "completed")}
                  disabled={saving}
                  className="w-full rounded-xl bg-[#CCFF00] py-2.5 text-xs font-black text-black"
                >
                  Complete & Award Participants
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* CREATE MODAL */}
      {isCreateModalOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md sm:p-6">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="tournament-dialog-title"
              className="flex w-full max-w-xl max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#18181b] shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
            >
              <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-6 py-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-[#CCFF00]" />
                  <h3
                    id="tournament-dialog-title"
                    className="font-headline text-lg font-black text-white"
                  >
                    New Tournament
                  </h3>
                </div>
                <button
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-xl p-2 text-neutral-400 hover:bg-white/5 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form
                onSubmit={handleCreateTournament}
                className="min-h-0 overflow-y-auto space-y-4 px-6 py-5"
              >
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                    Tournament Title
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Summer Clash 2026"
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Tournament Games
                    </label>
                    <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                      {[
                        "Chess",
                        "Carrom",
                        "Checkers",
                        "Snooker",
                        "8-Ball Pool",
                        "Uno",
                        "Tic Tac Toe",
                      ].map((availableGame) => (
                        <label
                          key={availableGame}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-white"
                        >
                          <input
                            type="checkbox"
                            checked={games.includes(availableGame)}
                            onChange={() =>
                              setGames((current) =>
                                current.includes(availableGame)
                                  ? current.filter(
                                      (game) => game !== availableGame
                                    )
                                  : [...current, availableGame]
                              )
                            }
                          />
                          {availableGame}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Max Bracket Slots
                    </label>
                    <input
                      type="number"
                      required
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                    Rules
                  </label>
                  <textarea
                    value={rules}
                    onChange={(e) => setRules(e.target.value)}
                    placeholder="Format, fair-play requirements, match rules…"
                    className="w-full min-h-20 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                    Terms & Conditions
                  </label>
                  <textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    placeholder="Eligibility, conduct, prize and cancellation terms…"
                    className="w-full min-h-20 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                    Tournament card image (optional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setCardImage(e.target.files?.[0] || null)}
                    className="block w-full rounded-xl border border-dashed border-white/15 bg-white/5 px-3 py-2 text-xs text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-[#CCFF00] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-black"
                  />
                  <p className="mt-1 text-[10px] text-neutral-500">
                    Displayed on the home summary and tournament page.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Participation reward currency
                    <select
                      value={participationCurrency}
                      onChange={(e) =>
                        setParticipationCurrency(
                          e.target.value as "points" | "gems"
                        )
                      }
                      className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white"
                    >
                      <option value="points">Points</option>
                      <option value="gems">Gems</option>
                    </select>
                  </label>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                    Participation reward amount
                    <input
                      type="number"
                      min="0"
                      value={participationReward}
                      onChange={(e) => setParticipationReward(e.target.value)}
                      className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Prize pool currency
                    </label>
                    <select
                      value={prizeCurrency}
                      onChange={(e) =>
                        setPrizeCurrency(e.target.value as "points" | "gems")
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                    >
                      <option value="points">Points</option>
                      <option value="gems">Gems</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Prize pool amount
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={prizePool}
                      onChange={(e) => setPrizePool(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Entry fee currency
                    </label>
                    <select
                      value={entryFeeCurrency}
                      onChange={(e) =>
                        setEntryFeeCurrency(e.target.value as "points" | "gems")
                      }
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                    >
                      <option value="points">Points</option>
                      <option value="gems">Gems</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
                      Entry fee amount
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      value={entryFee}
                      onChange={(e) => setEntryFee(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-[#CCFF00]"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-[#CCFF00] text-black font-black text-xs uppercase tracking-widest py-3 rounded-xl hover:bg-[#b3e600] transition-all shadow-[0_0_15px_rgba(204,255,0,0.2)]"
                >
                  {saving ? "Publishing..." : "Publish Tournament"}
                </button>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

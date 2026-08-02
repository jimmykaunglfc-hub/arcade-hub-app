"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import MatchmakingModal from "@/components/MatchmakingModal";

type TournamentPageProps = { params: Promise<{ id: string }> };

export default function TournamentLandingPage({ params }: TournamentPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [tournament, setTournament] = useState<any | null>(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<
    "overview" | "rules" | "games" | "leaderboard"
  >("overview");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [findingGame, setFindingGame] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [gameCards, setGameCards] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    const [{ data: event, error }, { data: authData }] = await Promise.all([
      supabase.from("tournaments").select("*").eq("id", id).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    if (error || !event) {
      setMessage(error?.message || "Tournament not found.");
      setLoading(false);
      return;
    }
    setTournament(event);
    setCurrentUserId(authData.user?.id || null);
    const [entryResult, leaderboardResult, fixturesResult, gameCardsResult] =
      await Promise.all([
        authData.user
          ? supabase
              .from("tournament_entries")
              .select("id")
              .eq("tournament_id", id)
              .eq("user_id", authData.user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("tournament_leaderboard")
          .select("*, profiles(username, avatar_url)")
          .eq("tournament_id", id)
          .order("rank")
          .limit(50),
        supabase
          .from("tournament_matches")
          .select(
            "*, player_one:profiles!tournament_matches_player_one_id_fkey(username), player_two:profiles!tournament_matches_player_two_id_fkey(username)"
          )
          .eq("tournament_id", id)
          .order("round_number", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("games")
          .select("title, image_url")
          .eq("status", "active"),
      ]);
    setJoined(Boolean(entryResult.data));
    setLeaderboard(leaderboardResult.data || []);
    setFixtures(fixturesResult.data || []);
    setGameCards(gameCardsResult.data || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [id]);

  const join = async () => {
    setJoining(true);
    setMessage("");
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setMessage("Sign in to join this tournament.");
      setJoining(false);
      return;
    }
    const { error } = await supabase.rpc("register_for_tournament", {
      target_tournament: id,
    });
    if (error) {
      setMessage(error.message);
    } else {
      setJoined(true);
      setMessage("You are registered. Good luck!");
      await load();
    }
    setJoining(false);
  };

  if (loading)
    return (
      <main className="min-h-screen bg-background p-6 text-on-background">
        Loading tournament…
      </main>
    );
  if (!tournament)
    return (
      <main className="min-h-screen bg-background p-6 text-on-background">
        {message}
      </main>
    );

  const games = tournament.games?.length
    ? tournament.games
    : [tournament.game_title || tournament.game].filter(Boolean);
  const prizeCurrency =
    tournament.prize_currency === "gems" ? "Gems" : "Points";
  const feeCurrency =
    tournament.entry_fee_currency === "points" ? "Points" : "Gems";
  const topThree = leaderboard.slice(0, 3);
  const topTen = leaderboard.slice(3, 10);
  const myRow = currentUserId
    ? leaderboard.find((row) => row.user_id === currentUserId)
    : null;
  const getGameImage = (game: string) =>
    gameCards.find(
      (item) =>
        item.title.toLowerCase().replace(/[^a-z0-9]/g, "") ===
        game.toLowerCase().replace(/[^a-z0-9]/g, "")
    )?.image_url;

  const startTournamentMatchmaking = (gameName: string) => {
    if (!currentUserId) return setMessage("Sign in to play tournament games.");
    setFindingGame(gameName);
  };

  return (
    <main className="h-[100dvh] overflow-hidden bg-background px-4 text-on-background" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex h-full min-w-0 max-w-2xl flex-col">
        <button
          onClick={() => router.replace("/")}
          className="z-50 -mx-4 mb-3 block w-[calc(100%+2rem)] shrink-0 border-b border-surface-container-highest bg-background px-4 py-4 text-left text-sm font-bold text-primary"
        >
          ← Back to home
        </button>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[26px] border border-surface-container-highest bg-surface shadow-2xl">
          {tournament.card_image_url ? (
            <img
              src={tournament.card_image_url}
              alt=""
              className="aspect-[16/7] w-full bg-surface-container object-cover object-center"
            />
          ) : (
            <div className="aspect-[16/7] bg-[radial-gradient(circle_at_80%_5%,rgba(204,255,0,.28),transparent_35%),linear-gradient(135deg,var(--surface-container-high),var(--surface))]" />
          )}
          <div className="flex min-h-0 flex-1 flex-col p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-500">
              {tournament.status} tournament
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">
              {tournament.title}
            </h1>
            <p className="mt-1 text-sm font-medium text-[#52627a] dark:text-[#b7c1d1]">
              {games.join(" · ")}
            </p>

            <div className="mt-5 grid grid-cols-3 divide-x divide-surface-container-highest rounded-xl border border-surface-container-highest bg-surface-container text-center text-sm">
              <Info
                label="Players"
                value={`${tournament.current_slots ?? 0}/${
                  tournament.max_slots ?? tournament.max_players
                }`}
              />
              <Info
                label="Prize pool"
                value={`${Number(
                  tournament.prize_pool || 0
                ).toLocaleString()} ${prizeCurrency}`}
              />
              <Info
                label="Entry fee"
                value={
                  Number(tournament.entry_fee || 0)
                    ? `${Number(
                        tournament.entry_fee
                      ).toLocaleString()} ${feeCurrency}`
                    : "Free"
                }
              />
            </div>

            <div className="mt-6 grid min-w-0 grid-cols-4 border-b border-surface-container-highest text-center text-[11px] font-bold sm:text-xs">
              <TabButton
                active={tab === "overview"}
                onClick={() => setTab("overview")}
              >
                Overview
              </TabButton>
              <TabButton
                active={tab === "rules"}
                onClick={() => setTab("rules")}
              >
                Rules
              </TabButton>
              <TabButton
                active={tab === "games"}
                onClick={() => setTab("games")}
              >
                Games
              </TabButton>
              <TabButton
                active={tab === "leaderboard"}
                onClick={() => setTab("leaderboard")}
              >
                Leaderboard
              </TabButton>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-1 no-scrollbar">
            {tab === "overview" && (
              <>
                <Section title="About tournament">
                  {tournament.terms ||
                    "A dedicated competitive event. Tournament results never affect the normal game lobby."}
                </Section>
                <Section title="Prize pool">{`${Number(
                  tournament.prize_pool || 0
                ).toLocaleString()} ${prizeCurrency}. Final placements and prizes are published by the tournament organizer.`}</Section>
              </>
            )}
            {tab === "rules" && (
              <>
                <Section title="General rules">
                  {tournament.rules || "Standard game rules apply."}
                </Section>
                <Section title="Terms & conditions">
                  {tournament.terms ||
                    "By joining, you agree to follow the tournament rules and fair-play requirements."}
                </Section>
              </>
            )}
            {tab === "games" && (
              <section className="mt-6 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {games.map((game: string) => (
                    <button
                      key={game}
                      onClick={() => startTournamentMatchmaking(game)}
                      className="rounded-2xl border border-surface-container-highest bg-surface-container p-3 text-xs font-bold text-on-surface hover:border-primary"
                    >
                      {getGameImage(game) ? (
                        <img
                          src={getGameImage(game)}
                          alt=""
                          className="mb-2 h-12 w-full rounded-xl object-cover"
                        />
                      ) : (
                        <span className="mb-2 block text-2xl">🎮</span>
                      )}
                      {game}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {tab === "leaderboard" && (
              <section className="mt-6">
                <p className="mb-3 text-xs text-on-surface-variant">
                  Score: win {tournament.win_points ?? 3}, draw{" "}
                  {tournament.draw_points ?? 1}, loss{" "}
                  {tournament.loss_points ?? -1}. Ties use wins, fewer losses,
                  matches played, then registration time.
                </p>
                {leaderboard.length ? (
                  <>
                    <div className="mb-5 grid grid-cols-3 items-end gap-2">
                      {topThree.map((row, index) => (
                        <div
                          key={row.user_id}
                          className={`rounded-2xl border p-3 text-center ${
                            index === 0
                              ? "order-2 border-amber-300 bg-amber-300/10 py-5"
                              : index === 1
                              ? "order-1 border-slate-400 bg-slate-400/10"
                              : "order-3 border-orange-300 bg-orange-300/10"
                          }`}
                        >
                          <div className="text-2xl">
                            {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                          </div>
                          <b className="mt-1 block truncate text-xs">
                            {row.profiles?.username || "Player"}
                          </b>
                          <span className="text-xs text-slate-400">
                            {row.score} pts
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {topTen.map((row) => (
                        <div
                          key={row.user_id}
                          className={`grid grid-cols-[2rem_1fr_auto] items-center rounded-xl p-3 text-sm ${
                            row.user_id === currentUserId
                              ? "border border-[#CCFF00] bg-[#CCFF00]/10"
                              : "bg-surface-container"
                          }`}
                        >
                          <b className="text-primary">#{row.rank}</b>
                          <span>
                            {row.profiles?.username || "Player"}
                            <small className="ml-2 text-on-surface-variant">
                              {row.wins}W · {row.draws}D · {row.losses}L
                            </small>
                          </span>
                          <b>{row.score} pts</b>
                        </div>
                      ))}
                      {myRow && myRow.rank > 10 && (
                        <>
                          <div className="my-3 flex items-center gap-2 text-xs text-slate-500">
                            <span className="h-px flex-1 bg-slate-700" />↕ Your
                            rank
                            <span className="h-px flex-1 bg-slate-700" />
                          </div>
                          <div className="grid grid-cols-[2rem_1fr_auto] items-center rounded-xl border border-[#CCFF00] bg-[#CCFF00]/10 p-3 text-sm">
                            <b className="text-[#CCFF00]">#{myRow.rank}</b>
                            <span className="font-bold">
                              {myRow.profiles?.username || "You"}
                              <small className="ml-2 text-slate-400">
                                {myRow.wins}W · {myRow.losses}L
                              </small>
                            </span>
                            <b>{myRow.score} pts</b>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <Empty text="The leaderboard starts after fixtures are completed." />
                )}
              </section>
            )}

            {message && (
              <p className="mt-5 text-sm font-bold text-primary">{message}</p>
            )}
            </div>
            <button
              onClick={() => void join()}
              disabled={joined || joining || tournament.status === "completed"}
              className="mt-4 w-full shrink-0 rounded-xl bg-primary py-3.5 text-sm font-black text-on-primary disabled:opacity-60"
            >
              {joined ? "Registered" : joining ? "Joining…" : "Join tournament"}
            </button>
          </div>
        </section>
      </div>
      {findingGame && currentUserId && (
        <MatchmakingModal
          gameKey={findingGame.toLowerCase()}
          gameName={findingGame}
          userId={currentUserId}
          onCancel={() => setFindingGame(null)}
          onMatchFound={(match) => {
            sessionStorage.setItem(
              "tournament_match_launch",
              JSON.stringify({ game: findingGame, matchId: match.matchId })
            );
            router.push("/");
          }}
        />
      )}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-[#64748b] dark:text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-bold text-on-surface">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <section className="mt-6">
      <h2 className="text-base font-black">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#52627a] dark:text-slate-300">
        {children}
      </p>
    </section>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`border-b-2 px-1 py-3 ${
        active
          ? "border-[#CCFF00] text-[#CCFF00]"
          : "border-transparent text-[#64748b] dark:text-slate-400"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl border border-slate-700 bg-[#1a2030] p-4 text-sm text-slate-400">
      {text}
    </p>
  );
}

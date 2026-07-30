"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type TournamentPageProps = { params: Promise<{ id: string }> };

export default function TournamentLandingPage({ params }: TournamentPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [tournament, setTournament] = useState<any | null>(null);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"overview" | "games" | "leaderboard">(
    "overview"
  );
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);

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
    const [entryResult, leaderboardResult, fixturesResult] = await Promise.all([
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
    ]);
    setJoined(Boolean(entryResult.data));
    setLeaderboard(leaderboardResult.data || []);
    setFixtures(fixturesResult.data || []);
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

  return (
    <main className="min-h-screen bg-background px-5 py-6 text-on-background">
      <div className="mx-auto max-w-2xl">
        <button
          onClick={() => router.back()}
          className="mb-5 text-xs font-bold text-primary"
        >
          ← Back to home
        </button>
        <section className="overflow-hidden rounded-[28px] border border-surface-container-highest bg-surface shadow-xl">
          {tournament.card_image_url ? (
            <img
              src={tournament.card_image_url}
              alt=""
              className="h-48 w-full object-cover"
            />
          ) : (
            <div className="h-28 bg-gradient-to-br from-amber-500/35 to-primary/30" />
          )}
          <div className="p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-500">
              {tournament.status} tournament
            </p>
            <h1 className="mt-2 text-3xl font-black">{tournament.title}</h1>
            <p className="mt-2 text-sm text-on-surface-variant">
              {games.join(" · ")}
            </p>

            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
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
              <Info
                label="Participation reward"
                value={`+${tournament.participation_points || 0} Points · +${
                  tournament.participation_gems || 0
                } Gems`}
              />
            </div>

            <div className="mt-7 grid grid-cols-3 rounded-xl bg-surface-container p-1 text-xs font-bold">
              <TabButton
                active={tab === "overview"}
                onClick={() => setTab("overview")}
              >
                Rules & prizes
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

            {tab === "overview" && (
              <>
                <Section title="Rules">
                  {tournament.rules || "Standard game rules apply."}
                </Section>
                <Section title="Prize pool">{`${Number(
                  tournament.prize_pool || 0
                ).toLocaleString()} ${prizeCurrency}. Final placements and prizes are published by the tournament organizer.`}</Section>
                <Section title="Terms & conditions">
                  {tournament.terms ||
                    "By joining, you agree to follow the tournament rules and fair-play requirements."}
                </Section>
              </>
            )}
            {tab === "games" && (
              <section className="mt-6 space-y-3">
                <p className="text-sm text-on-surface-variant">
                  Tournament games are separate from the normal game lobby. Play
                  only the game and opponent listed in your scheduled fixture.
                </p>
                <div className="flex flex-wrap gap-2">
                  {games.map((game: string) => (
                    <span
                      key={game}
                      className="rounded-full bg-primary-container px-3 py-1.5 text-xs font-bold text-on-primary-container"
                    >
                      {game}
                    </span>
                  ))}
                </div>
                <h2 className="pt-2 text-sm font-black">Fixtures</h2>
                {fixtures.length ? (
                  fixtures.map((fixture) => (
                    <div
                      key={fixture.id}
                      className="rounded-xl bg-surface-container p-3 text-sm"
                    >
                      <div className="flex justify-between gap-3">
                        <b>
                          Round {fixture.round_number} · {fixture.game_name}
                        </b>
                        <span className="capitalize text-on-surface-variant">
                          {fixture.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="mt-2">
                        {fixture.player_one?.username || "Player 1"}{" "}
                        <span className="text-on-surface-variant">vs</span>{" "}
                        {fixture.player_two?.username || "Player 2"}
                      </p>
                    </div>
                  ))
                ) : (
                  <Empty text="Fixtures will appear here when the organizer starts the first round." />
                )}
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
                  <div className="space-y-2">
                    {leaderboard.map((row) => (
                      <div
                        key={row.user_id}
                        className="grid grid-cols-[2rem_1fr_auto] items-center rounded-xl bg-surface-container p-3 text-sm"
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
                  </div>
                ) : (
                  <Empty text="The leaderboard starts after fixtures are completed." />
                )}
              </section>
            )}

            {message && (
              <p className="mt-5 text-sm font-bold text-primary">{message}</p>
            )}
            <button
              onClick={() => void join()}
              disabled={joined || joining || tournament.status === "completed"}
              className="mt-6 w-full rounded-xl bg-primary py-3.5 text-sm font-black text-on-primary disabled:opacity-60"
            >
              {joined ? "Registered" : joining ? "Joining…" : "Join tournament"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
        {label}
      </p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-black">{title}</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-on-surface-variant">
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
      className={`rounded-lg px-2 py-2 ${
        active ? "bg-primary text-on-primary" : "text-on-surface-variant"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="rounded-xl bg-surface-container p-4 text-sm text-on-surface-variant">
      {text}
    </p>
  );
}

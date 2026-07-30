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
    if (authData.user) {
      const { data: entry } = await supabase
        .from("tournament_entries")
        .select("id")
        .eq("tournament_id", id)
        .eq("user_id", authData.user.id)
        .maybeSingle();
      setJoined(Boolean(entry));
    }
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

            <Section title="Rules">
              {tournament.rules || "Standard game rules apply."}
            </Section>
            <Section title="Terms & conditions">
              {tournament.terms ||
                "By joining, you agree to follow the tournament rules and fair-play requirements."}
            </Section>

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

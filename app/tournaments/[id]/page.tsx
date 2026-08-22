import TournamentLandingClient from "./TournamentLandingClient";

type TournamentIndexRow = { id: string };

// Capacitor packages use Next's static export. Build the currently known
// tournament detail pages so the native app can navigate to them without a
// runtime Next server; the client component still loads live tournament data.
export async function generateStaticParams(): Promise<{ id: string }[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return [];

  try {
    const response = await fetch(
      `${url}/rest/v1/tournaments?select=id`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        cache: "force-cache",
      },
    );
    if (!response.ok) return [];
    const tournaments = await response.json() as TournamentIndexRow[];
    return tournaments
      .filter((tournament) => typeof tournament.id === "string" && tournament.id.length > 0)
      .map((tournament) => ({ id: tournament.id }));
  } catch {
    // Do not expose credentials or make the web deployment unavailable when a
    // release machine cannot fetch the tournament catalogue.
    return [];
  }
}

export default async function TournamentLandingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TournamentLandingClient id={id} />;
}

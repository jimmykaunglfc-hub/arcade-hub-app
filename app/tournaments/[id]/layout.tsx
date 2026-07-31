import { createClient } from "@supabase/supabase-js";

export const dynamicParams = false;

export async function generateStaticParams() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data } = await supabase
    .from("tournaments")
    .select("id")
    .in("status", ["active", "upcoming"])
    .limit(100);

  return (data || []).map((tournament) => ({
    id: String(tournament.id),
  }));
}

export default function TournamentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
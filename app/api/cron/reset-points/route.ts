import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase with Service Role Key to bypass RLS for admin operations
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  // Verify Cron Secret header to prevent unauthorized trigger
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // The database checks the configured cadence. Calling this route daily is
    // safe: it only applies an expiry when the next cycle is due.
    const { data, error } = await supabaseAdmin.rpc("expire_points_by_policy", { p_force: false });

    if (error) throw error;

    return NextResponse.json({
      message: "Point-expiry cycle checked successfully",
      result: data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

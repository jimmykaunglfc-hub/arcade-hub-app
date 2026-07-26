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
    // 1. Fetch current schedule configuration
    const { data: configData } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "points_reset_config")
      .single();

    const config = configData?.value || { enabled: true, schedule: "monthly" };

    if (!config.enabled) {
      return NextResponse.json({ message: "Points reset is disabled in system settings." });
    }

    // 2. Execute the database reset function
    const { data, error } = await supabaseAdmin.rpc("reset_all_user_points");

    if (error) throw error;

    return NextResponse.json({
      message: "Points reset completed successfully",
      result: data,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
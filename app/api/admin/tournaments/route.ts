// app/api/admin/tournaments/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { title, game_title, prize_pool, entry_fee, max_slots, status } = body;

    if (!title || !game_title || !prize_pool) {
      return NextResponse.json({ error: "Missing required tournament parameters" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("tournaments")
      .insert([
        {
          title,
          game_title,
          prize_pool,
          entry_fee: entry_fee || "Free",
          max_slots: max_slots || 32,
          current_slots: 0,
          status: status || "upcoming", // 'upcoming', 'active', 'completed'
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, tournament: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ tournaments: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
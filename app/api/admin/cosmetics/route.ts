// app/api/admin/cosmetics/route.ts
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { game_category, name, description, price_gems, image_url, modifiers } = body;

    // Validation
    if (!game_category || !name || price_gems === undefined) {
      return NextResponse.json({ error: "Missing required fields (game_category, name, price_gems)" }, { status: 400 });
    }

    // Insert into Supabase `cosmetics` table
    const { data, error } = await supabase
      .from("cosmetics")
      .insert([
        {
          game_category,
          name,
          description,
          price_gems,
          image_url,
          modifiers: modifiers || {},
        },
      ])
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, item: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

// Optional: GET route to fetch all store items for the admin inventory list
export async function GET() {
  try {
    const { data, error } = await supabase
      .from("cosmetics")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ items: data }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
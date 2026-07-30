"use client";

import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type AccountRequest = { id: string; request_type: string; details: string; status: string; created_at: string; user_id: string; reviewer_note?: string | null };
type Faq = { id: string; question: string; answer: string; sort_order: number; is_published: boolean };

export default function SupportManagementPage() {
  const [requests, setRequests] = useState<AccountRequest[]>([]);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    const [requestResult, faqResult] = await Promise.all([
      supabase.from("account_requests").select("*").order("created_at", { ascending: false }),
      supabase.from("support_faqs").select("*").order("sort_order"),
    ]);
    setRequests(requestResult.data || []); setFaqs(faqResult.data || []);
    setError(requestResult.error?.message || faqResult.error?.message || "");
  };
  useEffect(() => { void load(); }, []);
  const review = async (request: AccountRequest, status: "approved" | "rejected") => {
    const { data: { user } } = await supabase.auth.getUser();
    const note = window.prompt(`Optional note for the ${status} decision:`) || null;
    const { error: updateError } = await supabase.from("account_requests").update({ status, reviewed_by: user?.id, reviewer_note: note, reviewed_at: new Date().toISOString() }).eq("id", request.id);
    if (updateError) { setError(updateError.message); return; }
    if (request.user_id) await supabase.from("user_notifications").insert({ user_id: request.user_id, title: "Account request updated", message: `Your ${request.request_type.replace("_", " ")} request was ${status}.${note ? ` ${note}` : ""}`, kind: "account" });
    void load();
  };
  const addFaq = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true);
    const { error: insertError } = await supabase.from("support_faqs").insert({ question: question.trim(), answer: answer.trim(), sort_order: faqs.length });
    setSaving(false);
    if (insertError) { setError(insertError.message); return; }
    setQuestion(""); setAnswer(""); void load();
  };
  return <div className="space-y-8 pb-12"><header><h2 className="font-headline text-3xl font-black text-white">Support & Account Requests</h2><p className="text-xs text-neutral-400 mt-1">Review player account requests and publish the Help & Support FAQ.</p></header>{error && <p className="rounded-xl bg-rose-500/10 text-rose-300 p-3 text-xs">{error}</p>}<section className="bg-[#18181b] border border-white/10 rounded-3xl overflow-hidden"><div className="p-5 border-b border-white/10 flex justify-between"><h3 className="font-bold">Account requests</h3><button onClick={() => void load()} className="text-xs text-[#CCFF00] font-bold">Refresh</button></div>{requests.length ? <div className="divide-y divide-white/5">{requests.map(request => <div key={request.id} className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-bold capitalize">{request.request_type.replace("_", " ")} <span className="ml-2 text-[10px] text-neutral-400">{request.status}</span></p><p className="text-xs text-neutral-400 mt-1">{request.details}</p><p className="text-[10px] text-neutral-500 mt-2">{new Date(request.created_at).toLocaleString()} · {request.user_id}</p></div>{request.status === "pending" && <div className="flex gap-2"><button onClick={() => void review(request, "approved")} className="px-3 py-2 rounded-xl bg-emerald-500 text-xs font-bold text-white">Approve</button><button onClick={() => void review(request, "rejected")} className="px-3 py-2 rounded-xl bg-rose-500 text-xs font-bold text-white">Reject</button></div>}</div>)}</div> : <p className="p-5 text-xs text-neutral-500">No account requests.</p>}</section><section className="grid md:grid-cols-2 gap-6"><form onSubmit={addFaq} className="bg-[#18181b] border border-white/10 rounded-3xl p-5 space-y-3"><h3 className="font-bold">Publish FAQ</h3><input required value={question} onChange={e => setQuestion(e.target.value)} placeholder="Question" className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm"/><textarea required value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Answer" className="w-full min-h-28 bg-white/5 border border-white/10 rounded-xl p-3 text-sm"/><button disabled={saving} className="bg-[#CCFF00] text-black px-4 py-2.5 rounded-xl text-xs font-black">{saving ? "Saving…" : "Publish FAQ"}</button></form><div className="bg-[#18181b] border border-white/10 rounded-3xl p-5"><h3 className="font-bold mb-3">Published FAQs</h3><div className="space-y-3">{faqs.map(faq => <div key={faq.id} className="rounded-xl bg-white/5 p-3"><p className="text-xs font-bold">{faq.question}</p><p className="text-xs text-neutral-400 mt-1">{faq.answer}</p><button onClick={() => void supabase.from("support_faqs").delete().eq("id", faq.id).then(load)} className="mt-2 text-[10px] font-bold text-rose-400">Remove</button></div>)}{!faqs.length && <p className="text-xs text-neutral-500">No FAQs published.</p>}</div></div></section></div>;
}

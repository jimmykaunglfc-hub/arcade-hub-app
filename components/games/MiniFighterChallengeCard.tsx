"use client";

type ChallengeProps = {
  challenger?: string;
  challengerFighter?: string;
  playerFighter?: string;
  record?: string;
  onAccept?: () => void;
  onDecline?: () => void;
};

/** Compact social surface for chat, profiles, and activity feeds. */
export default function MiniFighterChallengeCard({
  challenger = "Alex",
  challengerFighter = "Ninja",
  playerFighter = "Brawler",
  record = "8 — 6",
  onAccept,
  onDecline,
}: ChallengeProps) {
  return (
    <section className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#11151D] p-4 font-sans text-[#F7F8FA] shadow-xl">
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[.18em] text-[#22D3EE]"><span>Fight challenge</span><span className="material-symbols-outlined text-base">swords</span></div>
      <p className="mt-3 text-sm font-bold"><span className="text-[#F7F8FA]">{challenger}</span> challenged you</p>
      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center">
        <div><div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#7C5CFF]/20 text-xl">🥷</div><b className="mt-1 block text-xs">{challenger}</b><span className="text-[10px] text-[#969EAE]">{challengerFighter}</span></div>
        <span className="text-xs font-black italic text-[#FF4D67]">VS</span>
        <div><div className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[#FFB020]/15 text-xl">🥊</div><b className="mt-1 block text-xs">You</b><span className="text-[10px] text-[#969EAE]">{playerFighter}</span></div>
      </div>
      <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-wider text-[#969EAE]">Head to head <span className="ml-1 text-[#F7F8FA]">{record}</span></p>
      <div className="mt-4 flex gap-2"><button onClick={onAccept} className="h-11 flex-1 rounded-xl bg-[#7C5CFF] text-xs font-black tracking-wide active:scale-[.97]">ACCEPT FIGHT</button><button onClick={onDecline} className="h-11 rounded-xl border border-white/10 px-4 text-xs font-bold text-[#969EAE] active:scale-[.97]">DECLINE</button></div>
    </section>
  );
}

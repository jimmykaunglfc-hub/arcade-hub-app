"use client";




import { tr } from "../lib/i18n";
import { LocalizedText } from "../lib/i18n";
type Props = {
  gameName: string;
  entryFee?: number;
  onOnline: () => void;
  onHost: () => void;
  onLocal: () => void;
  onExit: () => void;
  roomCode?: string;
  setRoomCode?: (value: string) => void;
  onJoin?: () => void;
  showLocal?: boolean;
};

export default function GameEngagementMenu({
  gameName, entryFee = 0, onOnline, onHost, onLocal, onExit,
  roomCode, setRoomCode, onJoin, showLocal = true,
}: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#09090b] p-5 font-sans text-white select-none" style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))", paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
      <div className={`relative flex w-full max-w-[360px] flex-col overflow-hidden rounded-[32px] border border-white/5 bg-[#18181b] p-6 shadow-2xl ${showLocal ? "" : "py-10"}`}>
        <div className="mb-6 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5"><span className="material-symbols-outlined text-2xl text-[#38bdf8]">sports_bar</span></div>
          <div><h1 className="font-headline text-xl font-black uppercase tracking-tight text-white">{gameName}</h1><p className="mt-0.5 text-xs font-medium text-neutral-400"><LocalizedText id="UI_0317" fallback="Select engagement mode" /></p></div>
        </div>

        <button onClick={onOnline} data-requires-auth className="group relative mb-4 w-full rounded-[24px] border border-white/10 bg-[#09090b] p-5 text-left transition-all hover:border-[#CCFF00]/50 hover:bg-white/5 touch-manipulation">
          <div className="mb-4 flex items-start justify-between"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#CCFF00]/10 text-[#CCFF00]"><span className="material-symbols-outlined text-xl">search</span></div><span className="rounded-full bg-[#CCFF00]/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#CCFF00]">{entryFee} <LocalizedText id="UI_0338" fallback="PTS" /></span></div>
          <h3 className="font-headline mb-1 text-lg font-black text-white transition-colors group-hover:text-[#CCFF00]"><LocalizedText id="UI_0311" fallback="Find Online Match" /></h3>
          <p className="text-xs font-medium leading-relaxed text-neutral-400"><LocalizedText id="UI_0340" fallback="Ranked &amp; casual global" /><br />matchmaking</p>
        </button>

        <div className={`mb-6 grid gap-4 ${showLocal ? "grid-cols-2" : "grid-cols-1"}`}>
          <button onClick={onHost} data-requires-auth className={`group flex flex-col justify-between rounded-[24px] border border-white/10 bg-[#09090b] text-left transition-all hover:border-teal-500/50 hover:bg-white/5 touch-manipulation ${showLocal ? "min-h-[140px] p-4" : "min-h-[220px] p-6"}`}>
            <div className="flex w-full items-start justify-between"><div className={`flex items-center justify-center rounded-xl bg-teal-500/10 text-teal-400 ${showLocal ? "h-9 w-9" : "h-12 w-12"}`}><span className="material-symbols-outlined text-xl">dns</span></div><span className="rounded-full bg-teal-500/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-teal-400"><LocalizedText id="UI_0316" fallback="Private" /></span></div>
            <div><h3 className={`font-headline mb-1 font-bold text-white ${showLocal ? "text-sm" : "text-xl"}`}><LocalizedText id="UI_0312" fallback="Host Play" /></h3><p className={`${showLocal ? "text-[10px]" : "text-xs"} font-medium text-neutral-400`}><LocalizedText id="UI_0342" fallback="Create room code" /></p></div>
          </button>
          {showLocal && <button onClick={onLocal} className="group flex min-h-[140px] flex-col justify-between rounded-[24px] border border-white/10 bg-[#09090b] p-4 text-left transition-all hover:border-pink-500/50 hover:bg-white/5 touch-manipulation"><div className="flex w-full items-start justify-between"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-pink-500/10 text-pink-400"><span className="material-symbols-outlined text-lg">sports_esports</span></div><span className="shrink-0 self-start rounded-full bg-pink-500/10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider leading-none text-pink-400"><LocalizedText id="UI_0147" fallback={tr("UI_0147", "Offline")} /></span></div><div><h3 className="font-headline mb-0.5 text-sm font-bold text-white"><LocalizedText id="UI_0344" fallback={tr("UI_0344", "Pass &amp; Play")} /></h3><p className="text-[10px] font-medium text-neutral-400"><LocalizedText id="UI_0343" fallback={tr("UI_0343", "Local device")} /></p></div></button>}
        </div>

        <div className="mb-7 flex w-full items-center gap-3"><div className="relative flex min-w-0 flex-1 items-center rounded-2xl border border-white/10 bg-[#09090b] px-3 py-3.5"><span className="material-symbols-outlined mr-2 shrink-0 text-lg text-neutral-500">vpn_key</span><input type="text" placeholder={tr("UI_0345", "ENTER CODE")} aria-label={tr("UI_0346", "Enter room code")} value={roomCode || ""} onChange={(event) => setRoomCode?.(event.target.value.toUpperCase())} className="font-headline min-w-0 flex-1 bg-transparent text-xs font-bold uppercase tracking-[.16em] text-white placeholder-neutral-600 focus:outline-none" maxLength={6} /></div><button onClick={onJoin} data-requires-auth disabled={!roomCode || roomCode.length < 4} className="h-[49px] shrink-0 rounded-2xl border border-white/5 bg-[#18181b] px-5 text-xs font-bold uppercase tracking-wider text-white transition-all hover:bg-white/10 disabled:opacity-50 touch-manipulation"><LocalizedText id="UI_0229" fallback="Join" /></button></div>
        <button onClick={onExit} className="font-headline flex w-full items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-widest text-neutral-500 transition-colors hover:text-neutral-300 touch-manipulation"><span className="material-symbols-outlined text-sm">logout</span> <LocalizedText id="UI_0348" fallback="Exit Arena" /></button>
      </div>
    </div>
  );
}

export type SocialShareCard = {
  eyebrow: string;
  title: string;
  subtitle: string;
  stat: string;
  accent?: "lime" | "violet" | "blue" | "gold";
};

const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[character] || character);

function cardSvg(card: SocialShareCard, logoSrc: string) {
  const palette = {
    lime: ["#b7ff00", "#83b900"],
    violet: ["#b44cff", "#59238b"],
    blue: ["#32b8ed", "#176c9e"],
    gold: ["#ffcc3b", "#b56d00"],
  }[card.accent || "lime"];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#080b17"/><stop offset="1" stop-color="#16223b"/></linearGradient><radialGradient id="glow"><stop stop-color="${palette[0]}" stop-opacity=".45"/><stop offset="1" stop-color="${palette[1]}" stop-opacity="0"/></radialGradient></defs>
  <rect width="1200" height="630" rx="44" fill="url(#bg)"/><circle cx="1050" cy="80" r="300" fill="url(#glow)"/><path d="M0 540Q260 390 520 590T1200 400V630H0Z" fill="#b7ff00" opacity=".10"/>
  <defs><clipPath id="logoClip"><rect x="64" y="56" width="72" height="72" rx="20"/></clipPath></defs><image href="${logoSrc}" x="64" y="56" width="72" height="72" preserveAspectRatio="xMidYMid slice" clip-path="url(#logoClip)"/><text x="154" y="99" fill="#fff" font-family="Arial, sans-serif" font-weight="800" font-size="32">JOE YOKE</text>
  <text x="64" y="214" fill="${palette[0]}" font-family="Arial, sans-serif" font-weight="800" font-size="22" letter-spacing="4">${escapeXml(card.eyebrow.toUpperCase())}</text>
  <text x="64" y="306" fill="#fff" font-family="Arial, sans-serif" font-weight="800" font-size="68">${escapeXml(card.title)}</text>
  <text x="64" y="360" fill="#b8c3d7" font-family="Arial, sans-serif" font-size="30">${escapeXml(card.subtitle)}</text>
  <rect x="64" y="430" width="590" height="116" rx="28" fill="#ffffff" fill-opacity=".08" stroke="#ffffff" stroke-opacity=".16"/><text x="98" y="476" fill="#aab6cb" font-family="Arial, sans-serif" font-weight="700" font-size="20" letter-spacing="2">ACHIEVEMENT</text><text x="98" y="522" fill="${palette[0]}" font-family="Arial, sans-serif" font-weight="800" font-size="36">${escapeXml(card.stat)}</text>
  <text x="1135" y="580" text-anchor="end" fill="#aab6cb" font-family="Arial, sans-serif" font-size="18">Play. Compete. Connect.</text>
  </svg>`;
}

async function projectLogoDataUrl() {
  try {
    const response = await fetch("/logo-dark.jpeg");
    const blob = await response.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    // The project path is still valid when a network interceptor prevents an
    // embedded data URL; this fallback is for display only.
    return "/logo-dark.jpeg";
  }
}

export async function shareAchievement(card: SocialShareCard): Promise<"shared" | "downloaded" | "copied"> {
  const copy = `${card.title} — ${card.subtitle} ${card.stat} | Joe Yoke`;
  const logoSrc = await projectLogoDataUrl();
  const blob = new Blob([cardSvg(card, logoSrc)], { type: "image/svg+xml" });
  const file = new File([blob], "joe-yoke-achievement.svg", { type: "image/svg+xml" });
  const shareData: ShareData = { title: "Joe Yoke achievement", text: copy, files: [file] };
  try {
    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      await navigator.share(shareData);
      return "shared";
    }
  } catch (error) {
    if ((error as DOMException).name === "AbortError") return "copied";
  }
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(copy);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "joe-yoke-achievement.svg";
  anchor.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}

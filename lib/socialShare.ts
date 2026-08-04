export type SocialShareCard = {
  eyebrow: string;
  title: string;
  subtitle: string;
  stat: string;
  accent?: "lime" | "violet" | "blue" | "gold";
};

const paletteFor = (accent: SocialShareCard["accent"]) => ({
  lime: ["#b7ff00", "#83b900"],
  violet: ["#b44cff", "#59238b"],
  blue: ["#32b8ed", "#176c9e"],
  gold: ["#ffcc3b", "#b56d00"],
}[accent || "lime"]);

const roundedRect = (context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
};

async function loadProjectLogo() {
  const response = await fetch("/logo-dark.jpeg");
  if (!response.ok) throw new Error("Joe Yoke logo could not be loaded");
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Joe Yoke logo could not be decoded"));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number) {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      context.fillText(line, x, lineY);
      line = word;
      lineY += 44;
    } else line = next;
  }
  context.fillText(line, x, lineY);
}

async function achievementPng(card: SocialShareCard) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PNG sharing is not supported in this browser");
  const [accent, shade] = paletteFor(card.accent);
  const background = context.createLinearGradient(0, 0, 1200, 630);
  background.addColorStop(0, "#070b16");
  background.addColorStop(1, "#17243e");
  context.fillStyle = background;
  roundedRect(context, 0, 0, 1200, 630, 44);
  context.fill();
  const glow = context.createRadialGradient(1050, 70, 10, 1050, 70, 330);
  glow.addColorStop(0, `${accent}90`);
  glow.addColorStop(1, `${shade}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, 1200, 630);
  context.fillStyle = "#b7ff001c";
  context.beginPath(); context.moveTo(0, 540); context.quadraticCurveTo(260, 390, 520, 590); context.quadraticCurveTo(820, 720, 1200, 400); context.lineTo(1200, 630); context.lineTo(0, 630); context.fill();

  const logo = await loadProjectLogo();
  context.save();
  roundedRect(context, 64, 56, 72, 72, 20); context.clip();
  context.drawImage(logo, 64, 56, 72, 72);
  context.restore();
  context.fillStyle = "#ffffff"; context.font = "800 32px Arial, sans-serif"; context.fillText("JOE YOKE", 154, 99);
  context.fillStyle = accent; context.font = "800 22px Arial, sans-serif"; context.letterSpacing = "4px"; context.fillText(card.eyebrow.toUpperCase(), 64, 214); context.letterSpacing = "0px";
  context.fillStyle = "#ffffff"; context.font = "800 64px Arial, sans-serif"; drawText(context, card.title, 64, 306, 1000);
  context.fillStyle = "#b8c3d7"; context.font = "30px Arial, sans-serif"; drawText(context, card.subtitle, 64, 402, 1000);
  context.fillStyle = "#ffffff14"; roundedRect(context, 64, 470, 590, 106, 28); context.fill();
  context.fillStyle = "#aab6cb"; context.font = "700 20px Arial, sans-serif"; context.fillText("ACHIEVEMENT", 98, 510);
  context.fillStyle = accent; context.font = "800 34px Arial, sans-serif"; context.fillText(card.stat, 98, 554);
  context.fillStyle = "#aab6cb"; context.font = "18px Arial, sans-serif"; context.textAlign = "right"; context.fillText("Play. Compete. Connect.", 1135, 580); context.textAlign = "left";
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not create a PNG share card")), "image/png"));
}

export async function shareAchievement(card: SocialShareCard): Promise<"shared" | "downloaded" | "copied"> {
  const copy = `${card.title} — ${card.subtitle} ${card.stat} | Joe Yoke`;
  const blob = await achievementPng(card);
  const file = new File([blob], "joe-yoke-achievement.png", { type: "image/png" });
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
  anchor.download = "joe-yoke-achievement.png";
  anchor.click();
  URL.revokeObjectURL(url);
  return "downloaded";
}

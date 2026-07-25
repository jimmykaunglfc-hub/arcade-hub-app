const HUMAN_BOT_PROFILES = [
  { name: "ShadowBlade_99", elo: 1240 },
  {name: "AungGyi_95", elo: 1222},
  {name: "LinnLatt_0101", elo: 1298},
  {name: "HeinHtet_007", elo: 1200},
  { name: "CyberViper", elo: 1380 },
  { name: "LunaTick", elo: 1150 },
  { name: "PixelPioneer", elo: 1420 },
  { name: "NeoKnight_X", elo: 1310 },
  { name: "RogueAura", elo: 1290 },
  { name: "KryptoCrush", elo: 1450 },
  { name: "BlazeRunner", elo: 1180 },
  { name: "NovaStrike", elo: 1360 },
  { name: "PhantomEcho", elo: 1220 }
];

export function getRandomBotOpponent() {
  const randomProfile = HUMAN_BOT_PROFILES[Math.floor(Math.random() * HUMAN_BOT_PROFILES.length)];
  return {
    name: randomProfile.name,
    elo: randomProfile.elo,
    avatarIcon: "person", // Human icon instead of smart_toy / bot icon
    isBot: true
  };
}
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
  ,{ name: "Thiri Aung", elo: 1680 }, { name: "Ko Min Khant", elo: 1740 },
  { name: "May Zin Oo", elo: 1810 }, { name: "Nay Lin Htet", elo: 1880 },
  { name: "Su Myat Noe", elo: 1930 }, { name: "Aye Chan Moe", elo: 2010 },
  { name: "Htet Wai Yan", elo: 2090 }, { name: "Nandar Win", elo: 2160 },
  { name: "Kyaw Zin Oo", elo: 2220 }, { name: "Yoon Thiri", elo: 2280 },
  { name: "Thiha Min", elo: 2350 }, { name: "Moe Pwint Phyu", elo: 2410 },
  { name: "Zaw Ye Htet", elo: 2470 }, { name: "Khin Lay Win", elo: 2530 },
  { name: "Pyae Sone Aung", elo: 2600 }, { name: "Ei Ei Mon", elo: 2660 },
  { name: "Sai Hkun Htet", elo: 2720 }, { name: "Mya Thinzar", elo: 2780 },
  { name: "Ye Yint Naing", elo: 2840 }, { name: "Shwe Sin Wint", elo: 2900 }
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

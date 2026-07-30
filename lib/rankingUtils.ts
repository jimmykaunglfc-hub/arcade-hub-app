/**
 * Converts a raw MMR score into a formatted Rank Tier and Division.
 * Example: 2150 MMR -> "Diamond II"
 */
export function getRankTier(mmr: number): string {
  // Top tier has no subdivisions
  if (mmr >= 2500) return "Master";

  let tierName = "";
  if (mmr >= 2000) tierName = "Diamond";
  else if (mmr >= 1500) tierName = "Platinum";
  else if (mmr >= 1000) tierName = "Gold";
  else if (mmr >= 500) tierName = "Silver";
  else tierName = "Bronze";

  // Calculate the division (I, II, or III) based on where they fall in the 500-point bracket
  const remainder = mmr % 500;
  let division = "";

  if (remainder >= 334) {
    division = "I";   // Top third of the bracket
  } else if (remainder >= 167) {
    division = "II";  // Middle third of the bracket
  } else {
    division = "III"; // Bottom third of the bracket
  }

  return `${tierName} ${division}`;
}

/**
 * Calculates generic KDA (or Performance Score)
 */
export function calculateKDA(kills: number, deaths: number, assists: number): string {
  // Prevent division by zero if the user has 0 deaths
  const safeDeaths = deaths === 0 ? 1 : deaths;
  const kda = (kills + assists) / safeDeaths;
  
  return kda.toFixed(1); // Returns a string like "3.8"
}

/**
 * Converts total seconds played into hours
 */
export function getHoursPlayed(seconds: number): string {
  if (seconds < 60) return "0m";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

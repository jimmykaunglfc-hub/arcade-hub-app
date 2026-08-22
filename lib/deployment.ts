/**
 * Build-time deployment switches. Keep incomplete games behind a flag so a
 * production catalog cannot expose an unfinished route by accident.
 */
export const deploymentEnvironment =
  process.env.NEXT_PUBLIC_APP_ENV === "staging" ? "staging" : "production";

export const isStagingDeployment = deploymentEnvironment === "staging";

export const isMiniFighterEnabled = isStagingDeployment;

// Shan Koe Mee remains available to the staging build while it is being
// completed. Keeping this separate makes it impossible for a production
// catalogue, chat challenge, or stale deep link to expose the unfinished game.
export const isShanKoeMeeEnabled = isStagingDeployment;

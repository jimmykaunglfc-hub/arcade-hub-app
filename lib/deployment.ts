/**
 * Build-time deployment switches. Keep incomplete games behind a flag so a
 * production catalog cannot expose an unfinished route by accident.
 */
export const deploymentEnvironment =
  process.env.NEXT_PUBLIC_APP_ENV === "staging" ? "staging" : "production";

export const isStagingDeployment = deploymentEnvironment === "staging";

export const isMiniFighterEnabled = isStagingDeployment;

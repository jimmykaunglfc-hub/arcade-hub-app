export type MatchmakingConfig = {
  maxPlayers: 1 | 2 | 4;
  queueTimeoutSeconds?: number;
  minimumHumans?: number;
  botsAllowed?: boolean;
  matchmakingDisabled?: boolean;
};

export const MATCHMAKING_CONFIG: Record<string, MatchmakingConfig> = {
  "big-two": { maxPlayers: 4, queueTimeoutSeconds: 45, minimumHumans: 2, botsAllowed: true },
  ludo: { maxPlayers: 4, queueTimeoutSeconds: 45, minimumHumans: 2, botsAllowed: true },
  dominoes: { maxPlayers: 2, queueTimeoutSeconds: 45, minimumHumans: 2, botsAllowed: false },
  bingo: { maxPlayers: 2, queueTimeoutSeconds: 45, minimumHumans: 2, botsAllowed: false },
  "four-in-a-row": { maxPlayers: 2, queueTimeoutSeconds: 45, minimumHumans: 2, botsAllowed: false },
  "ping-pong": { maxPlayers: 2, queueTimeoutSeconds: 45, minimumHumans: 2, botsAllowed: true },
  "block-puzzle": { maxPlayers: 2, queueTimeoutSeconds: 45 },
  sudoku: { maxPlayers: 2, queueTimeoutSeconds: 45 },
  wordbox: { maxPlayers: 1, matchmakingDisabled: true },
  "game-2048": { maxPlayers: 1, matchmakingDisabled: true },
};

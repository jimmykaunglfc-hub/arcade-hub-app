/**
 * Framework-independent ITTF match state machine.
 *
 * Keep this class authoritative on the host/server in an online match and
 * broadcast `getState()` snapshots to the clients. Rendering and ball physics
 * should report completed rallies or faults to this class; they should never
 * calculate score or service order independently.
 */

export type TableTennisPlayerId = "player1" | "player2";
export type TableTennisBestOf = 3 | 5 | 7;
export type TableTennisSide = "near" | "far";

export enum TableTennisGameState {
  IN_PROGRESS = "IN_PROGRESS",
  GAME_OVER = "GAME_OVER",
  MATCH_OVER = "MATCH_OVER",
}

export enum TableTennisFault {
  DOUBLE_BOUNCE = "DOUBLE_BOUNCE",
  OUT_OF_BOUNDS = "OUT_OF_BOUNDS",
  BAD_SERVICE = "BAD_SERVICE",
  FREE_HAND_ON_TABLE = "FREE_HAND_ON_TABLE",
}

export type TableTennisPointReason =
  | TableTennisFault
  | "RALLY_WINNER"
  | "EDGE_BALL"
  | "OTHER";

export interface TableTennisState {
  /** Monotonic authority revision for realtime snapshot ordering. */
  revision: number;
  player1Score: number;
  player2Score: number;
  player1GamesWon: number;
  player2GamesWon: number;
  currentServer: TableTennisPlayerId;
  gameStartingServer: TableTennisPlayerId;
  gameState: TableTennisGameState;
  bestOf: TableTennisBestOf;
  gamesNeededToWin: number;
  currentGameNumber: number;
  player1Side: TableTennisSide;
  player2Side: TableTennisSide;
  decidingGameSideSwitchComplete: boolean;
  gameWinner: TableTennisPlayerId | null;
  matchWinner: TableTennisPlayerId | null;
  lastPointWinner: TableTennisPlayerId | null;
  lastPointReason: TableTennisPointReason | null;
  isDeuce: boolean;
}

export interface TableTennisGameOptions {
  bestOf?: TableTennisBestOf;
  firstServer?: TableTennisPlayerId;
  /**
   * Injectable RNG makes tests and authoritative server replays deterministic.
   * It must return a value in the same range as Math.random(): [0, 1).
   */
  random?: () => number;
}

export interface TableTennisPointResult {
  state: TableTennisState;
  /** False only when a previously processed realtime event is replayed. */
  accepted: boolean;
  gameEnded: boolean;
  matchEnded: boolean;
  sidesSwitched: boolean;
}

const otherPlayer = (
  playerId: TableTennisPlayerId,
): TableTennisPlayerId =>
  playerId === "player1" ? "player2" : "player1";

export class TableTennisGame {
  private static readonly MAX_PROCESSED_EVENT_IDS = 256;

  private readonly bestOf: TableTennisBestOf;
  private readonly gamesNeededToWin: number;
  private readonly firstMatchServer: TableTennisPlayerId;

  private player1Score = 0;
  private player2Score = 0;
  private player1GamesWon = 0;
  private player2GamesWon = 0;
  private currentGameNumber = 1;
  private currentServer: TableTennisPlayerId;
  private gameStartingServer: TableTennisPlayerId;
  private gameState = TableTennisGameState.IN_PROGRESS;
  private player1Side: TableTennisSide = "near";
  private player2Side: TableTennisSide = "far";
  private decidingGameSideSwitchComplete = false;
  private gameWinner: TableTennisPlayerId | null = null;
  private matchWinner: TableTennisPlayerId | null = null;
  private lastPointWinner: TableTennisPlayerId | null = null;
  private lastPointReason: TableTennisPointReason | null = null;
  private revision = 0;
  private readonly processedEventIds = new Set<string>();
  private readonly processedEventOrder: string[] = [];

  constructor(options: TableTennisGameOptions = {}) {
    this.bestOf = options.bestOf ?? 5;
    if (![3, 5, 7].includes(this.bestOf)) {
      throw new Error("bestOf must be 3, 5, or 7.");
    }
    this.gamesNeededToWin = Math.floor(this.bestOf / 2) + 1;

    this.firstMatchServer =
      options.firstServer ??
      TableTennisGame.determineFirstServer(options.random);
    this.assertPlayer(this.firstMatchServer);
    this.gameStartingServer = this.firstMatchServer;
    this.currentServer = this.firstMatchServer;
  }

  /** Randomly selects the opening server; inject an RNG for deterministic tests. */
  static determineFirstServer(
    random: () => number = Math.random,
  ): TableTennisPlayerId {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error("The random function must return a value in [0, 1).");
    }
    return value < 0.5 ? "player1" : "player2";
  }

  /**
   * Awards one point and performs every automatic transition required by the
   * rules: deuce service rotation, deciding-game side change, game win and
   * overall match win.
   */
  scorePoint(
    playerId: TableTennisPlayerId,
    reason: TableTennisPointReason = "RALLY_WINNER",
    eventId?: string,
  ): TableTennisPointResult {
    this.assertPlayer(playerId);
    if (eventId && this.processedEventIds.has(eventId)) {
      return {
        state: this.getState(),
        accepted: false,
        gameEnded: false,
        matchEnded:
          this.gameState === TableTennisGameState.MATCH_OVER,
        sidesSwitched: false,
      };
    }
    if (this.gameState !== TableTennisGameState.IN_PROGRESS) {
      throw new Error(
        `Cannot score a point while state is ${this.gameState}.`,
      );
    }

    if (eventId) this.rememberEvent(eventId);
    if (playerId === "player1") {
      this.player1Score += 1;
    } else {
      this.player2Score += 1;
    }
    this.lastPointWinner = playerId;
    this.lastPointReason = reason;
    this.revision += 1;

    let sidesSwitched = this.maybeSwitchSidesAtFive();
    const winner = this.checkWinCondition();

    if (winner) {
      this.gameWinner = winner;
      if (winner === "player1") {
        this.player1GamesWon += 1;
      } else {
        this.player2GamesWon += 1;
      }

      sidesSwitched = this.switchSides() || sidesSwitched;
      const matchWon =
        (winner === "player1"
          ? this.player1GamesWon
          : this.player2GamesWon) >= this.gamesNeededToWin;

      if (matchWon) {
        this.matchWinner = winner;
        this.gameState = TableTennisGameState.MATCH_OVER;
      } else {
        this.gameState = TableTennisGameState.GAME_OVER;
      }
    } else {
      this.currentServer = this.calculateServer();
    }

    return {
      state: this.getState(),
      accepted: true,
      gameEnded: winner !== null,
      matchEnded: this.gameState === TableTennisGameState.MATCH_OVER,
      sidesSwitched,
    };
  }

  /**
   * Starts the next game after GAME_OVER. Starting service alternates from one
   * game to the next, independent of the point at which the prior game ended.
   */
  resetGame(): TableTennisState {
    if (this.gameState === TableTennisGameState.MATCH_OVER) {
      throw new Error("The match is over. Call resetMatch() for a new match.");
    }
    if (this.gameState !== TableTennisGameState.GAME_OVER) {
      throw new Error("resetGame() is only valid after a game has ended.");
    }

    this.currentGameNumber += 1;
    this.player1Score = 0;
    this.player2Score = 0;
    this.gameWinner = null;
    this.lastPointWinner = null;
    this.lastPointReason = null;
    this.decidingGameSideSwitchComplete = false;
    this.gameStartingServer = otherPlayer(this.gameStartingServer);
    this.currentServer = this.gameStartingServer;
    this.gameState = TableTennisGameState.IN_PROGRESS;
    this.revision += 1;
    return this.getState();
  }

  /** Resets scores and games while retaining the configured best-of format. */
  resetMatch(firstServer: TableTennisPlayerId = this.firstMatchServer) {
    this.assertPlayer(firstServer);
    this.player1Score = 0;
    this.player2Score = 0;
    this.player1GamesWon = 0;
    this.player2GamesWon = 0;
    this.currentGameNumber = 1;
    this.currentServer = firstServer;
    this.gameStartingServer = firstServer;
    this.gameState = TableTennisGameState.IN_PROGRESS;
    this.player1Side = "near";
    this.player2Side = "far";
    this.decidingGameSideSwitchComplete = false;
    this.gameWinner = null;
    this.matchWinner = null;
    this.lastPointWinner = null;
    this.lastPointReason = null;
    this.processedEventIds.clear();
    this.processedEventOrder.length = 0;
    this.revision += 1;
    return this.getState();
  }

  /** Manual toggle for an umpire/admin correction. Normal play is automatic. */
  switchServer(): TableTennisPlayerId {
    this.currentServer = otherPlayer(this.currentServer);
    this.revision += 1;
    return this.currentServer;
  }

  /**
   * Records a let/replay without changing score, service order, or ends.
   * Returning a snapshot makes the no-op explicit to a realtime caller.
   */
  replayLet(): TableTennisState {
    return this.getState();
  }

  /**
   * A game is won at 11 or later only when the leader is ahead by two points.
   */
  checkWinCondition(): TableTennisPlayerId | null {
    const highScore = Math.max(this.player1Score, this.player2Score);
    const lead = Math.abs(this.player1Score - this.player2Score);
    if (highScore < 11 || lead < 2) return null;
    return this.player1Score > this.player2Score ? "player1" : "player2";
  }

  recordFault(
    faultingPlayer: TableTennisPlayerId,
    fault: TableTennisFault,
    eventId?: string,
  ): TableTennisPointResult {
    this.assertPlayer(faultingPlayer);
    return this.scorePoint(
      otherPlayer(faultingPlayer),
      fault,
      eventId,
    );
  }

  ballBouncedTwice(
    faultingPlayer: TableTennisPlayerId,
    eventId?: string,
  ) {
    return this.recordFault(
      faultingPlayer,
      TableTennisFault.DOUBLE_BOUNCE,
      eventId,
    );
  }

  hitOutOfBounds(
    faultingPlayer: TableTennisPlayerId,
    eventId?: string,
  ) {
    return this.recordFault(
      faultingPlayer,
      TableTennisFault.OUT_OF_BOUNDS,
      eventId,
    );
  }

  failedGoodService(
    faultingPlayer: TableTennisPlayerId,
    eventId?: string,
  ) {
    return this.recordFault(
      faultingPlayer,
      TableTennisFault.BAD_SERVICE,
      eventId,
    );
  }

  touchedTableWithFreeHand(
    faultingPlayer: TableTennisPlayerId,
    eventId?: string,
  ) {
    return this.recordFault(
      faultingPlayer,
      TableTennisFault.FREE_HAND_ON_TABLE,
      eventId,
    );
  }

  getState(): TableTennisState {
    return {
      revision: this.revision,
      player1Score: this.player1Score,
      player2Score: this.player2Score,
      player1GamesWon: this.player1GamesWon,
      player2GamesWon: this.player2GamesWon,
      currentServer: this.currentServer,
      gameStartingServer: this.gameStartingServer,
      gameState: this.gameState,
      bestOf: this.bestOf,
      gamesNeededToWin: this.gamesNeededToWin,
      currentGameNumber: this.currentGameNumber,
      player1Side: this.player1Side,
      player2Side: this.player2Side,
      decidingGameSideSwitchComplete:
        this.decidingGameSideSwitchComplete,
      gameWinner: this.gameWinner,
      matchWinner: this.matchWinner,
      lastPointWinner: this.lastPointWinner,
      lastPointReason: this.lastPointReason,
      isDeuce: this.player1Score >= 10 && this.player2Score >= 10,
    };
  }

  private calculateServer(): TableTennisPlayerId {
    const totalPoints = this.player1Score + this.player2Score;
    // At 10-10 and beyond, service alternates after every point.
    const serviceChanges =
      totalPoints < 20
        ? Math.floor(totalPoints / 2)
        : 10 + (totalPoints - 20);
    return serviceChanges % 2 === 0
      ? this.gameStartingServer
      : otherPlayer(this.gameStartingServer);
  }

  private maybeSwitchSidesAtFive(): boolean {
    const isDecidingGame = this.currentGameNumber === this.bestOf;
    const firstPlayerReachedFive =
      this.player1Score >= 5 || this.player2Score >= 5;
    if (
      !isDecidingGame ||
      !firstPlayerReachedFive ||
      this.decidingGameSideSwitchComplete
    ) {
      return false;
    }

    this.decidingGameSideSwitchComplete = true;
    return this.switchSides();
  }

  private switchSides(): boolean {
    const previousPlayer1Side = this.player1Side;
    this.player1Side = this.player2Side;
    this.player2Side = previousPlayer1Side;
    return true;
  }

  private rememberEvent(eventId: string) {
    this.processedEventIds.add(eventId);
    this.processedEventOrder.push(eventId);
    if (
      this.processedEventOrder.length >
      TableTennisGame.MAX_PROCESSED_EVENT_IDS
    ) {
      const expiredEventId = this.processedEventOrder.shift();
      if (expiredEventId) this.processedEventIds.delete(expiredEventId);
    }
  }

  private assertPlayer(
    playerId: TableTennisPlayerId,
  ): asserts playerId is TableTennisPlayerId {
    if (playerId !== "player1" && playerId !== "player2") {
      throw new Error(`Unknown table-tennis player: ${String(playerId)}`);
    }
  }
}

export default TableTennisGame;

export type TableTennisPlayerId = "player1" | "player2";
export type TableTennisBestOf = 1 | 3 | 5 | 7;

export type TableTennisState = {
  player1Score: number;
  player2Score: number;
  player1GamesWon: number;
  player2GamesWon: number;
  currentGameNumber: number;
  currentServer: TableTennisPlayerId;
};

const other = (player: TableTennisPlayerId): TableTennisPlayerId => player === "player1" ? "player2" : "player1";

/** Rules-only table tennis scorer, kept separate from the canvas physics. */
export class TableTennisGame {
  private readonly gamesToWin: number;
  private state: TableTennisState;

  constructor({ bestOf = 5 }: { bestOf?: TableTennisBestOf } = {}) {
    this.gamesToWin = Math.ceil(bestOf / 2);
    this.state = { player1Score: 0, player2Score: 0, player1GamesWon: 0, player2GamesWon: 0, currentGameNumber: 1, currentServer: "player1" };
  }

  getState(): TableTennisState { return { ...this.state }; }

  scorePoint(winner: TableTennisPlayerId, _reason: string) {
    if (winner === "player1") this.state.player1Score += 1;
    else this.state.player2Score += 1;
    const a = this.state.player1Score;
    const b = this.state.player2Score;
    const gameWinner = (a >= 11 || b >= 11) && Math.abs(a - b) >= 2
      ? (a > b ? "player1" : "player2") as TableTennisPlayerId
      : null;
    let gameEnded = false;
    let matchEnded = false;
    if (gameWinner) {
      gameEnded = true;
      if (gameWinner === "player1") this.state.player1GamesWon += 1;
      else this.state.player2GamesWon += 1;
      matchEnded = this.state.player1GamesWon >= this.gamesToWin || this.state.player2GamesWon >= this.gamesToWin;
    }
    const totalPoints = a + b;
    this.state.currentServer = Math.max(a, b) >= 10
      ? (totalPoints % 2 === 0 ? "player1" : "player2")
      : (Math.floor(totalPoints / 2) % 2 === 0 ? "player1" : "player2");
    return { state: this.getState(), gameEnded, matchEnded, sidesSwitched: gameEnded && this.state.currentGameNumber === 5 };
  }

  resetGame(): TableTennisState {
    this.state = { ...this.state, player1Score: 0, player2Score: 0, currentGameNumber: this.state.currentGameNumber + 1, currentServer: other(this.state.currentServer) };
    return this.getState();
  }
}

import { GameStateManager } from '../game/state';
import { CONFIG } from '../game/config';

export class ScoreSystem {
  private gameState: GameStateManager;

  constructor(gameState: GameStateManager) {
    this.gameState = gameState;
  }

  addKill(scoreValue: number): void {
    this.gameState.stats.score += scoreValue;
    this.gameState.stats.dronesDestroyed++;
  }

  addWaveBonus(wave: number): void {
    this.gameState.stats.score += wave * CONFIG.scoring.waveBonusMultiplier;
  }

  reset(): void {
    this.gameState.stats.score = 0;
    this.gameState.stats.dronesDestroyed = 0;
  }
}

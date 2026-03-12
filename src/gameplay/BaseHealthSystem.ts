import { GameStateManager } from '../game/state';

export class BaseHealthSystem {
  private gameState: GameStateManager;
  onDamage: ((amount: number) => void) | null = null;

  constructor(gameState: GameStateManager) {
    this.gameState = gameState;
  }

  damage(amount: number): void {
    this.gameState.stats.baseHealth = Math.max(0, this.gameState.stats.baseHealth - amount);
    if (this.onDamage) this.onDamage(amount);
  }

  isDead(): boolean {
    return this.gameState.stats.baseHealth <= 0;
  }

  getHealthPercent(): number {
    return this.gameState.stats.baseHealth / this.gameState.stats.maxHealth;
  }

  reset(): void {
    this.gameState.stats.baseHealth = this.gameState.stats.maxHealth;
  }
}

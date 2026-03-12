import { GameState, RunStats } from './types';
import { CONFIG } from './config';

export class GameStateManager {
  current: GameState = 'BOOT';
  stats: RunStats;
  private listeners: ((state: GameState, prev: GameState) => void)[] = [];

  constructor() {
    const best = parseInt(localStorage.getItem('shahed_best') || '0', 10);
    this.stats = {
      wave: 1,
      score: 0,
      dronesDestroyed: 0,
      baseHealth: CONFIG.baseHealth,
      maxHealth: CONFIG.baseHealth,
      bestScore: best,
    };
  }

  onChange(fn: (state: GameState, prev: GameState) => void) {
    this.listeners.push(fn);
  }

  setState(next: GameState) {
    const prev = this.current;
    if (prev === next) return;
    this.current = next;
    for (const fn of this.listeners) fn(next, prev);
  }

  resetRun() {
    if (this.stats.score > this.stats.bestScore) {
      this.stats.bestScore = this.stats.score;
      localStorage.setItem('shahed_best', String(this.stats.bestScore));
    }
    this.stats.wave = 1;
    this.stats.score = 0;
    this.stats.dronesDestroyed = 0;
    this.stats.baseHealth = CONFIG.baseHealth;
  }
}

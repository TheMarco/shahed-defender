import { RunStats } from '../game/types';

export class Overlay {
  private titleScreen: HTMLElement;
  private gameOverScreen: HTMLElement;
  private loadingScreen: HTMLElement;
  private goWave: HTMLElement;
  private goScore: HTMLElement;
  private goKills: HTMLElement;
  private goBest: HTMLElement;

  constructor() {
    this.titleScreen = document.getElementById('title-screen')!;
    this.gameOverScreen = document.getElementById('game-over-screen')!;
    this.loadingScreen = document.getElementById('loading-screen')!;
    this.goWave = document.getElementById('go-wave')!;
    this.goScore = document.getElementById('go-score')!;
    this.goKills = document.getElementById('go-kills')!;
    this.goBest = document.getElementById('go-best')!;
  }

  hideLoading(): void {
    this.loadingScreen.style.display = 'none';
  }

  showTitle(): void {
    this.titleScreen.style.display = 'flex';
    this.gameOverScreen.style.display = 'none';
  }

  hideTitle(): void {
    this.titleScreen.style.display = 'none';
  }

  showGameOver(stats: RunStats): void {
    this.gameOverScreen.style.display = 'flex';
    this.goWave.textContent = String(stats.wave);
    this.goScore.textContent = stats.score.toLocaleString();
    this.goKills.textContent = String(stats.dronesDestroyed);
    this.goBest.textContent = stats.bestScore.toLocaleString();
  }

  hideGameOver(): void {
    this.gameOverScreen.style.display = 'none';
  }

  hideAll(): void {
    this.titleScreen.style.display = 'none';
    this.gameOverScreen.style.display = 'none';
    this.loadingScreen.style.display = 'none';
  }
}

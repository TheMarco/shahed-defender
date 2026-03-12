import { RunStats } from '../game/types';

export class HUD {
  private scoreEl: HTMLElement;
  private waveEl: HTMLElement;
  private healthBar: HTMLElement;
  private hudEl: HTMLElement;
  private damageFlash: HTMLElement;
  private damageVignette: HTMLElement;
  private lowHealthOverlay: HTMLElement;
  private waveBanner: HTMLElement;
  private heatBar: HTMLElement;
  private heatLabel: HTMLElement;
  private waveBannerTimeout: number | null = null;
  private damageFlashTimeout: number | null = null;

  constructor() {
    this.scoreEl = document.getElementById('score-value')!;
    this.waveEl = document.getElementById('wave-value')!;
    this.healthBar = document.getElementById('health-bar')!;
    this.hudEl = document.getElementById('hud')!;
    this.damageFlash = document.getElementById('damage-flash')!;
    this.damageVignette = document.getElementById('damage-vignette')!;
    this.lowHealthOverlay = document.getElementById('low-health-overlay')!;
    this.waveBanner = document.getElementById('wave-banner')!;
    this.heatBar = document.getElementById('heat-bar')!;
    this.heatLabel = document.getElementById('heat-label')!;
  }

  show(): void {
    this.hudEl.style.display = 'block';
  }

  hide(): void {
    this.hudEl.style.display = 'none';
  }

  update(stats: RunStats): void {
    this.scoreEl.textContent = stats.score.toLocaleString();
    this.waveEl.textContent = String(stats.wave);
    const pct = (stats.baseHealth / stats.maxHealth) * 100;
    this.healthBar.style.width = `${pct}%`;

    // Color the health bar based on health
    if (pct > 60) {
      this.healthBar.style.background = 'linear-gradient(90deg, #44ff44, #88ff44)';
    } else if (pct > 30) {
      this.healthBar.style.background = 'linear-gradient(90deg, #ffaa00, #ffcc00)';
    } else {
      this.healthBar.style.background = 'linear-gradient(90deg, #ff2222, #ff6644)';
    }

    // Persistent damage vignette based on health level (shows when < 50%)
    if (pct < 50) {
      // Intensity increases as health drops: 0 at 50%, 1 at 0%
      const vignetteIntensity = 1 - pct / 50;
      this.damageVignette.style.opacity = String(vignetteIntensity);
    } else {
      this.damageVignette.style.opacity = '0';
    }

    // Low health crack/splatter overlay (shows when < 30%)
    if (pct < 30) {
      const crackIntensity = 1 - pct / 30;
      this.lowHealthOverlay.style.opacity = String(crackIntensity);
    } else {
      this.lowHealthOverlay.style.opacity = '0';
    }
  }

  flashDamage(intensity: number = 1): void {
    // Higher intensity = brighter flash and longer duration
    const opacity = Math.min(0.5 + intensity * 0.15, 0.9);
    const duration = Math.min(150 + intensity * 80, 500);

    this.damageFlash.style.opacity = String(opacity);

    if (this.damageFlashTimeout) clearTimeout(this.damageFlashTimeout);
    this.damageFlashTimeout = window.setTimeout(() => {
      this.damageFlash.style.opacity = '0';
    }, duration);
  }

  showWaveBanner(wave: number): void {
    if (this.waveBannerTimeout) clearTimeout(this.waveBannerTimeout);

    this.waveBanner.textContent = `WAVE ${wave}`;
    this.waveBanner.style.opacity = '1';

    this.waveBannerTimeout = window.setTimeout(() => {
      this.waveBanner.style.opacity = '0';
    }, 2000);
  }

  updateHeat(fraction: number, overheated: boolean): void {
    this.heatBar.style.width = `${fraction * 100}%`;
    if (overheated) {
      this.heatBar.classList.add('overheated');
      this.heatLabel.classList.add('visible');
    } else {
      this.heatBar.classList.remove('overheated');
      this.heatLabel.classList.remove('visible');
    }
  }

  reset(): void {
    this.scoreEl.textContent = '0';
    this.waveEl.textContent = '1';
    this.healthBar.style.width = '100%';
    this.damageVignette.style.opacity = '0';
    this.lowHealthOverlay.style.opacity = '0';
    this.damageFlash.style.opacity = '0';
    this.heatBar.style.width = '0%';
    this.heatBar.classList.remove('overheated');
    this.heatLabel.classList.remove('visible');
  }
}

import { DroneData } from '../game/types';
import { CONFIG } from '../game/config';

export class Radar {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private size = 160;
  private range = CONFIG.drone.spawnDistance;
  private _alertActive = false;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.canvas.style.cssText = `
      position: fixed;
      top: 16px;
      left: 16px;
      width: ${this.size}px;
      height: ${this.size}px;
      border-radius: 50%;
      border: 2px solid rgba(0, 255, 80, 0.4);
      background: rgba(0, 10, 0, 0.6);
      pointer-events: none;
      z-index: 100;
      display: none;
    `;
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  show(): void {
    this.canvas.style.display = 'block';
  }

  hide(): void {
    this.canvas.style.display = 'none';
  }

  setAlert(active: boolean): void {
    this._alertActive = active;
  }

  update(yaw: number, drones: DroneData[]): void {
    const ctx = this.ctx;
    const cx = this.size / 2;
    const cy = this.size / 2;
    const r = this.size / 2 - 4;

    // Clear
    ctx.clearRect(0, 0, this.size, this.size);

    // Background circle — flash red when alert is active
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    if (this._alertActive) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.008);
      ctx.fillStyle = `rgba(${Math.floor(40 + 60 * pulse)}, 0, 0, 0.7)`;
      // Red border pulse
      this.canvas.style.borderColor = `rgba(255, ${Math.floor(40 * (1 - pulse))}, 0, ${0.5 + 0.4 * pulse})`;
    } else {
      ctx.fillStyle = 'rgba(0, 15, 0, 0.7)';
      this.canvas.style.borderColor = 'rgba(0, 255, 80, 0.4)';
    }
    ctx.fill();

    // Range rings
    ctx.strokeStyle = this._alertActive ? 'rgba(255, 60, 0, 0.2)' : 'rgba(0, 255, 80, 0.15)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (r * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crosshairs
    ctx.strokeStyle = 'rgba(0, 255, 80, 0.12)';
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Aim direction line — yaw=0 means looking toward -Z
    // On radar: up = -Z (forward), right = +X
    // Turret yaw rotates around Y: positive yaw = look left
    const aimLen = r * 0.4;
    const aimX = cx + Math.sin(-yaw) * aimLen;
    const aimY = cy - Math.cos(-yaw) * aimLen; // negative because canvas Y is down
    ctx.strokeStyle = 'rgba(0, 255, 80, 0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(aimX, aimY);
    ctx.stroke();

    // Player dot
    ctx.fillStyle = 'rgba(0, 255, 80, 0.9)';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Drone dots
    // Player is at world (0, ?, 12). Camera at z=12.
    // On radar: drone world X maps to radar X, drone world Z maps to radar Y (inverted)
    const playerZ = 12;
    for (const drone of drones) {
      if (drone.state !== 'alive') continue;

      const dx = drone.position.x;
      const dz = drone.position.z - playerZ;

      // Normalize to radar range
      const nx = (dx / this.range) * r;
      const nz = (dz / this.range) * r; // -Z is forward (up on radar)

      const dotX = cx + nx;
      const dotY = cy + nz;

      // Skip if outside radar circle
      const distFromCenter = Math.sqrt(nx * nx + nz * nz);
      if (distFromCenter > r) continue;

      // Color based on distance — closer = more red
      const closeness = 1 - distFromCenter / r;
      const red = Math.floor(255 * closeness);
      const green = Math.floor(80 + 175 * (1 - closeness));
      ctx.fillStyle = `rgba(${red}, ${green}, 0, 0.9)`;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

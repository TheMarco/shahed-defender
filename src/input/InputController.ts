export class InputController {
  mouseX = 0;
  mouseY = 0;
  movementX = 0;
  movementY = 0;
  leftButton = false;
  rightButton = false;
  fireButton = false;
  keys: Record<string, boolean> = {};
  isLocked = false;
  isTouchDevice = false;

  private canvas: HTMLCanvasElement;
  private lastTouchX = 0;
  private lastTouchY = 0;
  private touchSensitivity = 1.5;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isTouchDevice = 'ontouchstart' in window;

    // Mouse events
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.movementX += e.movementX;
      this.movementY += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.leftButton = true;
      if (e.button === 2) this.rightButton = true;
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftButton = false;
      if (e.button === 2) this.rightButton = false;
    });

    // Keyboard events
    document.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });

    // Pointer lock (desktop)
    document.addEventListener('pointerlockchange', () => {
      if (!this.isTouchDevice) {
        this.isLocked = document.pointerLockElement === this.canvas;
      }
    });

    // Touch events
    if (this.isTouchDevice) {
      document.addEventListener('touchstart', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.touch-control')) return;
        if (e.touches.length > 0) {
          const touch = e.touches[0];
          this.lastTouchX = touch.clientX;
          this.lastTouchY = touch.clientY;
        }
      }, { passive: false });

      document.addEventListener('touchmove', (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.touch-control')) return;
        if (!this.isLocked) return;
        if (e.touches.length > 0) {
          const touch = e.touches[0];
          const dx = (touch.clientX - this.lastTouchX) * this.touchSensitivity;
          const dy = (touch.clientY - this.lastTouchY) * this.touchSensitivity;
          this.movementX += dx;
          this.movementY += dy;
          this.lastTouchX = touch.clientX;
          this.lastTouchY = touch.clientY;
        }
        e.preventDefault();
      }, { passive: false });

      document.addEventListener('touchend', (_e) => {
        // Nothing special needed
      });
    }

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestPointerLock() {
    if (!this.isTouchDevice) {
      this.canvas.requestPointerLock();
    }
  }

  consumeMovement(): { dx: number; dy: number } {
    const dx = this.movementX;
    const dy = this.movementY;
    this.movementX = 0;
    this.movementY = 0;
    return { dx, dy };
  }

  isKeyPressed(key: string): boolean {
    return !!this.keys[key.toLowerCase()];
  }
}

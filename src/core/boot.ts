export class Boot {
  el: HTMLElement;
  private bar: HTMLElement;
  private sub: HTMLElement;
  private hint: HTMLElement;
  progress = 0;
  done = false;

  constructor() {
    this.el = document.getElementById('boot')!;
    this.bar = this.el.querySelector('.boot-progress span')!;
    this.sub = document.getElementById('boot-sub')!;
    this.hint = document.getElementById('boot-hint')!;
  }

  /** advance progress; returns true when finished */
  feed(delta: number): boolean {
    if (this.done) return true;
    this.progress = Math.min(1, this.progress + delta);
    this.bar.style.width = `${this.progress * 100}%`;

    if (this.progress >= 0.2 && this.progress < 0.45) {
      this.sub.textContent = '// decrypting vault index · 7 seals found';
    } else if (this.progress >= 0.45 && this.progress < 0.72) {
      this.sub.textContent = '// restoring memory shards · 07/07';
    } else if (this.progress >= 0.72) {
      this.sub.textContent = '// archive is waiting for you';
      this.hint.style.animation = 'boot-rise 1.4s cubic-bezier(0.22,1,0.36,1) forwards 0.2s';
    }

    if (this.progress >= 1 && !this.done) {
      this.done = true;
      return true;
    }
    return false;
  }

  fadeOut() {
    document.body.classList.add('booted');
    const inner = this.el.querySelector('.boot-inner') as HTMLElement;
    if (inner) inner.style.opacity = '0';
    setTimeout(() => {
      this.el.style.pointerEvents = 'none';
      this.el.style.transition = 'opacity 1.2s ease 0.3s';
      this.el.style.opacity = '0';
    }, 300);
    setTimeout(() => {
      this.el.remove();
    }, 2200);
  }
}

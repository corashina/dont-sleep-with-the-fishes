interface ResumeWaiter {
  readonly isCurrent: () => boolean;
  readonly resolve: (resumed: boolean) => void;
}

export class SurvivalVisibilityController {
  private readonly resumeWaiters = new Set<ResumeWaiter>();
  private disposed = false;

  constructor(
    private readonly visibilityDocument: Document,
    private readonly onHidden: () => void,
    private readonly onVisible: () => void,
    private readonly canResume: () => boolean = () => true,
  ) {
    visibilityDocument.addEventListener('visibilitychange', this.handleVisibilityChange);
    if (this.isHidden()) this.onHidden();
  }

  isHidden(): boolean {
    return !this.disposed && this.visibilityDocument.hidden;
  }

  waitForResume(isCurrent: () => boolean): Promise<boolean> {
    if (this.disposed || !isCurrent()) return Promise.resolve(false);
    if (!this.isHidden() && this.canResume()) return Promise.resolve(true);
    return new Promise((resolve) => {
      this.resumeWaiters.add({ isCurrent, resolve });
    });
  }

  releaseResumeWaiters(): void {
    if (this.isHidden() || !this.canResume()) return;
    this.resolveWaiters(true);
  }

  cancelResumeWaiters(): void {
    this.resolveWaiters(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.visibilityDocument.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
    );
    this.cancelResumeWaiters();
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.disposed) return;
    if (this.isHidden()) {
      this.onHidden();
      return;
    }
    try {
      this.onVisible();
    } finally {
      this.releaseResumeWaiters();
    }
  };

  private resolveWaiters(canResume: boolean): void {
    if (this.resumeWaiters.size === 0) return;
    const waiters = [...this.resumeWaiters];
    this.resumeWaiters.clear();
    for (const waiter of waiters) {
      waiter.resolve(canResume && !this.disposed && waiter.isCurrent());
    }
  }
}

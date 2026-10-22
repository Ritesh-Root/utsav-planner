/**
 * Cost and resilience guards for a public URL: a per-day cap on model calls and
 * a circuit breaker that stops hammering the model while it is failing.
 */

export interface DailyBudget {
  /** Take one call from today's allowance; false when it is used up. */
  tryConsume(): boolean;
  used(): number;
}

/** A per-instance allowance of model calls that resets at midnight UTC. */
export function createDailyBudget(cap: number, now: () => Date): DailyBudget {
  let day = '';
  let count = 0;
  const roll = () => {
    const today = now().toISOString().slice(0, 10);
    if (today !== day) {
      day = today;
      count = 0;
    }
  };
  return {
    tryConsume() {
      roll();
      if (count >= cap) return false;
      count += 1;
      return true;
    },
    used() {
      roll();
      return count;
    },
  };
}

export interface CircuitBreaker {
  /** False while open: calls should fail fast instead of reaching the model. */
  allows(): boolean;
  recordSuccess(): void;
  recordFailure(): void;
}

/**
 * Opens after `threshold` consecutive service failures and stays open for
 * `coolDownMs`, then lets one trial call through.
 */
export function createCircuitBreaker(options: {
  threshold: number;
  coolDownMs: number;
  now: () => number;
}): CircuitBreaker {
  let failures = 0;
  let openUntil = 0;
  return {
    allows() {
      // After the cool-down one trial call goes through ("half open").
      return options.now() >= openUntil;
    },
    recordSuccess() {
      failures = 0;
      openUntil = 0;
    },
    recordFailure() {
      failures += 1;
      if (failures >= options.threshold) {
        openUntil = options.now() + options.coolDownMs;
        failures = options.threshold - 1;
      }
    },
  };
}

import { bucket } from './bucketing';
import { showModal, type ModalFlow } from './modal';

type EventType = 'exposure' | 'track' | 'identify';
interface CepEvent {
  type: EventType;
  unitId: string;
  userId?: string;
  experimentKey?: string;
  variantKey?: string;
  name?: string;
  props?: Record<string, unknown>;
  ts: number;
}
interface ExperimentConfig {
  key: string;
  salt: string;
  variants: { key: string; weight: number; flow: ModalFlow }[];
}

const ANON_KEY = 'cep:anon';
const USER_KEY = 'cep:user';

let envKey = '';
let apiHost = '';
let anonId = '';
let userId: string | undefined;
let queue: CepEvent[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;
const assignments: Record<string, string> = {};

function store(op: 'get' | 'set', key: string, value?: string): string | null {
  try {
    if (op === 'set') localStorage.setItem(key, value as string);
    else return localStorage.getItem(key);
  } catch {
    /* storage blocked: fall through */
  }
  return null;
}

function randomId(): string {
  return 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function unitId(): string {
  return userId ?? anonId;
}

function enqueue(e: Omit<CepEvent, 'unitId' | 'ts'>) {
  queue.push({ ...e, unitId: unitId(), ...(userId ? { userId } : {}), ts: Date.now() });
  if (!timer) timer = setTimeout(() => flush(false), 2000);
}

function flush(unloading: boolean) {
  if (timer) clearTimeout(timer);
  timer = undefined;
  if (!queue.length || !apiHost) return;
  const body = JSON.stringify({ envKey, events: queue });
  queue = [];
  const url = apiHost + '/v1/events';
  // text/plain keeps the request "simple" so no CORS preflight is needed.
  if (unloading && navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }));
  } else {
    fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {});
  }
}

function runExperiment(exp: ExperimentConfig) {
  const variantKey = bucket(unitId(), exp.key, exp.salt, exp.variants);
  if (!variantKey) return;
  assignments[exp.key] = variantKey;

  const capKey = `cep:seen:${exp.key}:${unitId()}`;
  if (store('get', capKey)) return; // frequency cap: once per user

  const flow = exp.variants.find((v) => v.key === variantKey)?.flow;
  if (!flow || flow.type !== 'modal') return;

  const shown = showModal(
    flow,
    () => enqueue({ type: 'track', name: 'cta_click', props: { experimentKey: exp.key } }),
    () => enqueue({ type: 'track', name: 'flow_dismissed', props: { experimentKey: exp.key } }),
  );
  if (shown) {
    store('set', capKey, '1');
    enqueue({ type: 'exposure', experimentKey: exp.key, variantKey });
  }
}

const cep = {
  async init(opts: { envKey: string; apiHost: string }) {
    envKey = opts.envKey;
    apiHost = opts.apiHost.replace(/\/$/, '');
    anonId = store('get', ANON_KEY) || randomId();
    store('set', ANON_KEY, anonId);
    userId = store('get', USER_KEY) || undefined;

    addEventListener('pagehide', () => flush(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush(true);
    });

    try {
      const res = await fetch(`${apiHost}/v1/config/${encodeURIComponent(envKey)}`);
      const config = (await res.json()) as { experiments: ExperimentConfig[] };
      config.experiments.forEach(runExperiment);
    } catch (err) {
      console.warn('[cep] config fetch failed', err);
    }
  },

  identify(id: string, traits?: Record<string, unknown>) {
    userId = id;
    store('set', USER_KEY, id);
    enqueue({ type: 'identify', props: traits });
    flush(false);
  },

  track(name: string, props?: Record<string, unknown>) {
    enqueue({ type: 'track', name, props });
  },

  getVariant(experimentKey: string): string | null {
    return assignments[experimentKey] ?? null;
  },

  getUserId(): string {
    return unitId();
  },
};

(window as unknown as { cep: typeof cep }).cep = cep;

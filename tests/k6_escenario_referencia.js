import { sleep } from 'k6';
import { validarEnvio } from './k6_common.js';

const vus = Number(__ENV.VUS || 5);
export const options = {
  scenarios: { referencia: { executor: 'constant-vus', vus, duration: __ENV.DURATION || '30s', gracefulStop: '5s' } },
  summaryTrendStats: ['min', 'med', 'avg', 'max', 'p(95)', 'p(99)'],
  thresholds: { http_req_failed: ['rate<0.01'], checks: ['rate>0.99'] },
};

export default function () {
  validarEnvio();
  sleep(0.1);
}

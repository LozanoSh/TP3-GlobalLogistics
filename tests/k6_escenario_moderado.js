import { sleep } from 'k6';
import { validarEnvio } from './k6_common.js';

const vus = Number(__ENV.VUS || 100);
const duracion = __ENV.DURATION || '45s';
const ramp = __ENV.RAMP || '10s';
export const options = {
  scenarios: {
    moderado: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: ramp, target: vus },
        { duration: duracion, target: vus },
        { duration: ramp, target: 0 },
      ],
      gracefulRampDown: '5s',
    },
  },
  discardResponseBodies: false,
  summaryTrendStats: ['min', 'med', 'avg', 'max', 'p(95)', 'p(99)'],
  thresholds: {
    http_req_duration: ['p(95)<250', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  validarEnvio();
  sleep(0.1);
}

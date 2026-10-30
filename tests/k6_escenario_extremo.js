import { cargaCpu } from './k6_common.js';

const vus = Number(__ENV.VUS || 10);
export const options = {
  scenarios: { cpu: { executor: 'constant-vus', vus, duration: __ENV.DURATION || '30s', gracefulStop: '10s' } },
  discardResponseBodies: false,
  summaryTrendStats: ['min', 'med', 'avg', 'max', 'p(95)', 'p(99)'],
  thresholds: { http_req_failed: ['rate<0.10'], checks: ['rate>0.90'] },
};

export default function () {
  cargaCpu();
}

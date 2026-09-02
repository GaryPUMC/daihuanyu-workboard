import { FIFTY_PATIENT_SCENARIOS, createFiftyPatientDemo } from '../../utils/fifty-patient-demo.js';

function todayKey() {
  const beijing = new Date(Date.now() + 8 * 60 * 60000);
  return `${beijing.getUTCFullYear()}-${`${beijing.getUTCMonth() + 1}`.padStart(2, '0')}-${`${beijing.getUTCDate()}`.padStart(2, '0')}`;
}

export { FIFTY_PATIENT_SCENARIOS };
export function createFiftyPatientBenchmark() {
  return createFiftyPatientDemo(todayKey());
}

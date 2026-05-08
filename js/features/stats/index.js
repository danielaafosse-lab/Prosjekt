/**
 * stats — public surface of the stats feature.
 */
export { statsService } from './services/statsService.js';
export {
  getDefaultStatsCount,
  getLoginPeriodLabel,
  calculateGiniCoefficient,
  calculateWeeklyTransactionVolume,
  getWeekNumber,
  categorizeIncome,
} from './utils/calculators.js';

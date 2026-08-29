import { runBalanceSimulation } from '../src/survival/balanceSimulation';

const report = runBalanceSimulation({
  seedsPerLoadout: 100,
  fishingReactionSuccess: 0.90,
});

console.log(JSON.stringify(report, null, 2));

if (report.blockedLoadouts.length > 0) process.exitCode = 1;
if (report.unrescuedLoadouts.length > 0) process.exitCode = 1;
if (report.taken !== 0) process.exitCode = 1;
if (report.rescueRate < 0.33 || report.rescueRate > 0.39) process.exitCode = 1;
if (report.averageRescueDay === null
  || report.averageRescueDay < 33
  || report.averageRescueDay > 36) process.exitCode = 1;
if (report.medianRescueDay === null
  || report.medianRescueDay < 33
  || report.medianRescueDay > 35) process.exitCode = 1;
if (report.rescueDay30To35Rate < 0.45) process.exitCode = 1;
if (report.averageNoSignalRescueDay === null
  || report.averageNoSignalRescueDay < 39
  || report.averageNoSignalRescueDay > 42) process.exitCode = 1;

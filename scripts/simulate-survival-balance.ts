import { runBalanceSimulation } from '../src/survival/balanceSimulation';

const report = runBalanceSimulation({
  seedsPerLoadout: 100,
  fishingReactionSuccess: 0.90,
});

console.log(JSON.stringify(report, null, 2));

if (report.blockedLoadouts.length > 0) process.exitCode = 1;
if (report.unrescuedLoadouts.length > 0) process.exitCode = 1;
if (report.taken !== 0) process.exitCode = 1;
if (report.rescueRate < 0.68 || report.rescueRate > 0.72) process.exitCode = 1;
if (report.averageRescueDay === null
  || report.averageRescueDay < 29
  || report.averageRescueDay > 32) process.exitCode = 1;
if (report.averageNoSignalRescueDay === null
  || report.averageNoSignalRescueDay < 36
  || report.averageNoSignalRescueDay > 40) process.exitCode = 1;

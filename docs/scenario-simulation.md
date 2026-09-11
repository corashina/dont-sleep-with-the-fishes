# Scenario Simulation Report

Generated: 2026-09-11T14:04:13.275Z

## Configuration

| Setting | Value |
| --- | --- |
| Loadouts sampled | 1000 |
| Slices (parallel agents) | 8 |
| Total seed runs | 10000 |
| Total sessions | 20000 |

## Total Game Statistics

Each seed run plays two sessions: one with signals enabled and one with signals disabled.
Total sessions: **20000**.

### Outcomes (seed runs)

| Outcome | Count | Rate |
| --- | --- | --- |
| rescued | 8484 | 84.8% |
| dead | 1479 | 14.8% |
| sunk | 37 | 0.4% |
| abducted | 0 | 0.0% |
| blocked | 0 | 0.0% |

### Rescue timing (signal cohort)

| Statistic | Day |
| --- | --- |
| Mean | 35.063 |
| Median | 35 |
| Minimum | 25 |
| P10 | 30 |
| P90 | 41 |
| Maximum | 49 |
| Rescued day 30-35 | 48.4% |

### Ending distribution (signal cohort)

| Ending | Count | Rate | Mean day | Median day | Min day | Max day |
| --- | --- | --- | --- | --- | --- | --- |
| rescue | 8484 | 84.8% | 35.063 | 35 | 25 | 49 |
| death | 1479 | 14.8% | 31.16 | 31 | 12 | 46 |
| sinking | 37 | 0.4% | 30.324 | 32 | 20 | 40 |

### Signals enabled vs disabled

| Cohort | Runs | Rescued | Rescue rate | Mean rescue day | Median rescue day |
| --- | --- | --- | --- | --- | --- |
| Signals enabled | 10000 | 8484 | 84.8% | 35.063 | 35 |
| Signals disabled | 10000 | 8552 | 85.5% | 40.129 | 40 |

Signal effect: rescue rate -0.007 | mean rescue day -5.066

## Integrity

| Check | Count |
| --- | --- |
| Blocked loadouts | 0 |
| Unrescued loadouts | 0 |


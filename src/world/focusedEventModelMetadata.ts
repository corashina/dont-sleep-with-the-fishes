import type { GeneratedRuntimeModelMetadata } from './itemModelManifest';
import type { EventModelId } from './eventModelManifest';

const metadata = {
  chestClosed: { triangles: 1676, rawBounds: { min: [-0.590267411316745, -0.0013262077843175972, -0.39044927677546604], max: [0.5890504858689383, 0.8971703973006975, 0.43332122828381514] } },
  midnightIsland: { triangles: 84, rawBounds: { min: [-0.4464530050754547, -0.009568000212311745, -0.4417620003223419], max: [0.4406239986419678, 0.7448949813842773, 0.46669599413871765] } },
  deadTree: { triangles: 5648, rawBounds: { min: [-3.9705326557159424, -0.3355545699596405, -4.7972307205200195], max: [4.385861396789551, 16.10182762145996, 3.616036891937256] } },
  traderRowboat: { triangles: 224, rawBounds: { min: [-2.3343784734606743, -0.02821293382913089, -4.821854884001019], max: [2.3343784734606743, 1.98144477930833, 4.188859425663886] } },
  traderOctopus: { triangles: 3150, rawBounds: { min: [-263.572998046875, -420.84600830078125, -240.70199584960938], max: [263.572998046875, 85.61229705810547, 217.99600219726562] } },
  riggedHand: { triangles: 1518, rawBounds: { min: [-1.451046772301197, -0.2179264827960273, -0.9034632976562091], max: [1.2005889108404517, 0.34729568482811835, 0.7280842997585244] } },
  containerShip: { triangles: 1620, rawBounds: { min: [-0.1146669015288353, -0.19675789773464203, -0.39588209986686707], max: [0.09535513818264008, 0.18458889424800873, 0.5791178941726685] } },
  midnightPalmTrees: { triangles: 1920, rawBounds: { min: [100.17549416422825, -0.0401952266593635, -2.8144427028046266], max: [126.08355617523159, 5.239776398871842, 2.4223368427391416] } },
  midnightShovel: { triangles: 322, rawBounds: { min: [-0.4018623315982624, -2.083291447183203, -0.08338413385720644], max: [0.4027827577357422, 1.7903624109757537, 0.1003567091991656] }, animations: [] },
  midnightMonster: {
    triangles: 5985,
    rawBounds: { min: [-1.1763006448745728, -0.0009017398851931852, -0.4620694530783184], max: [1.1763006448745728, 1.638694215296712, 0.3123278515955738] },
    animations: [
      { name: 'CharacterArmature|Crawl', duration: 1.6666666269302368, channels: 52 },
      { name: 'CharacterArmature|Death', duration: 0.75, channels: 27 },
      { name: 'CharacterArmature|HitReact', duration: 0.5833333134651184, channels: 19 },
      { name: 'CharacterArmature|Idle', duration: 1, channels: 14 },
      { name: 'CharacterArmature|Idle_Attack', duration: 1.6666666269302368, channels: 42 },
      { name: 'CharacterArmature|Jump', duration: 0.3333333432674408, channels: 21 },
      { name: 'CharacterArmature|Jump_Idle', duration: 0.5, channels: 22 },
      { name: 'CharacterArmature|Jump_Land', duration: 0.3333333432674408, channels: 21 },
      { name: 'CharacterArmature|No', duration: 1.6666666269302368, channels: 15 },
      { name: 'CharacterArmature|Punch', duration: 0.75, channels: 25 },
      { name: 'CharacterArmature|Run', duration: 0.7083333134651184, channels: 48 },
      { name: 'CharacterArmature|Run_Arms', duration: 0.6666666865348816, channels: 45 },
      { name: 'CharacterArmature|Run_Attack', duration: 0.6666666865348816, channels: 46 },
      { name: 'CharacterArmature|Walk', duration: 1.3333333730697632, channels: 46 },
      { name: 'CharacterArmature|Wave', duration: 1.6666666269302368, channels: 20 },
      { name: 'CharacterArmature|Yes', duration: 1.6666666269302368, channels: 15 },
    ],
  },
} as const satisfies Readonly<Record<EventModelId, GeneratedRuntimeModelMetadata>>;

export const FOCUSED_EVENT_MODEL_METADATA = metadata;

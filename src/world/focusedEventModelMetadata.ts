import type { GeneratedRuntimeModelMetadata } from './itemModelManifest';
import type { EventModelId } from './eventModelManifest';

const metadata = {
  chestClosed: { triangles: 1636, rawBounds: { min: [-0.6973932962864637, -0.020519483950920403, -0.4437107127159834], max: [0.6973932962864637, 0.8607305586338043, 0.44371061958372593] } },
  midnightIsland: { triangles: 84, rawBounds: { min: [-0.4464530050754547, -0.009568000212311745, -0.4417620003223419], max: [0.4406239986419678, 0.7448949813842773, 0.46669599413871765] } },
  deadTree: { triangles: 5648, rawBounds: { min: [-3.9705326557159424, -0.3355545699596405, -4.7972307205200195], max: [4.385861396789551, 16.10182762145996, 3.616036891937256] } },
  traderRowboat: { triangles: 224, rawBounds: { min: [-2.3343784734606743, -0.02821293382913089, -4.821854884001019], max: [2.3343784734606743, 1.98144477930833, 4.188859425663886] } },
  riggedHand: { triangles: 1518, rawBounds: { min: [-1.451046772301197, -0.2179264827960273, -0.9034632976562091], max: [1.2005889108404517, 0.34729568482811835, 0.7280842997585244] } },
  containerShip: { triangles: 1620, rawBounds: { min: [-0.1146669015288353, -0.19675789773464203, -0.39588209986686707], max: [0.09535513818264008, 0.18458889424800873, 0.5791178941726685] } },
} as const satisfies Readonly<Record<EventModelId, GeneratedRuntimeModelMetadata>>;

export const FOCUSED_EVENT_MODEL_METADATA = metadata;

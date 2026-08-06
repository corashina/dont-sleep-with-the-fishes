import type { PolyPizzaModelSource } from './poly-pizza-models.mjs';

export const POLY_PIZZA_SHIP_FURNITURE_SOURCES: Readonly<
  Record<
    | 'barrel' | 'bookcaseOpen' | 'cargoCrate' | 'cargoBox'
    | 'crewNightStand' | 'crewDesk' | 'crewCabinet' | 'crewCeilingLight'
    | 'crewWallPainting' | 'crewWallArt' | 'crewTable'
    | 'wheelhouseCorkboard'
    | 'workroomCardboardBox' | 'workroomStorageShelf' | 'workroomPallet'
    | 'pumpkin' | 'propaneTank' | 'redCan' | 'shippingBox' | 'package',
    PolyPizzaModelSource
  >
>;

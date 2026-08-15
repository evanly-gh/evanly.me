import {
  BOGIE_HOUSING_H,
  BOGIE_NECK_H,
  CAR_HEIGHT,
  CAR_LENGTH,
  CAR_WIDTH,
  type CarVariant,
  type MonorailKitResources,
} from './monorailKit';

/**
 * Shared render pieces for one monorail car + its bogie hanger, built from
 * monorailKit resources. Used by both the `?gallery` showcase and the live city
 * scene so the asset is identical in both. A car is modelled centred at the
 * local origin with its nose facing +X; the bogie is a child in the same local
 * frame so it hangs straight up from the roof (and yaws with the car in-city).
 */

const HALF_W = CAR_WIDTH / 2;
const CAP_X = CAR_LENGTH / 2;
const WINDOW_SPAN = CAR_LENGTH - 3.0;
const MULLIONS = 7;
const BAND_Y = 0.35;
const STRIPE_Y = -0.5;
const DOOR_XS = [-CAR_LENGTH * 0.28, CAR_LENGTH * 0.28];
const LAMP_Z = HALF_W * 0.55;

/** The car body: rounded shell, lit window bands + mullions, neon waistline
 *  stripe, recessed doors, and (nose variants) a raked windshield + lamps. */
export function MonorailCarBody({
  res,
  variant,
}: {
  res: MonorailKitResources;
  variant: CarVariant;
}) {
  const isNose = variant !== 'mid';
  const noseSign = variant === 'nose-rear' ? -1 : 1;

  const mullionXs = Array.from({ length: MULLIONS }, (_, i) =>
    -(WINDOW_SPAN / 2) + (WINDOW_SPAN / (MULLIONS - 1)) * i);

  return (
    <group>
      <mesh geometry={res.carBody} material={res.bodyMat} />

      {/* window bands + mullions, both sides */}
      {[-1, 1].map((sz) => (
        <group key={`win${sz}`}>
          <mesh geometry={res.windowBand} material={res.windowMat} position={[0, BAND_Y, sz * HALF_W]} />
          {mullionXs.map((mx, i) => (
            <mesh key={i} geometry={res.mullion} material={res.bodyMat} position={[mx, BAND_Y, sz * (HALF_W + 0.01)]} />
          ))}
        </group>
      ))}

      {/* neon waistline stripe, both sides */}
      {[-1, 1].map((sz) => (
        <mesh key={`stripe${sz}`} geometry={res.stripe} material={res.stripeMat} position={[0, STRIPE_Y, sz * HALF_W]} />
      ))}

      {/* recessed doors, both sides */}
      {[-1, 1].map((sz) =>
        DOOR_XS.map((dx) => (
          <mesh key={`door${sz}_${dx}`} geometry={res.door} material={res.hangerMat} position={[dx, -0.15, sz * (HALF_W - 0.02)]} />
        )),
      )}

      {/* nose cab: raked windshield + head/tail lamps */}
      {isNose && (
        <group>
          <mesh
            geometry={res.windshield}
            material={res.glassMat}
            position={[noseSign * (CAP_X - 0.15), 0.6, 0]}
            rotation={[0, 0, noseSign * 0.36]}
          />
          {[-LAMP_Z, LAMP_Z].map((lz) => (
            <mesh
              key={lz}
              geometry={res.lamp}
              material={variant === 'nose-rear' ? res.taillightMat : res.headlightMat}
              position={[noseSign * (CAP_X + 0.18), -0.7, lz]}
            />
          ))}
        </group>
      )}
    </group>
  );
}

/**
 * The bogie that suspends a car from the beam, drawn in the car's local frame:
 * a neck rising from the roof (`roofY`) up to a housing that tucks under the
 * beam underside (`topY`), a violet accent collar at the roof, and a pair of
 * running wheels. Neck/housing geometries are scaled to fit whatever drop the
 * caller needs (the gallery hangs low; the city keeps it tight for clearance).
 */
export function MonorailBogie({
  res,
  roofY = CAR_HEIGHT / 2,
  topY,
  housingH = 0.7,
  wheelZ = 0.6,
}: {
  res: MonorailKitResources;
  roofY?: number;
  topY: number;
  housingH?: number;
  wheelZ?: number;
}) {
  const neckLen = Math.max(topY - housingH - roofY, 0.05);
  const neckCenter = roofY + neckLen / 2;
  const housingCenter = topY - housingH / 2;
  return (
    <group>
      <mesh
        geometry={res.bogieHousing}
        material={res.hangerMat}
        position={[0, housingCenter, 0]}
        scale={[1, housingH / BOGIE_HOUSING_H, 1]}
      />
      <mesh
        geometry={res.bogieNeck}
        material={res.hangerMat}
        position={[0, neckCenter, 0]}
        scale={[1, neckLen / BOGIE_NECK_H, 1]}
      />
      {/* violet accent collar where the neck meets the roof */}
      <mesh
        geometry={res.bogieNeck}
        material={res.accentMat}
        position={[0, roofY + 0.12, 0]}
        scale={[1.08, 0.16 / BOGIE_NECK_H, 1.08]}
      />
      {[-wheelZ, wheelZ].map((wz) => (
        <mesh key={wz} geometry={res.bogieWheel} material={res.hangerMat} position={[0, topY - 0.18, wz]} />
      ))}
    </group>
  );
}

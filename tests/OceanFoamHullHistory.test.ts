// Importance: 98/100. Wrong hull identity or point velocity deposits foam in the wrong place.
import { expect, it } from 'vitest';
import { Object3D, Vector3 } from 'three';
import { createWaterExclusion } from '../src/ocean/WaterExclusion';
import { OceanFoamHullHistory } from '../src/ocean/OceanFoamHullHistory';
it('keeps velocity attached to a region when the input order changes', () => {
 const oa=new Object3D(), ob=new Object3D();
 const a=createWaterExclusion(oa,1,2), b=createWaterExclusion(ob,1,2);
 const h=new OceanFoamHullHistory(2), v=new Vector3(); h.setRegions([a,b],0);
 oa.position.x=1; oa.updateMatrixWorld(true); a.worldToLocal.copy(oa.matrixWorld).invert();
 h.setRegions([b,a],1); h.sample(1); h.velocityAt(1,new Vector3(1,0,0),v);
 expect(v.x).toBeCloseTo(1); h.velocityAt(0,new Vector3(),v); expect(v.length()).toBe(0);
 h.sample(0.5); expect(new Vector3().setFromMatrixPosition(h.localToWorld[1]!).x).toBeCloseTo(0.5);
});
it('includes vertical and rotational motion at an offset point', () => {
 const o=new Object3D(), a=createWaterExclusion(o,1,2), h=new OceanFoamHullHistory(2), v=new Vector3();
 h.setRegions([a],0); o.position.y=2; o.rotation.y=Math.PI/2; o.updateMatrixWorld(true);
 a.worldToLocal.copy(o.matrixWorld).invert(); h.setRegions([a],1); h.sample(1);
 h.velocityAt(0,new Vector3(0,2,-1),v);
 expect(v.x).toBeCloseTo(-1); expect(v.y).toBeCloseTo(2); expect(v.z).toBeCloseTo(-1);
});
it('does not transfer motion to a replacement or retain it after reset', () => {
 const o=new Object3D(), a=createWaterExclusion(o,1,2), h=new OceanFoamHullHistory(2), v=new Vector3();
 h.setRegions([a],0); o.position.x=10; o.updateMatrixWorld(true);
 const b=createWaterExclusion(o,1,2); h.setRegions([b],1); h.sample(1);
 h.velocityAt(0,new Vector3(10,0,0),v); expect(v.length()).toBe(0);
 h.reset(); h.setRegions([b],2); h.sample(2); h.velocityAt(0,new Vector3(10,0,0),v); expect(v.length()).toBe(0);
});
it('keeps a paused transform history stable', () => {
 const o=new Object3D(), a=createWaterExclusion(o,1,2), h=new OceanFoamHullHistory(2), v=new Vector3();
 h.setRegions([a],0); h.setRegions([a],0); h.sample(0); h.velocityAt(0,new Vector3(),v);
 expect(v.length()).toBe(0); expect(h.intervals[0]).toBe(0);
});

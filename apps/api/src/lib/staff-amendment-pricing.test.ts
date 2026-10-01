import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { priceStaffAmendment, sameStairQuote } from "./staff-amendment-pricing";

const order={delivery_floor:3,delivery_has_lift:false,delivery_stair_items:2,
  stair_rate_per_floor_per_item:50,stair_rate_free_up_to_floor:2,
  order_lines:[{id:"l",sku:"TRION-Q",qty:1,unit_price:2749,attrs:null}],
  order_addons:[{id:"a",addon_key:"STAIR_CARRY",qty:1,unit_price:50,attrs:null}]};
function client(row=order, broken?: string) {
  const from=vi.fn((table:string)=>({select:()=>({eq:()=>({maybeSingle:async()=>({
    data:table==="orders"?row:table==="floor_config"?{free_up_to_floor:2,per_floor_per_item:90}:broken==="addons"?null:{key:"STAIR_CARRY"},
    error:table===broken?{message:"injected read failure"}:null,
  })})})}));
  return {sb:{from} as unknown as SupabaseClient,from};
}
describe("staff amendment pricing reuses the governed stair arithmetic",()=>{
  it("uses the order pin, includes the fee in the same proposal, and ignores a client-authored quote",async()=>{
    const {sb,from}=client();
    const r=await priceStaffAmendment(sb,"o",{lines:[{...order.order_lines[0],qty:2}],_stair_quote:{fee:1}});
    expect(r.quote).toMatchObject({fee:100,previous_fee:50,rate:{perFloorPerItem:50,freeUpToFloor:2}});
    expect(r.proposed.addons).toEqual([{id:"a",addon_key:"STAIR_CARRY",qty:1,unit_price:100,attrs:null}]);
    expect(from.mock.calls.map(x=>x[0])).toEqual(["orders"]);
  });
  it("does not reprice a fee when only the goods price changes",async()=>{
    const {sb}=client();const r=await priceStaffAmendment(sb,"o",{lines:[{...order.order_lines[0],unit_price:1000}]});
    expect(r.quote).toBeNull();expect(r.proposed.addons).toBeUndefined();
  });
  it("keeps the existing services and their exact identities beside the computed row",async()=>{
    const {sb}=client();const extra={id:"d",addon_key:"DELIVERY",qty:1,unit_price:250,attrs:null};
    const r=await priceStaffAmendment(sb,"o",{lines:[{...order.order_lines[0],qty:2}],addons:[...order.order_addons,extra]});
    expect(r.proposed.addons).toContainEqual(extra);
  });
  it("refuses unavailable rate/key data before submitting an unpinned charged proposal",async()=>{
    const unpinned={...order,stair_rate_per_floor_per_item:null,stair_rate_free_up_to_floor:null} as unknown as typeof order;
    for(const broken of ["floor_config","addons"]) {
      const {sb}=client(unpinned,broken);
      await expect(priceStaffAmendment(sb,"o",{lines:[{...order.order_lines[0],qty:2}]})).rejects.toThrow();
    }
  });
  it("a changed quote requires review again, including rate changes with the same resulting fee",()=>{
    const q={inputs:{floor:3,has_lift:false,stair_items:2,items_total:2},expected_pinned:{rate:50,free:2},rate:{perFloorPerItem:50,freeUpToFloor:2},fee:100,previous_fee:50};
    expect(sameStairQuote(q,{...q})).toBe(true);
    expect(sameStairQuote(q,{...q,fee:150})).toBe(false);
    expect(sameStairQuote(q,{...q,rate:{perFloorPerItem:100,freeUpToFloor:2}})).toBe(false);
    expect(sameStairQuote(q,null)).toBe(false);
  });
});

/**
 * THE ONE DELIVERY ADDRESS INTERPRETATION — the test that keeps one row from
 * printing two answers about one address (owner correction 2026-09-14).
 *
 * Every case here is a REAL production record, named by its SO and measured on
 * 2026-09-14 against the 99 open delivery scopes. The shapes are the four the
 * correction demands: a structured address, a written-text-only address, no
 * address at all, and two address fields that disagree.
 */
import { describe, it, expect } from "vitest";
import { NOT_RECORDED, conciseLocality, resolveDeliveryLocality } from "./locality";

describe("resolveDeliveryLocality — a structured address", () => {
  it("prints the recorded columns and nothing else (SO-1209)", () => {
    const got = resolveDeliveryLocality({
      customer_address: "No. 5 Welloyd Industrial Park, Sungai Buloh 47020, Selangor",
      customer_address_line1: "No. 5 Welloyd Industrial Park",
      customer_address_city: "Sungai Buloh",
      customer_address_state: "Selangor",
      customer_address_postcode: "47020",
    });
    expect(got).toMatchObject({
      city: "Sungai Buloh",
      state: "Selangor",
      stateKey: "Selangor",
      label: "Sungai Buloh, Selangor",
    });
  });

  it("keeps a recorded town the national dataset would not have chosen (SO-1212)", () => {
    /* `KLIA` is what the salesperson picked; 64000 is another band entirely.
       The record wins — this reader never corrects an explicit answer. */
    expect(
      resolveDeliveryLocality({
        customer_address_city: "KLIA",
        customer_address_state: "Selangor",
        customer_address_postcode: "64000",
      }).label,
    ).toBe("KLIA, Selangor");
  });

  it("collapses a town that IS its state, exactly as the register prints it", () => {
    expect(
      resolveDeliveryLocality({
        customer_address_city: "Kuala Lumpur",
        customer_address_state: "Kuala Lumpur",
      }).label,
    ).toBe(conciseLocality("Kuala Lumpur", "Kuala Lumpur"));
  });
});

describe("resolveDeliveryLocality — a written address and no structured columns", () => {
  it("⭐ SO-1217 / TCF0541 reads Puchong, Selangor out of its own address", () => {
    /* THE VERIFIED DEFECT. This row printed `Not recorded` as its location,
       `Selangor` in its State column and `State not recorded` as its status,
       all at once, over an address Operations could read in the brief. */
    const got = resolveDeliveryLocality({
      customer_address:
        "31,JALAN BK8/2B,ANGGUN, RESIDENCE,BANDAR KINRARA,, 43300 PUCHONG,SELANGOR, Puchong, Selangor",
    });
    expect(got.label).toBe("Puchong, Selangor");
    expect(got.state).toBe("Selangor");
    expect(got.stateKey).toBe("Selangor");
    expect(got.label).not.toBe(NOT_RECORDED);
  });

  it("the town the customer WROTE outranks the postcode's own post town (SO-1217)", () => {
    /* 43300 is filed under Seri Kembangan; the address names Puchong twice.
       The words about their own home win, and nothing is written back. */
    expect(
      resolveDeliveryLocality({
        customer_address: "Bandar Kinrara, 43300 PUCHONG,SELANGOR, Puchong, Selangor",
      }).city,
    ).toBe("Puchong");
  });

  it("reads the state from an alias written in the address (SO-1252)", () => {
    const got = resolveDeliveryLocality({
      customer_address: "C-208 SD Apartment 2 Persiaran Meranti, Bandar Sri Damasara 52200 KL",
    });
    expect(got.stateKey).toBe("Kuala Lumpur");
    /* `Bandar Sri Damasara` is a neighbourhood, not a post town, so nothing is
       read out of the text; 52200's own post town IS `Kuala Lumpur`, and the
       label collapses to the one word. */
    expect(got.city).not.toBe("Bandar Sri Damasara");
    expect(got.label).toBe("Kuala Lumpur");
  });

  it("reads the post town from an exact curated postcode when the text names none (SO-1232)", () => {
    expect(
      resolveDeliveryLocality({
        customer_address: "52, Jalan PJU 3/18H,, Tropicana Indah. 47810, Kota Damansara",
      }).label,
    ).toBe("Petaling Jaya, Selangor");
  });

  it("refuses a post town from a state the postcode does not belong to (SO-1225)", () => {
    /* `43500` is Semenyih, SELANGOR; the address ends `Sentul, Kuala Lumpur`.
       Printing `Semenyih, Kuala Lumpur` would be a town in the wrong state. */
    const got = resolveDeliveryLocality({
      customer_address:
        "65 Jalan Kajang Selatan, 1/1 Kajang Selatan, 43500, Semenyih, Sentul, Kuala Lumpur",
    });
    expect(got.city).toBeNull();
    expect(got.label).toBe("Kuala Lumpur");
  });

  it("ignores a trailing segment that is not the state it matched (SO-1223)", () => {
    /* `Federal Territory` is not a state name the dataset knows: the matched
       state sits EARLIER in the line, so the segment in front of the trailing
       one is not a town candidate. Here the postcode still answers, and the
       label is what 52200 and the matched state agree on. */
    const got = resolveDeliveryLocality({
      customer_address: "37-05, Residensi Park Place, 52200 KL, Kuala Lumpur, Federal Territory",
    });
    expect(got.stateKey).toBe("Kuala Lumpur");
    expect(got.label).toBe("Kuala Lumpur");
  });

  it("reads NO town when the matched state is not the trailing segment", () => {
    /* Strip the postcode from the shape above and nothing is left to answer
       with: `Puchong` sits before `Federal Territory`, not before the state
       that matched, so pairing the two would invent a locality. */
    const got = resolveDeliveryLocality({
      customer_address: "37-05, Residensi Park Place, Kuala Lumpur, Puchong, Federal Territory",
    });
    expect(got.stateKey).toBe("Kuala Lumpur");
    expect(got.city).toBeNull();
    expect(got.label).toBe("Kuala Lumpur");
  });
});

describe("resolveDeliveryLocality — an address nothing can be read out of", () => {
  it("never invents a state from a segment that merely sits last (SO-1246)", () => {
    /* `Setia Alam` is a township, not a state. Guessing one here would file
       the row under a state nobody recorded. */
    const got = resolveDeliveryLocality({ customer_address: "Tuai Timur, Setia Alam" });
    expect(got.state).toBeNull();
    expect(got.stateKey).toBeNull();
  });

  it("still refuses to call a written address `Not recorded` (SO-1242)", () => {
    /* The warning belongs to the STATE. The address itself is there, and
       printing an absence word over it is the false report being corrected. */
    expect(resolveDeliveryLocality({ customer_address: "15, Jalan Elmma/Lhan 15" }).label).toBe(
      "15, Jalan Elmma/Lhan 15",
    );
  });

  it("stops at a coarse postcode range rather than guess a state", () => {
    /* `49999` sits in no curated band; only the 2-digit prefix table would
       answer, and that table's own comment calls itself approximate. */
    const got = resolveDeliveryLocality({ customer_address: "Lot 9, Jalan Hutan 49999" });
    expect(got.state).toBeNull();
  });

  it("says `Not recorded` only when there is genuinely nothing (SO-1255)", () => {
    expect(resolveDeliveryLocality({}).label).toBe(NOT_RECORDED);
    expect(resolveDeliveryLocality({}).state).toBeNull();
  });
});

describe("resolveDeliveryLocality — address fields that disagree", () => {
  it("the recorded column wins over the written address (SO-1319)", () => {
    /* The written address still carries an older Petaling Jaya, Selangor
       address; the structured columns say Kuala Lumpur. An explicit answer is
       never overruled by free text. */
    const got = resolveDeliveryLocality({
      customer_address:
        "21 Laksjlkaet, ARA DAMANSARA 47301 PJ, Petaling Jaya, Selangor, Kuala Lumpur 50200, Kuala Lumpur",
      customer_address_line1: "21 Laksjlkaet",
      customer_address_city: "Kuala Lumpur",
      customer_address_state: "Kuala Lumpur",
      customer_address_postcode: "50200",
    });
    expect(got.state).toBe("Kuala Lumpur");
    expect(got.label).toBe("Kuala Lumpur");
  });

  it("keeps the recorded state and still reads a town out of the address", () => {
    const got = resolveDeliveryLocality({
      customer_address: "12, Jalan Bunga, 47100 Puchong, Puchong, Selangor",
      customer_address_state: "Selangor",
    });
    expect(got.state).toBe("Selangor");
    expect(got.city).toBe("Puchong");
  });

  it("reads the state out of the address when only the town was recorded", () => {
    const got = resolveDeliveryLocality({
      customer_address: "12, Jalan Bunga, 47100 Puchong, Selangor",
      customer_address_city: "Puchong",
    });
    expect(got.label).toBe("Puchong, Selangor");
  });
});

describe("resolveDeliveryLocality — Singapore", () => {
  it("keeps the sentinel both surfaces bucket on", () => {
    expect(
      resolveDeliveryLocality({ customer_address: "10 Bayfront Ave, Singapore 018956" }).stateKey,
    ).toBe("Singapore");
    expect(resolveDeliveryLocality({ customer_address_state: "Singapore" }).stateKey).toBe(
      "Singapore",
    );
  });
});

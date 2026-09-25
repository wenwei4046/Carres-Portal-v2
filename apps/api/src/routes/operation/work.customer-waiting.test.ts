import { describe, expect, it } from "vitest";
import { customerCommunicationOf } from "./work";

describe("the Waiting tab's fact comes only from a recorded customer contact (Workspace §5.9)", () => {
  it("Record as sent → waiting until the next Delivery working day", () => {
    const c = customerCommunicationOf(
      "confirm_delivery_date",
      { contacted_at: "2026-10-23T03:00:00+00:00", result_key: "waiting_for_customer_reply", channel: "whatsapp" },
      "Lim Kuan Yang",
      "2026-10-23",
    );
    expect(c).toEqual({
      channel: "whatsapp",
      recipient: "Lim Kuan Yang",
      sentAt: "2026-10-23T03:00:00.000Z",
      replyState: "waiting",
      replyDueOn: "2026-10-24",
    });
  });

  it("on the follow-up day it is To do again (not waiting)", () => {
    const c = customerCommunicationOf(
      "confirm_delivery_date",
      { contacted_at: "2026-10-23T03:00:00Z", result_key: "no_answer", channel: "call" },
      null,
      "2026-10-24",
    );
    expect(c?.replyState).toBe("not_sent");
    expect(c?.recipient).toBe("Customer");
  });

  it("silence is never waiting; other rules carry no customer communication", () => {
    expect(customerCommunicationOf("confirm_delivery_date", null, "X", "2026-10-23")).toBeNull();
    expect(
      customerCommunicationOf("issue_po", { contacted_at: "2026-10-23T03:00:00Z", result_key: "waiting_for_customer_reply", channel: "whatsapp" }, "X", "2026-10-23"),
    ).toBeNull();
  });

  it("a real reply is replied", () => {
    const c = customerCommunicationOf(
      "confirm_delivery_date",
      { contacted_at: "2026-10-23T03:00:00Z", result_key: "requested_another_date", channel: "whatsapp" },
      "X",
      "2026-10-23",
    );
    expect(c?.replyState).toBe("replied");
  });
});

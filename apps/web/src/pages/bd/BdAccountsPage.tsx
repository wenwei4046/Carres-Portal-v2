import { useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Plus, Store, Users } from "lucide-react";
import { rmGroup } from "@/pages/dealer/pos/order-board-ui";
import { useBdActivity, useBdDealers } from "@/lib/queries";
import BdCreateDealerModal from "./BdCreateDealerModal";
import BdStaffPanel from "./BdStaffPanel";

/**
 * BdAccountsPage (2026-07-19) — the BD POS "Accounts" overlay: every
 * dealership at a glance (all-time orders / GMV / outstanding), the "New
 * dealer account" door (principal-parity, dealer-only) and per-store staff
 * management. Recent account/order activity from the audit log closes the
 * loop — BD sees the accounts it just opened.
 * Full-screen POS shell, same pattern as StaffManagePage / the boards.
 */
export default function BdAccountsPage({ onClose }: { onClose: () => void }) {
  const dealersQ = useBdDealers();
  const activityQ = useBdActivity(12);
  const [showCreate, setShowCreate] = useState(false);
  const [staffFor, setStaffFor] = useState<{ id: string; name: string } | null>(null);

  const dealers = dealersQ.data?.dealers ?? [];
  const activity = activityQ.data?.rows ?? [];

  return createPortal(
    <div
      className="pos-proto"
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "var(--pos-bg)" }}
      role="dialog"
      aria-modal="true"
      aria-label="Dealer accounts"
      data-testid="bd-accounts-page"
    >
      <div className="os-page" style={{ overflowY: "auto" }}>
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="Back"
          data-testid="bd-accounts-back"
          style={{ position: "absolute", top: 22, left: 32 }}
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <div style={{ width: "100%", maxWidth: 900, margin: "0 auto", padding: "26px 32px 48px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div className="os-head__eyebrow">BD network</div>
              <h1 className="os-head__title" style={{ margin: "6px 0 8px" }}>
                Dealer accounts
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: "var(--fg-muted)" }}>
                Open a new dealership, and manage each store&apos;s staff &amp; PINs — the same
                doors the HQ portal has.
              </p>
            </div>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => setShowCreate(true)}
              data-testid="bd-accounts-new"
            >
              <Plus size={16} />
              New dealer account
            </button>
          </div>

          {/* Stores */}
          <section className="os-section" style={{ marginTop: 22 }}>
            <h4 className="os-section__title">
              Stores <span>{dealers.length}</span>
            </h4>
            {dealersQ.isLoading && (
              <p style={{ fontSize: 13, color: "var(--fg-muted)" }}>Loading…</p>
            )}
            {dealersQ.error && (
              <p style={{ fontSize: 13, color: "var(--c-burnt)" }}>
                Couldn&apos;t load dealers: {dealersQ.error.message}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column" }}>
              {dealers.map((d) => (
                <div
                  key={d.id}
                  data-testid={`bd-account-row-${d.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 2px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      display: "grid",
                      placeItems: "center",
                      background: "color-mix(in oklab, var(--c-orange) 12%, transparent)",
                      color: "var(--c-burnt)",
                      flexShrink: 0,
                    }}
                  >
                    <Store size={15} strokeWidth={1.75} />
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 13.5,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {d.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: d.status === "active" ? "var(--c-burnt)" : "var(--fg-muted)",
                        }}
                      >
                        {d.status}
                      </span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--fg-muted)", marginTop: 1 }}>
                      {[d.region, d.contact].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "var(--font-num)" }}>
                      RM {rmGroup(d.gmv)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--fg-muted)" }}>
                      {d.orderCount} orders · outstanding RM {rmGroup(d.outstanding)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setStaffFor({ id: d.id, name: d.name })}
                    data-testid={`bd-account-staff-${d.id}`}
                  >
                    <Users size={14} />
                    Staff
                  </button>
                </div>
              ))}
              {!dealersQ.isLoading && dealers.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--fg-muted)", fontStyle: "italic" }}>
                  No dealers yet — open the first one.
                </p>
              )}
            </div>
          </section>

          {/* Recent activity — account + order events touching a dealer. */}
          <section className="os-section" style={{ marginTop: 18 }}>
            <h4 className="os-section__title">Recent activity</h4>
            {activity.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--fg-muted)", fontStyle: "italic" }}>
                Nothing yet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {activity.map((a) => (
                  <div key={a.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <span
                      aria-hidden
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "var(--c-orange)",
                        marginTop: 5,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, lineHeight: 1.45 }}>{a.action}</div>
                      <div style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 1 }}>
                        {[a.dealerName, a.role, new Date(a.occurredAt).toLocaleString("en-MY", {
                          day: "numeric",
                          month: "short",
                          hour: "numeric",
                          minute: "2-digit",
                        })]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {showCreate && <BdCreateDealerModal onClose={() => setShowCreate(false)} />}
      {staffFor && (
        <BdStaffPanel
          dealerId={staffFor.id}
          orgName={staffFor.name}
          onClose={() => setStaffFor(null)}
        />
      )}
    </div>,
    document.body,
  );
}

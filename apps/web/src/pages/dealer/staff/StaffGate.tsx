import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDealerSelf, useOutlets, useStaffList, useStaffReauth, useStaffSelfToken } from "@/lib/queries";
import { useStaffSession } from "@/lib/staff";
import OutletPicker from "./OutletPicker";
import PinScreen from "./PinScreen";
import SetupWizard from "./SetupWizard";

/**
 * StaffGate (0233) — wraps DealerApp (dealer / showroom / salesperson logins
 * only). The store email+password is still gate #1; this adds the per-person
 * PIN identity ON TOP. Mounted INSIDE DealerApp so it never touches the
 * principal on-behalf POS (PrincipalApp mounts DealerPos directly, bypassing
 * this gate — internal roles are exempt by design).
 *
 * Branching:
 *   • valid token in the store           → render the app (children)
 *   • role salesperson (no token)         → auto self-token; 409 → notice + app
 *   • dealer/showroom, store not activated → forced SetupWizard
 *   • dealer/showroom, activated          → outlet picker (only if >1 outlet)
 *                                            → PIN screen
 *
 * A dormant store (no PINs set → never activated for salesperson; the
 * wizard-then-PIN for dealer/showroom) means this is the FIRST time PINs matter;
 * once nobody has set a PIN the API's orders enforcement stays byte-identical.
 */
export default function StaffGate({ children }: { children: ReactNode }) {
  const role = useAuth((s) => s.role);
  const authDealerId = useAuth((s) => s.dealerId);

  const token = useStaffSession((s) => s.token);
  const sessionDealerId = useStaffSession((s) => s.dealerId);
  const reset = useStaffSession((s) => s.reset);

  // Shared-kiosk guard: a different store logging in on the same tab drops the
  // stale staff session before it can leak the previous store's identity.
  useEffect(() => {
    if (sessionDealerId && authDealerId && sessionDealerId !== authDealerId) {
      reset();
    }
  }, [sessionDealerId, authDealerId, reset]);

  // Internal roles (principal acting) never mount this — but stay defensive.
  if (role !== "dealer" && role !== "showroom" && role !== "salesperson") {
    return <>{children}</>;
  }

  // A verified session for THIS dealer → the app. A token minted for a different
  // dealer (shared kiosk) is ignored at render too — not only in the effect
  // above — so a stale identity never flashes the previous store's app.
  const tokenMatchesDealer = !sessionDealerId || !authDealerId || sessionDealerId === authDealerId;
  if (token && tokenMatchesDealer) return <>{children}</>;

  if (role === "salesperson") {
    return <SalespersonGate>{children}</SalespersonGate>;
  }

  // Mounted only while there is NO staff session — every branch it renders
  // (wizard / outlet picker / PIN) replaces the app, so it takes no children.
  return <DealerShowroomGate />;
}

/** Salesperson logins mint their own token from the linked staff row. */
function SalespersonGate({ children }: { children: ReactNode }) {
  const setSession = useStaffSession((s) => s.setSession);
  const setSessionOutlet = useStaffSession((s) => s.setSessionOutlet);
  const authDealerId = useAuth((s) => s.dealerId);
  const selfToken = useStaffSelfToken();
  const [settled, setSettled] = useState(false);
  const [unlinked, setUnlinked] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    selfToken.mutate(undefined, {
      onSuccess: (resp) => {
        setSession(
          resp.token,
          {
            sid: resp.staff?.id ?? null,
            tier: resp.tier,
            name: resp.staff?.name ?? "Me",
            color: resp.staff?.color ?? null,
            outletId: resp.outletId,
          },
          authDealerId,
        );
        if (resp.outletId) setSessionOutlet(resp.outletId);
        setSettled(true);
      },
      onError: () => {
        // 409 unlinked (or any failure) → non-blocking: today's behaviour.
        setUnlinked(true);
        setSettled(true);
      },
    });
  }, [selfToken, setSession, setSessionOutlet, authDealerId]);

  if (!settled) return <GateSpinner label="Signing you in…" />;

  // Unlinked salesperson row → proceed without a staff identity (unchanged).
  void unlinked;
  return <>{children}</>;
}

function DealerShowroomGate() {
  const navigate = useNavigate();
  const authDealerId = useAuth((s) => s.dealerId);
  const userEmail = useAuth((s) => s.user?.email ?? "");

  const sessionOutletId = useStaffSession((s) => s.sessionOutletId);
  const setSessionOutlet = useStaffSession((s) => s.setSessionOutlet);
  const setSession = useStaffSession((s) => s.setSession);
  const clearToken = useStaffSession((s) => s.clearToken);

  const staffQ = useStaffList();
  const outletsQ = useOutlets();
  const dealer = useDealerSelf({ enabled: !!authDealerId });
  const [forgotOpen, setForgotOpen] = useState(false);

  const outlets = outletsQ.data?.outlets ?? [];

  // Single-outlet store: auto-select so the picker never shows.
  useEffect(() => {
    if (
      staffQ.data?.activated &&
      outletsQ.data &&
      sessionOutletId === null &&
      outlets.length === 1
    ) {
      setSessionOutlet(outlets[0].id);
    }
  }, [staffQ.data?.activated, outletsQ.data, sessionOutletId, outlets, setSessionOutlet]);

  if (staffQ.isPending || outletsQ.isPending) {
    return <GateSpinner label="Loading…" />;
  }
  if (staffQ.error) {
    return <GateSpinner label={`Couldn't load staff: ${staffQ.error.message}`} />;
  }

  const data = staffQ.data;

  // Not activated → the one-time forced setup wizard.
  if (!data.activated) {
    return (
      <SetupWizard
        staff={data.staff}
        storeKind={data.storeKind}
        dealerId={authDealerId}
        outlets={outlets}
        prefillName={dealer.data?.name ?? (userEmail ? userEmail.split("@")[0] : "Owner")}
        onDone={() => {
          clearToken();
          void staffQ.refetch();
        }}
      />
    );
  }

  // Activated, multi-outlet, none chosen → pick the working outlet first.
  if (outlets.length > 1 && sessionOutletId === null) {
    return <OutletPicker outlets={outlets} onPick={(id) => setSessionOutlet(id)} />;
  }

  const outletLabel = outlets.find((o) => o.id === sessionOutletId)?.name ?? null;

  return (
    <>
      <PinScreen
        staff={data.staff}
        sessionOutletId={sessionOutletId}
        dealerId={authDealerId}
        outletLabel={outletLabel}
        onForgotPin={() => setForgotOpen(true)}
      />
      {forgotOpen && (
        <ForgotPinModal
          onClose={() => setForgotOpen(false)}
          onReauthed={(resp) => {
            setSession(
              resp.token,
              {
                sid: resp.staff?.id ?? null,
                tier: resp.tier,
                name: resp.staff?.name ?? (dealer.data?.name ?? "Owner"),
                color: resp.staff?.color ?? null,
                outletId: resp.outletId,
              },
              authDealerId,
            );
            // Owner-mode token active → straight into the POS Staff & PINs
            // overlay to reset PINs (the back-office Settings page is gone,
            // 2026-07-19 — DealerPos consumes the openStaff flag).
            navigate("/dealer", { state: { openStaff: true } });
          }}
        />
      )}
    </>
  );
}

/** "Forgot PIN?" → prove the store password, mint an owner-mode token, and
 *  land in the POS Staff & PINs overlay (where PINs can be reset). Uses the
 *  POS look. */
function ForgotPinModal({
  onClose,
  onReauthed,
}: {
  onClose: () => void;
  onReauthed: (resp: import("@carres/shared").StaffSessionResponse) => void;
}) {
  const [password, setPassword] = useState("");
  const reauth = useStaffReauth();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    reauth.mutate({ password }, { onSuccess: (resp) => onReauthed(resp) });
  }

  return (
    <div className="pos-proto pin-gate" data-testid="staff-forgot-modal">
      <form className="pin-gate__card" onSubmit={submit} style={{ textAlign: "left" }}>
        <div className="staff-gate__eyebrow">Owner override</div>
        <h2 className="staff-gate__title">Reset a PIN</h2>
        <p className="staff-gate__sub" style={{ margin: "0 0 20px" }}>
          Enter the store password to open Staff &amp; PINs, where you can set a new PIN for any
          staff member.
        </p>
        <div className="staff-wiz__field">
          <label className="staff-wiz__label">Store password</label>
          <input
            type="password"
            className="staff-wiz__input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="staff-forgot-password"
            autoFocus
          />
        </div>
        {reauth.isError && (
          <div className="staff-gate__err">
            {reauth.error instanceof ApiError && reauth.error.status === 401
              ? "Wrong password — try again."
              : reauth.error?.message ?? "Could not verify"}
          </div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button type="button" className="btn btn--ghost" style={{ flex: 1 }} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn--primary"
            style={{ flex: 1 }}
            disabled={!password || reauth.isPending}
            data-testid="staff-forgot-submit"
          >
            {reauth.isPending ? "Checking…" : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}

function GateSpinner({ label }: { label: string }) {
  return (
    <div className="pos-proto staff-gate" data-testid="staff-gate-spinner">
      <div className="staff-gate__card staff-gate__card--narrow">
        <p className="staff-gate__sub" style={{ margin: 0 }}>
          {label}
        </p>
      </div>
    </div>
  );
}

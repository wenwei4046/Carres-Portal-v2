/**
 * Pickup-event DO PDF template — Task 13 of the Supplier Per-Thread Readiness
 * plan (docs/superpowers/plans/2026-05-15-supplier-thread-pickup-plan.md).
 *
 * Browser-rendered via @react-pdf/renderer (commit `fa47433` — Workers
 * blocked yoga-layout WASM init). The server side
 * (`/api/pickup-events/:id/print`) just assembles the JSON payload —
 * supplier / threads / SKU lines — RLS-scoped via
 * `pickup_event_render_payload` RPC (0107).
 *
 * Mirrors `do-template.tsx` (single-customer DO) but the "lines" section
 * is a per-thread table — one row per `order_supplier_threads` swept up
 * in this pickup. Each thread carries its parent order's DL# + customer +
 * customer delivery date + the SKUs being moved for that order.
 *
 * Page format: A4, Carres terracotta accent (#D64F20).
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { NOTO_SANS_SC_FAMILY } from "./fonts/noto";
import { DocHeader } from "./letterhead";
import type { PickupEventPrintPayload } from "@/lib/queries";

const BORDER = "#D9D2C7";
const MUTED = "#7A7268";

const styles = StyleSheet.create({
  page: {
    fontFamily: NOTO_SANS_SC_FAMILY,
    fontSize: 10,
    paddingTop: 36,
    paddingBottom: 36,
    paddingHorizontal: 36,
    color: "#1A1714",
  },
  // 2026-05-16 — header rendering moved to shared DocHeader.
  partyRow: {
    flexDirection: "row",
    marginBottom: 16,
    gap: 16,
  },
  party: {
    flex: 1,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 10,
  },
  partyLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  partyName: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 2,
  },
  partyLine: {
    fontSize: 9,
    color: "#3F3A33",
    marginBottom: 1,
  },
  sectionLabel: {
    fontSize: 8,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  threadBlock: {
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 8,
  },
  threadHeader: {
    backgroundColor: "#F5EFE6",
    padding: 6,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  threadDl: {
    fontSize: 10,
    fontWeight: 700,
  },
  threadCustomer: {
    fontSize: 9,
    color: "#3F3A33",
    flex: 1,
  },
  threadEta: {
    fontSize: 9,
    color: MUTED,
  },
  threadLineRow: {
    flexDirection: "row",
    padding: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  threadLineRowLast: {
    flexDirection: "row",
    padding: 6,
  },
  threadLineSku: {
    fontSize: 9,
    flex: 1,
  },
  threadLineQty: {
    fontSize: 9,
    width: 50,
    textAlign: "right",
  },
  noteBox: {
    fontSize: 9,
    color: "#3F3A33",
    borderWidth: 1,
    borderColor: BORDER,
    padding: 8,
    marginBottom: 16,
  },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 24,
  },
  signBlock: {
    width: "45%",
    borderTopWidth: 1,
    borderTopColor: "#1A1714",
    paddingTop: 4,
  },
  signLabel: {
    fontSize: 8,
    color: MUTED,
  },
  disclaimer: {
    fontSize: 8,
    color: MUTED,
    marginTop: 24,
    textAlign: "center",
  },
});

function formatPickedUp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  // YYYY-MM-DD HH:mm — short ISO so it fits next to DO# without wrapping.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PickupEventTemplate(data: PickupEventPrintPayload) {
  const {
    do_number,
    picked_up_at,
    ack_role,
    po_id,
    po_eta_date,
    supplier_name,
    do_note,
    threads,
  } = data;
  const pickedFormatted = formatPickedUp(picked_up_at);
  const totalUnits = threads.reduce(
    (sum, t) => sum + t.sku_lines.reduce((s, l) => s + (l.qty ?? 0), 0),
    0,
  );

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <DocHeader
          docTitle="DELIVERY ORDER"
          docMetaRows={[
            do_number,
            `Picked up: ${pickedFormatted}`,
            `Ack: ${ack_role}`,
          ]}
        />

        <View style={styles.partyRow}>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Supplier</Text>
            <Text style={styles.partyName}>{supplier_name}</Text>
            <Text style={styles.partyLine}>PO: {po_id}</Text>
            {po_eta_date ? (
              <Text style={styles.partyLine}>PO ETA: {po_eta_date}</Text>
            ) : null}
          </View>
          <View style={styles.party}>
            <Text style={styles.partyLabel}>Pickup summary</Text>
            <Text style={styles.partyName}>
              {threads.length} thread{threads.length === 1 ? "" : "s"} ·{" "}
              {totalUnits} unit{totalUnits === 1 ? "" : "s"}
            </Text>
            <Text style={styles.partyLine}>
              Acknowledged by: {ack_role}
            </Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Threads in this pickup</Text>
        {threads.map((t) => (
          <View key={t.thread_id} style={styles.threadBlock}>
            <View style={styles.threadHeader}>
              <Text style={styles.threadDl}>DL-{t.order_dl}</Text>
              <Text style={styles.threadCustomer}>{t.customer_name}</Text>
              <Text style={styles.threadEta}>
                ETA: {t.customer_delivery_date ?? "—"}
              </Text>
            </View>
            {t.sku_lines.length === 0 ? (
              <View style={styles.threadLineRowLast}>
                <Text style={styles.threadLineSku}>(no line items)</Text>
                <Text style={styles.threadLineQty}>—</Text>
              </View>
            ) : (
              t.sku_lines.map((l, idx) => {
                const isLast = idx === t.sku_lines.length - 1;
                return (
                  <View
                    key={`${t.thread_id}-${l.sku}-${idx}`}
                    style={isLast ? styles.threadLineRowLast : styles.threadLineRow}
                  >
                    <Text style={styles.threadLineSku}>{l.sku}</Text>
                    <Text style={styles.threadLineQty}>×{l.qty}</Text>
                  </View>
                );
              })
            )}
          </View>
        ))}

        {do_note ? (
          <View style={styles.noteBox}>
            <Text style={styles.partyLabel}>Note</Text>
            <Text>{do_note}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Issued by (Supplier)</Text>
          </View>
          <View style={styles.signBlock}>
            <Text style={styles.signLabel}>Received by ({ack_role})</Text>
          </View>
        </View>

        <Text style={styles.disclaimer}>
          Goods received in good condition. Verify quantities and customer
          allocations above before signing.
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Synthetic card settlement files: the column layouts of the real Public Bank,
 * GHL and Maybank T41 exports, with every value invented. No real card, merchant,
 * terminal or approval number is in here.
 */

export interface PbbSale {
  sett: string; // DDMMYYYY
  trans: string; // DDMMYYYY
  amt: string;
  net: string;
  mid: string;
  tid: string;
  code: string;
  trace: string;
  status?: string;
}

export function pbbFile(sales: PbbSale[]): string {
  const head =
    '"Sett_date","Trans_date","Card_no","Card_type","Trans_curr","Trans_amt","Sett_curr","Sett_amt","Gross_curr","Gross_amt","MDR","MID","Approval_code","Status","TID","Batch_no","DBA","Trace_no","Prod_type","CYBS_Purchase_ID","CYBS_Request_ID"';
  const rows = sales.map((s) =>
    [s.sett, s.trans, "400000XXXXXX0001", "VISA", "MYR", s.amt, "MYR", s.net, "MYR", s.amt, "1.00", s.mid, s.code,
      s.status ?? "PURCHASES", s.tid, "000001", "TEST SHOP", s.trace, "", "", ""]
      .map((v) => `"${v}"`)
      .join(","),
  );
  return [head, ...rows, ""].join("\r\n");
}

export interface GhlSale {
  at: string; // YYYY-MM-DD HH:MM:SS.0
  amount: string;
  fee: string;
  net: string;
  tid: string;
  txId: string;
  code?: string;
}

export function ghlFile(sales: GhlSale[]): string {
  const head =
    "tx_create_date,gateway_tx_id,mah_ref,product_itemname,tx_code_true,terminal_id,currency_code,currency_tx_amount,tx_amount,merchant_mdr_amount,product_commission_amount,vat_amount,net_amount,tokenized_fee_amount";
  const rows = sales.map(
    (s) => `${s.at},'${s.txId},'TESTREF${s.txId},VISA-TEST/VISA-SC,${s.code ?? "PAYMENT"},${s.tid},MYR,,${s.amount},-${s.fee},0.0000,0.0000,${s.net},0.0000`,
  );
  return [head, ...rows].join("\n");
}

export interface MaybankSale {
  amount: string;
  date: string; // DD/MM/YY
  code: string;
  tid: string;
  ref: string;
}

export function maybankFile(o: {
  merchant: string;
  reportDate: string; // DD/MM/YY
  sales: MaybankSale[];
  gross: string;
  fee: string;
  net: string;
  credit?: string;
  withheld?: string;
}): string {
  const sales = o.sales.map(
    (s) => `400000******0002,,${s.amount},,${s.date},,${s.code},,40,,${s.ref},,${s.tid},,50001,,VISA CR LOCAL,,-,,0.60,`,
  );
  return [
    "Credit Card Transactions",
    "",
    "Report Type  :, T41,,,,,,,,,,,,,,,,,",
    `Report Date  :,${o.reportDate},,,,,,,,,,,,,,,,,`,
    "Run Date  :,010126,",
    "",
    "TEST COMPANY SDN. BHD.,,,,,,,,,,,,,,,,,",
    "1 TEST ROAD,,,,,,,,,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,",
    "",
    `Merchant No.,:, ${o.merchant},,,,,,,,,,,,,,,`,
    "Account No.,:, ,,,,,,,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,",
    "Card Number,,Amount,,Tran Date,,Auth Code,,Tran ID,,Reference No,,Terminal No.,,Batch No.,,Card Type.,,EzyPay Term,,Interchange Fee,",
    ...sales,
    `Total Amount,:,${o.gross},,Items,:,${o.sales.length},,,,,,,,,,,,,,,`,
    "",
    ",,,,,,,,,,,,,,,,,",
    `Total Debit Amount,:,${o.gross}`,
    `Total Credit Amount,:,${o.credit ?? "0.00"}`,
    ",,,,,,,,,,,,,,,,,",
    "Items Withheld,:,,,Reasons,:,,,,,,,,,,,,",
    `Total Amount,:,${o.withheld ?? ""},,,:,0,,,,,,,,,,,`,
    ",,,,,,,,,,,,,,,,,",
    "Items Rejected,:,,,Reasons,:,,,,,,,,,,,,",
    "Total Amount,:,,,,:,0,,,,,,,,,,,",
    ",,,,,,,,,,,,,,,,,",
    ",,,,Amt (Dr),,Items,,Amt (Cr),,Items,,,,,,,",
    "VISA CR LOCAL,,,,0,,0,,0,,0,,,,,,,",
    "TOTAL,,,,0.00,,0.00,,0.00,,0.00,,,,,,,",
    ",,,,,,,,,,,,,,,,,",
    ",,,,Gross Amt,,CashBack Amt,,Total After CashBack,,Disc Rate,,Disc. Amt,,Net Amount,,Trnx Count,,Interchange Fee,,,",
    `VISA CR LOCAL,,,,${o.gross},,0,,0,,.01000,,${o.fee},,${o.net},,${o.sales.length},,0.60`,
    "MC CR LOCAL,,,,0.00,,0,,0,,.01000,,0.00,,0.00,,0,,0.00",
    `TOTAL,,,,${o.gross},,0.00,,0.00,,,,${o.fee},,${o.net},,${o.sales.length},,0.60,,,,,`,
  ].join("\n");
}

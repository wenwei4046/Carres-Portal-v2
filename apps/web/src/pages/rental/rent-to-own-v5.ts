import type { AgreementBlock } from "@carres/shared";

/**
 * Loo's supplied wording — "02. Rental Agreement T&C (Carress Sdn Bhd)
 * v5_260706", transcribed VERBATIM into ordered blocks (0267, 2026-07-26).
 *
 * Loo read the five gaps this document has against the business rules
 * (no ownership-transfer clause, no early-buyout clause, "rental excludes
 * servicing" against a free care plan, the 7th-of-month + 8%/month terms, the
 * credit-assessment clause) and decided: PRINT IT AS WRITTEN. Nothing here is
 * ours to add — and the free service package is deliberately absent, because a
 * promotion is not a term of the rental.
 *
 * This is only the FIRST-VERSION seed offered in the Agreements tab: the
 * principal reviews it and saves, which is what actually creates version 1 in
 * `rental_agreement_templates`. Later versions are authored in the tab.
 */
export const RENT_TO_OWN_V5_BLOCKS: AgreementBlock[] = [
  {
    "kind": "title",
    "text": "RENTAL AGREEMENT"
  },
  {
    "kind": "subtitle",
    "text": "TERMS AND CONDITIONS"
  },
  {
    "kind": "p",
    "text": "These Terms and Conditions govern the rental program offered by Carress Sdn. Bhd. (Company No. 202401055306 (1601150-X)) (hereinafter referred to as “Company”) which aims to provide customers with an affordable and flexible way to acquire home appliances and furniture through a rental arrangement (“Rental Program”)."
  },
  {
    "kind": "p",
    "text": "By participating in this Rental Program, the Customer agrees to comply with these Terms and Conditions:"
  },
  {
    "kind": "h2",
    "text": "Rental of Product(s)"
  },
  {
    "kind": "p",
    "text": "The Customer hereby agrees to rent the selected Product(s) for the agreed Rental Period effective from the Commencement Date."
  },
  {
    "kind": "p",
    "text": "The rental of the Product(s) shall exclude any routine maintenance, servicing or repairs. The Customer shall be responsible for all costs associated with the maintenance and repair of the Product(s), including but not limited to general wear and tear and component replacements. The Company shall only be responsible for repairs related to manufacturing defects within the warranty period."
  },
  {
    "kind": "p",
    "text": "The Customer shall not sell, transfer, pledge, sublease or otherwise encumber the Product(s) during the Rental Period. Any such unauthorized actions shall be deemed a material breach of this Agreement and the Company reserves the right to terminate this Agreement immediately."
  },
  {
    "kind": "h2",
    "text": "Credit Assessment"
  },
  {
    "kind": "p",
    "text": "The Customer acknowledges and agrees that participation in the Rental Program is subject to the credit assessment and approval process by the Company. The Company reserves the right to conduct a credit check on the Customer to determine eligibility to participate in the Rental Program."
  },
  {
    "kind": "p",
    "text": "The Customer shall provide all necessary documents and information as requested by the Company for credit evaluation. The Customer authorises the Company to verify the documents and information provided, including obtaining reports from credit reporting agencies, financial institutions or other relevant sources as necessary."
  },
  {
    "kind": "p",
    "text": "The Company may, at its sole discretion, approve or reject any application based on the credit assessment results without providing reasons for rejection."
  },
  {
    "kind": "h2",
    "text": "Payment Terms"
  },
  {
    "kind": "p",
    "text": "The Customer shall pay the Monthly Rental on the Commencement Date, and subsequently on or before the seventh (7th) day of each and every calendar month throughout the Rental Period, failing which the Customer shall be liable to pay late payment interest at the rate of eight per centum (8%) per month on the outstanding amount calculated from the due date until full payment is received by the Company."
  },
  {
    "kind": "p",
    "text": "In the event that the Customer fails to make rental payment for six (6) consecutive months, the Company reserves the right to terminate this Agreement immediately."
  },
  {
    "kind": "h2",
    "text": "Delivery and Installation"
  },
  {
    "kind": "p",
    "text": "The Company shall deliver the Product(s) to the address provided by the Customer. The estimated delivery timeframe shall be communicated to the Customer upon confirmation of the order."
  },
  {
    "kind": "p",
    "text": "The Customer shall ensure that the delivery location is accessible and suitable for the installation of the Product(s). Any additional costs incurred due to delivery challenges, such as the need for special handling or equipment, shall be borne by the Customer."
  },
  {
    "kind": "p",
    "text": "In the event that assembly or installation is required, the Company or its authorized service provider shall perform the assembly and installation at the address provided by the Customer. The Customer shall be responsible for ensuring that the assembly and installation location have the necessary facilities, such as power supply and water connections for proper assembly, installation and operation of the Product(s)."
  },
  {
    "kind": "p",
    "text": "The Customer shall inspect the Product(s) upon delivery, assembly and installation. Any defects, malfunctions or missing parts must be reported to the Company within three (3) days from the date of delivery, assembly and installation. Failure to report within the stipulated timeframe shall be deemed as acceptance of the Product(s) in good condition."
  },
  {
    "kind": "h2",
    "text": "Use of Product(s)"
  },
  {
    "kind": "p",
    "text": "The Product(s) shall at all times throughout the Rental Period be used at the address provided by the Customer unless prior written consent is obtained from the Company for relocation."
  },
  {
    "kind": "p",
    "text": "The Customer shall use the Product(s) solely for its intended purpose and in accordance with the manufacturer’s guidelines, user manual and all applicable safety standards."
  },
  {
    "kind": "p",
    "text": "The Customer shall use and operate the Product(s) in a proper and responsible manner, ensuring that it is used in a safe environment and under suitable conditions."
  },
  {
    "kind": "p",
    "text": "The Customer shall not:"
  },
  {
    "kind": "li",
    "text": "modify, alter or tamper with the Product(s) in any manner; and"
  },
  {
    "kind": "li",
    "text": "use the Product(s) for any unlawful, commercial or hazardous purposes."
  },
  {
    "kind": "p",
    "text": "The Customer shall be responsible for ensuring that the Product(s) remains in good working condition throughout the Rental Period. Any improper use, negligence or damage caused by misuse shall be the sole responsibility of the Customer and the Customer shall bear all costs associated with repairs or replacements."
  },
  {
    "kind": "p",
    "text": "The Customer shall promptly notify the Company of any defects, malfunctions or issues with the Product(s). Any unauthorised repair, attempts or modifications by the Customer or third parties shall void any applicable warranty or service commitments provided by the Company."
  },
  {
    "kind": "p",
    "text": "The Company reserves the right to inspect the Product(s) periodically at the address provided by the Customer to ensure compliance with the terms of the Agreement."
  },
  {
    "kind": "h2",
    "text": "Risk and Ownership"
  },
  {
    "kind": "p",
    "text": "The Product(s) shall remain the sole property of the Company throughout the Rental Period. The Customer shall have no ownership rights over the Product(s)."
  },
  {
    "kind": "p",
    "text": "The risk of loss or damage to the Product(s) shall transfer to the Customer upon successful delivery and installation. The Customer shall take all reasonable precautions to prevent loss or damage to the Product(s)."
  },
  {
    "kind": "p",
    "text": "In the event the Product(s) is lost, stolen or damaged beyond repair due to the Customer’s negligence, misuse or failure to take reasonable precautions, the Customer shall be liable to compensate the Company a sum equivalent to the Monthly Rental for the unexpired term of Rental Period in addition to any other outstanding amounts due under this Agreement."
  },
  {
    "kind": "h2",
    "text": "Termination"
  },
  {
    "kind": "p",
    "text": "The Company reserves the right to terminate this Agreement immediately upon written notice to the Customer upon the occurrence of the following:"
  },
  {
    "kind": "li",
    "text": "the Customer fails to make rental payments for six (6) consecutive months;"
  },
  {
    "kind": "li",
    "text": "the Customer breaches any material terms of this Agreement; or"
  },
  {
    "kind": "li",
    "text": "the Customer becomes bankrupt, insolvent or is subject to legal proceedings affecting their ability to fulfil payment obligations under this Agreement."
  },
  {
    "kind": "p",
    "text": "Upon termination:"
  },
  {
    "kind": "li",
    "text": "the Customer shall pay the Company a sum equivalent to the Monthly Rental for the unexpired term of Rental Period as agreed liquidated damages;"
  },
  {
    "kind": "li",
    "text": "the Customer shall pay the Company any outstanding rental fees, late payment interest and any other applicable charges; and"
  },
  {
    "kind": "li",
    "text": "the Company shall have the option at its sole discretion to enter the premises of the Customer subject to prior written notice to repossess the Product(s). The Customer agrees to grant the Company access for such repossession and shall not obstruct or hinder the process."
  },
  {
    "kind": "p",
    "text": "Any repossession of the Product(s) shall not waive the Company’s right to recover any outstanding amounts due and payable by the Customer under this Agreement."
  },
  {
    "kind": "h2",
    "text": "Indemnification"
  },
  {
    "kind": "p",
    "text": "The Customer agrees to indemnify, defend and hold harmless the Company, its directors, officers, employees and affiliates from and against any and all claims, liabilities, losses, damages, costs and expenses (including legal fees) arising out of or related to any breach of this Agreement by the Customer."
  },
  {
    "kind": "h2",
    "text": "Limitation of Liability"
  },
  {
    "kind": "p",
    "text": "To the fullest extent permitted by law, the Company shall not be liable to the Customer for any indirect, incidental, consequential, special, punitive or exemplary damages arising out of or in connection with this Agreement or use of the Product(s) by the Customer whether based on contract or tort."
  },
  {
    "kind": "p",
    "text": "The total aggregate liability of the Company for any claims, damages or losses arising under or in connection with this Agreement shall in no event exceed the total amount of rental paid by the Customer for the Product(s) under this Agreement."
  },
  {
    "kind": "p",
    "text": "The Company shall not be liable for any defects, malfunctions or failures of the Product(s) resulting from:"
  },
  {
    "kind": "li",
    "text": "the Customer’s misuse, negligence or failure to follow the manufacturer’s instructions;"
  },
  {
    "kind": "li",
    "text": "unauthorized modifications, alterations or repairs performed by the Customer or a third party;"
  },
  {
    "kind": "li",
    "text": "power surges, electrical faults or external factors beyond the control of the Company;"
  },
  {
    "kind": "li",
    "text": "normal wear and tear, unless covered under a warranty provided by the Company."
  },
  {
    "kind": "h2",
    "text": "Governing Law"
  },
  {
    "kind": "p",
    "text": "This Agreement and any disputes or claims arising out of or in connection with this Agreement or its subject matter are governed by and construed in accordance with the laws of Malaysia."
  },
  {
    "kind": "p",
    "text": "Any disputes shall be resolved through negotiation, and if unresolved, the parties hereby agree to submit to the exclusive jurisdiction of the Court of Malaysia."
  },
  {
    "kind": "h2",
    "text": "Miscellaneous"
  },
  {
    "kind": "p",
    "text": "No amendment or modification shall be valid or binding upon the parties unless it is made in writing by way of a supplementary agreement specifically referring to this Agreement and duly signed by both parties."
  },
  {
    "kind": "p",
    "text": "Failure by the Company to enforce, at any time, any provision of this Agreement shall not be construed as a waiver of its right to enforce the breach of such provision or any of the provisions in this Agreement or as a waiver of any continuing, succeeding or subsequent breach of any provision or other provisions of this Agreement."
  },
  {
    "kind": "p",
    "text": "If at any time all or any part of one or more of the provisions hereof is or becomes illegal, invalid or unenforceable in any respect under the applicable laws of any jurisdiction, neither the legality, validity or enforceability of the remaining parts of such provision, or the other provisions hereof, nor the legality, validity or enforceability of such provision under the applicable laws of any other jurisdiction, shall in any way be affected or impaired thereby."
  },
  {
    "kind": "p",
    "text": "This Agreement shall be binding on the heirs, successors, permitted assigns and legal representatives of the Customer."
  },
  {
    "kind": "h2",
    "text": "CUSTOMER ACKNOWLEDGMENT & ACCEPTANCE"
  },
  {
    "kind": "p",
    "text": "I hereby acknowledge that I have read, understood and agree to be bound by the Terms and Conditions set forth by this Rental Agreement."
  },
  {
    "kind": "p",
    "text": "I hereby acknowledge and consent to the collection, processing and use of my personal data by the Company for the purposes of administering the Rental Program, including but not limited to, credit assessment, payment processing, customer support and compliance with legal and regulatory requirements in accordance with the privacy notice as published by the Company on its website from time to time. I understand that my personal data may be shared with third-party service providers, financial institutions and regulatory authorities where necessary."
  }
] as AgreementBlock[];

/** The document's own identity — what the tab offers to create. */
export const RENT_TO_OWN_V5 = {
  docKey: "rent_to_own",
  name: "Rental Agreement — Terms and Conditions (v5)",
  bindsTo: ["mattress", "bedframe", "sofa"],
  effectiveFrom: "2026-07-06",
  blocks: RENT_TO_OWN_V5_BLOCKS,
};

// Who stands behind vscn.ch, in one place. The Impressum, the contact page and
// the privacy policy all read from here, so a change of address or of the
// responsible person is one edit, not a hunt through two languages of prose.
//
// VSCN is not (yet) a registered association: it is run by one named person
// in a private capacity, and that person is the data controller. When a
// Verein is founded, legalForm/legalName change here and the pages follow.
export interface LegalEntity {
  /** The name the site operates under. */
  name: string;
  /** "informal" until a Verein exists; then "association" with the registered name. */
  legalForm: "informal" | "association";
  /** The natural person responsible for the site and its content. */
  responsible: string;
  /** Postal address, one line per element. Empty until one is provided — the
   *  pages omit the line rather than show a placeholder. */
  addressLines: string[];
  email: string;
  /** Domain, without scheme, for the "this website" wording. */
  domain: string;
  /** The Swiss commercial-register number (CHE-…), if any. */
  uid: string | null;
}

export const legalEntity: LegalEntity = {
  name: "VSCN — Visual Science Communication Network",
  legalForm: "informal",
  responsible: "Joshua Binswanger",
  addressLines: [],
  email: "info@vscn.ch",
  domain: "vscn.ch",
  uid: null,
};

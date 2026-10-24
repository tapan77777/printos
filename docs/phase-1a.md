# Phase 1A: document quotes and owner review

## Pricing contract

New jobs parse the uploaded PDF with pdf-lib rather than trusting MIME types,
client counts, or PDF `/Count` metadata. The parser rejects unreadable,
encrypted, truncated, empty, cyclic/shared-page-tree documents and documents over
10,000 pages; page trees are bounded to 100 levels and 20,000 nodes. The existing
MAX_UPLOAD_BYTES limit also applies. This is structural validation/page counting,
not a full renderer, malware scanner, or guarantee of physical printability.
Parsing remains in the web process; request quotas and isolated resource-bounded
PDF processing remain production-hardening work.

Ranges accept `all` or comma-separated pages/inclusive ascending ranges such as
`1,3-5`, up to 64 characters. Outer whitespace is ignored; internal whitespace,
zero, reversed ranges and out-of-document pages are rejected. Ranges are sorted
and overlaps/duplicates merged, so billing and CUPS receive the same page set.

The existing rate policy is retained: BW 200 paise per selected page, colour 500,
less 50 paise per selected page for duplex. Multiply by copies (1–50). Duplex is
priced per printed side, not rounded sheets; all supported paper sizes currently
use the same rate. All calculations use integer paise; all displays use two decimals.

## Additive API changes; no migration or historical repricing

- `POST /api/quotes`: accepts the existing multipart job form. Validates the PDF,
  options and printer and returns `{ pageCount, pageRange, selectedPages, copies,
  perPagePaise, price }`. It creates no job and writes no file.
- `POST /api/jobs`: existing fields/response keys remain. Independently parses and
  prices the actual PDF; ignores client price/page-count assertions. Stores
  document page count in existing `pageCount`, normalized selection in `pageRange`,
  and authoritative integer amount in `price`. Adds `quote` to the response.
- Public job status adds `pageCount`. Existing customer token protection remains.
- `GET /api/jobs/:id/file?preview=1`: inline PDF for authenticated owners only;
  agents cannot use preview mode. Default authenticated attachment downloads are
  preserved. Responses have private/no-store, nosniff and sandbox headers.

The customer uploads once to inspect/count and again on submission. Settings use
shared pricing locally after inspection; submission always revalidates. No quote
storage or abandoned temporary-document records are introduced. Quotes are not a
reserved price across deployments/rate changes. Existing records retain their
stored prices and null page counts; owner UI identifies these legacy quotes.

Owner job rows link to the protected native browser PDF viewer in a new tab.
Preview availability depends on browser PDF support; default attachment URL remains
available. Cancelling the rejection prompt sends no request. Confirming an empty
reason still rejects, preserving existing API behavior.

## Verification and remaining work

Tests generate real compressed/uncompressed multipage PDFs and exercise malformed,
encrypted, empty, cyclic, truncated documents; page selections; copies; duplex;
quote/job consistency; price displays; owner preview authorization; and rejection
cancellation. Route persistence/filesystem tests use mocks only, with no live DB
or printer. No schema migration or database backfill is needed.

Unchanged Phase 1B blockers include atomic state transitions, scoped agent claims,
leases/reconciliation, durable storage/retention, payment collection, heartbeat,
and capability enforcement. Browser/native-viewer and real printer acceptance
still require separate supervised testing. ESLint is not configured in this repo.
Dependency advisories reported by npm audit require a separate upgrade review.

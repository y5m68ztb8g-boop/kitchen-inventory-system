# AI Whiteboard Purchasing Design

Date: 2026-07-10

## Goal

Add AI-assisted purchase whiteboard scanning to the existing Grow Naturally application. The feature lives inside the current application, uses the empty home-screen module, preserves all current inventory behavior, and saves confirmed purchase requests to SQLite with status `Pending`.

## Scope

In scope:

- A new purchasing page opened from the currently empty home module.
- Rear-camera capture and JPG, PNG, HEIC, HEIF, or WebP upload on mobile and desktop.
- Image preview, replacement, recognition, editable review, manual low-confidence review, confirmation, and historical-product recommendations.
- Server-side OpenAI Responses API integration with structured output.
- SQLite persistence for scan audit records and confirmed purchase-request items.
- Read-only matching against the existing supplier invoice catalogue and current inventory data.
- Automated tests for image validation, AI response parsing, matching, and database saving.

Out of scope:

- Creating supplier orders, adding products to supplier baskets, or sending messages to suppliers.
- Replacing the current inventory JSON/Supabase storage.
- Migrating existing inventory records into the purchasing SQLite database.
- Automatically accepting low-confidence handwriting.

## Existing-System Integration

The implementation is added to the existing `grow-naturally-supabase-trial` Vite and React application. The empty home module becomes the purchasing entry and opens `#purchasing`. Existing freezer, chiller, dry-store, drinks, valuation, search, and cloud-sync routes remain unchanged.

The current supplier catalogue remains the source for historical invoice products. The current inventory database remains the source for stock quantities. Purchasing code can read both sources for recommendations but cannot update inventory or create an order.

## User Flow

1. The user opens the purchasing module and presses the mobile-friendly `Scan Purchase Whiteboard` button.
2. On mobile, the user can open the rear camera or choose an existing image. Desktop users can choose an image.
3. The page displays the selected image and offers `重新拍照`, `选择其他图片`, and `开始识别`.
4. The browser uploads the image to `POST /api/purchasing/scan-whiteboard` as multipart form data.
5. The server validates and compresses the image, sends it to OpenAI, validates the structured result, creates a draft scan record, and returns the scan ID and recognised items.
6. The page shows an editable review table and the original image. The user can edit department, product, quantity, unit, and notes; delete rows; and add missing rows.
7. Rows below `0.8` confidence use a prominent warning style and include an explicit `已人工核对` checkbox. Confirmation remains disabled until every such row is reviewed or deleted.
8. Confirmation sends the edited rows to the backend. The backend transaction saves them as purchase requests with status `Pending`, calculates historical-product recommendations, and returns the saved rows and matches.
9. The page displays the recommendation, supplier, supplier code, pack size, last price, purchase count, last date, and current inventory quantity. Nothing is ordered automatically.

Important interface text is Chinese. The main button keeps the exact requested English name `Scan Purchase Whiteboard`.

## Frontend Design

The purchasing page follows the application's existing restrained visual style. It is a working operational screen rather than a landing page.

The page contains:

- A compact header with a back button and page title `采购白板识别`.
- A large touch-friendly scan button and two clearly separated input actions: rear camera and existing image.
- An image-preview area that preserves the image aspect ratio.
- A responsive review table. On narrow screens each row becomes a compact editable item layout without horizontal clipping.
- Icon buttons for deleting rows and viewing the source image, with accessible labels and tooltips.
- A visible recognition or saving progress state that prevents duplicate submissions.
- Chinese error messages with a retry action where retrying is meaningful.

No important scan data is stored in `localStorage`. Temporary browser state contains only the current unsaved editing session and can be reconstructed from the draft scan response while the page remains open.

## Backend API

### `POST /api/purchasing/scan-whiteboard`

Accepts one multipart field named `image`.

Success response:

```json
{
  "scanId": "string",
  "imageUrl": "/api/purchasing/whiteboard-scans/{scanId}/image",
  "items": [],
  "unreadableText": [],
  "generalNotes": null
}
```

The endpoint does not trust the browser MIME type. It validates the file signature, allowed format, and decoded image. The maximum upload size is 15 MB. Images larger than 2 MB or 2048 pixels on the longest side are resized and converted to WebP at quality 82 before storage and AI submission. Smaller supported images are still decoded before use so invalid or disguised files are rejected.

### `GET /api/purchasing/whiteboard-scans/:scanId/image`

Returns the compressed audit image stored with the scan. Unknown IDs return `404`.

### `POST /api/purchasing/whiteboard-scans/:scanId/confirm`

Accepts the edited items and explicit manual-review flags. It validates every field and rejects confirmation when a retained item has confidence below `0.8` without manual review. A single SQLite transaction replaces any previous draft items, saves the final items as `Pending`, records recommendations, and marks the scan confirmed.

## OpenAI Integration

Only backend code can instantiate the OpenAI client. The API key is read only from the server-side environment variable `OPENAI_API_KEY`. The key is never returned, included in an error response, written to logs, committed to source control, or placed in a `VITE_` environment variable.

The backend uses the Responses API with an image input and strict JSON Schema in `text.format`. The default model is `gpt-5.4-mini`, configurable through `OPENAI_WHITEBOARD_MODEL` without changing the required API-key name.

The system instruction tells the model to:

- Read handwritten English hotel purchasing lists.
- Recognise headings such as Breakfast, Kitchen, Dinner, Bar, and Housekeeping.
- Preserve the original visible wording in `raw_text`.
- Correct only obvious spelling errors in `product_name`.
- Never infer or invent quantities.
- Return `null` for unreadable quantity or department.
- Lower confidence for ambiguous handwriting, grouping, unit, or quantity.

The response schema is strict and uses the requested fields:

```json
{
  "items": [
    {
      "department": "string or null",
      "raw_text": "string",
      "product_name": "string",
      "quantity": "number or null",
      "unit": "string or null",
      "notes": "string or null",
      "confidence": "number from 0 to 1"
    }
  ],
  "unreadable_text": ["string"],
  "general_notes": "string or null"
}
```

The server validates the returned JSON independently of the model schema. An empty `items` array with no useful unreadable text is treated as `NO_READABLE_TEXT`.

## SQLite Data Model

The purchasing database is stored separately at `local-data/purchasing.sqlite`. Keeping it separate prevents schema changes from affecting the existing inventory store.

### `whiteboard_scans`

- `id` text primary key
- `status` text: `Draft`, `Pending`, or `RecognitionFailed`
- `original_filename` text
- `original_mime_type` text
- `stored_mime_type` text
- `original_size_bytes` integer
- `stored_size_bytes` integer
- `image_blob` blob
- `ai_model` text
- `unreadable_text_json` text
- `general_notes` text nullable
- `error_code` text nullable
- `created_at` text
- `confirmed_at` text nullable

### `whiteboard_scan_items`

- `id` text primary key
- `scan_id` text foreign key to `whiteboard_scans`
- `row_order` integer
- `department` text nullable
- `raw_text` text
- `product_name` text
- `quantity` real nullable
- `unit` text nullable
- `notes` text nullable
- `confidence` real constrained from 0 to 1
- `manual_reviewed` integer
- `status` text fixed to `Pending` after confirmation
- `recommended_supplier_product_id` text nullable
- `recommended_supplier_name` text nullable
- `recommended_supplier_code` text nullable
- `recommended_product_code` text nullable
- `recommended_product_name` text nullable
- `recommended_pack_size` text nullable
- `recommended_last_price` real nullable
- `recommended_purchase_count` integer nullable
- `recommended_last_purchase_date` text nullable
- `current_inventory_quantity` real nullable
- `created_at` text

Database initialization is idempotent and enables foreign keys. Confirmation uses a transaction so a partially saved scan cannot exist.

## Historical Matching

Matching runs only after confirmation. It does not automatically replace the user's product name.

Candidate scoring uses:

1. Normalised product name equality and phrase containment.
2. Token overlap after punctuation, plural, and common hotel-product alias normalisation.
3. Existing supplier-product purchase frequency using a capped logarithmic bonus.
4. Most recent purchase date using a bounded recency bonus.

The highest-scoring reasonable candidate is displayed as a recommendation. Weak candidates return no recommendation instead of guessing. Current inventory quantity is aggregated from existing inventory entries by confirmed supplier-product ID first, then by normalised product name when no ID match exists.

## Error Handling

The API returns stable error codes and Chinese user messages:

- `UNSUPPORTED_IMAGE_FORMAT`: only JPG, PNG, HEIC, HEIF, and WebP are accepted.
- `IMAGE_TOO_LARGE`: upload exceeds 15 MB.
- `AI_SERVICE_UNAVAILABLE`: OpenAI timeout, rate limit, or upstream failure.
- `NO_READABLE_TEXT`: no useful purchasing text was found.
- `INVALID_AI_RESPONSE`: returned output does not match the schema.
- `MISSING_API_KEY`: `OPENAI_API_KEY` is not configured.
- `INVALID_REVIEW_DATA`: edited rows fail validation or low-confidence review is incomplete.

Server logs contain only a request/scan identifier, error code, and safe diagnostic summary. They never contain the API key, image base64, full image bytes, or OpenAI authorization headers.

## Testing Strategy

Tests are written before implementation code.

Required automated coverage:

- Accept every supported image type and reject unsupported or disguised files.
- Reject files over 15 MB.
- Parse a valid structured response and reject invalid fields, invalid confidence, and malformed JSON.
- Treat an empty useful response as no readable text.
- Create both SQLite tables idempotently.
- Save a scan image and retrieve it by scan ID.
- Save confirmed rows in one transaction with status `Pending`.
- Reject unreviewed rows below `0.8` confidence.
- Rank exact and alias matches ahead of weak matches, with frequency and recency used as tie-breakers.
- Render the mobile capture/upload controls, editable review rows, low-confidence warning, add/delete actions, and saved recommendation details.
- Run the existing complete inventory test suite to prove inventory behavior remains unchanged.

## Acceptance Criteria

- The empty home module opens the new purchasing page.
- A phone can capture with the rear camera or upload a supported existing image.
- The selected image is previewed before any AI request.
- The browser never contacts OpenAI directly.
- Recognition output matches the requested structure and is fully editable.
- Low-confidence rows cannot be confirmed without manual review.
- Confirmation creates `Pending` purchase requests in SQLite and preserves the linked compressed image.
- Historical recommendations and current inventory quantities display after saving.
- No order or supplier action occurs.
- Existing inventory routes, data, editing, valuation, search, and Supabase sync continue to work.


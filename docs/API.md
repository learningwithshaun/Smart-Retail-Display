# Lumen API & Data Contract Documentation

## 1. API Overview

The Lumen API is responsible for serving validated digital signage campaigns, scheduling parameters, and entertainment configuration to the display engine. The display engine consumes this data to render advertisement media (images and videos) alongside interactive Paystack payment QR codes and scheduled YouTube entertainment intervals.

### Relationship Between Spark/Zuke Platform and the Display Engine

In the broader architecture, Spark/Zuke serves as the central advertising management and distribution platform. The display engine acts as an edge signage player that continuously queries or subscribes to advertising data, validates the contract, and presents active campaigns to viewers.

```text
Spark/Zuke Platform
        ↓
     API/JSON
        ↓
 Display Engine
        ↓
 Validate media
        ↓
 Check payment/status
        ↓
 Display advertisement
        ↓
 Generate QR from Paystack URL
```

---

## 2. Development Mode

During development and MVP phases, the system operates in development mode using local configuration:
- Media definitions are loaded from `frontend/media.json`.
- The FastAPI backend serves these validated definitions at `GET /api/media`.
- If the backend is unavailable or running as a static web server, the display engine automatically falls back to fetching `media.json` directly.

### Sample Development JSON

```json
{
  "media": [
    {
      "id": "media_001",
      "business_id": "business_001",
      "business_name": "GrowthPilot",
      "type": "product",
      "name": "Search Engine Optimization",
      "media_type": "image",
      "media_url": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1920&q=85",
      "paystack_url": "https://paystack.com/buy/search-engine-optimization-seo-vhraqr",
      "payment_status": "paid",
      "play_count": 2,
      "status": "active",
      "orientation": "landscape"
    },
    {
      "id": "media_002",
      "business_id": "business_002",
      "business_name": "RankNow Agency",
      "type": "product",
      "name": "SEO Starter Pack",
      "media_type": "image",
      "media_url": "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?auto=format&fit=crop&w=1920&q=85",
      "paystack_url": "https://paystack.com/buy/search-engine-optimization-seo-vhraqr",
      "payment_status": "paid",
      "play_count": 1,
      "status": "active",
      "orientation": "portrait"
    },
    {
      "id": "media_003",
      "business_id": "business_003",
      "business_name": "SearchFirst",
      "type": "product",
      "name": "Keyword Mastery",
      "media_type": "video",
      "media_url": "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      "paystack_url": "https://paystack.com/buy/search-engine-optimization-seo-vhraqr",
      "payment_status": "paid",
      "play_count": 1,
      "status": "active",
      "orientation": "square"
    },
    {
      "id": "media_004",
      "business_id": "business_004",
      "business_name": "Traffic Lab",
      "type": "product",
      "name": "Local SEO Boost",
      "media_type": "image",
      "media_url": "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?auto=format&fit=crop&w=1920&q=85",
      "paystack_url": "https://paystack.com/buy/search-engine-optimization-seo-vhraqr",
      "payment_status": "paid",
      "play_count": 1,
      "status": "active"
    }
  ],
  "youtube_playlist_id": "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
  "ad_duration_seconds": 30,
  "youtube_duration_minutes": 10
}
```
---

## 3. Expected Media Data Structure

The media configuration is structured as a root JSON object containing a `media` list and global scheduling settings.

### Media Item Field Specification

| Field | Type | Requirement | Purpose | Example |
| --- | --- | --- | --- | --- |
| `id` | `string` | **Required** | Unique identifier for the media record | `"media_001"` |
| `business_id` | `string` | **Required** | Identifier of the merchant / business | `"business_001"` |
| `business_name` | `string` | **Required** | Display name of the business shown on caption/header | `"GrowthPilot"` |
| `type` | `string` | **Required** | Content category classification | `"product"` |
| `name` | `string` | **Required** | Name of advertised item / campaign title | `"Search Engine Optimization"` |
| `media_type` | `string` | **Required** | Type of media asset (`"image"` or `"video"`) | `"image"` |
| `media_url` | `string` | **Required** | Absolute HTTP(S) URL to the asset | `"https://cdn.example.com/ad.jpg"` |
| `paystack_url` | `string` | **Required** | Paystack payment URL encoded into the on-screen QR code | `"https://paystack.com/pay/item-1"` |
| `payment_status` | `string` | **Required** | Status of ad payment; must be `"paid"` to display | `"paid"` |
| `play_count` | `integer` | **Required** | Frequency weighting multiplier (positive integer >= 1) | `2` |
| `status` | `string` | **Required** | Lifecycle status; must be `"active"` to display | `"active"` |
| `orientation` | `string` | **Optional** | Target visual orientation (`"landscape"`, `"portrait"`, `"square"`) | `"landscape"` |

### Root Configuration Fields

| Field | Type | Requirement | Default | Purpose |
| --- | --- | --- | --- | --- |
| `youtube_playlist_id` | `string` | Optional | `""` | YouTube playlist/video ID for the entertainment intermission |
| `ad_duration_seconds` | `integer` | Optional | `30` | Duration (in seconds) to show each individual ad slot (1–300s) |
| `youtube_duration_minutes` | `integer` | Optional | `10` | Duration (in minutes) to run the YouTube intermission (1–120m) |
| `youtube_mode` | `string` | Optional | `"both"` | Mode: `"api"` (YouTube Data API), `"normal"` (standard IFrame playlist embed), or `"both"` (API with embed fallback) |
| `youtube_api_key` | `string` | Optional | `""` | Optional Google / YouTube Data API v3 key |

---

## 4. Orientation

The `orientation` property communicates the intended aspect ratio and presentation style of an advertisement asset.

### Allowed Values
- `"landscape"`: Standard horizontal aspect ratio (e.g. 16:9 or 4:3). Rendered as full coverage on standard displays.
- `"portrait"`: Vertical aspect ratio (e.g. 9:16). Rendered with contained aspect ratio preservation to avoid cropping key content.
- `"square"`: 1:1 aspect ratio. Rendered with contained fit to prevent cropping.

### Optional Field & Backward Compatibility
- **`orientation` is OPTIONAL.**
- Any existing media objects omitting `orientation` remain valid and will use default aspect ratio detection (`ratio < 1.6` detection for images).
- If an invalid value is supplied (e.g., `"diagonal"` or a non-string type), the item is rejected during validation without crashing the application or disrupting other advertisements.

---

## 5. Advertisement Processing Flow

The display engine follows a 12-step processing pipeline:

1. **Receive / Load Data**: Ingest configuration from `GET /api/media` (or `media.json` / Zuke subscription).
2. **Validate JSON**: Verify root object structure and fallback to default scheduling if malformed.
3. **Validate Advertisement Fields**: Verify non-empty strings for required identifiers, valid HTTP(S) URLs, and valid `media_type`.
4. **Check Status**: Ensure `status === "active"`.
5. **Check Payment Status**: Ensure `payment_status === "paid"`.
6. **Ignore Invalid / Unpaid / Inactive Advertisements**: Filter out non-compliant items without halting playback.
7. **Load Media**: Preload the active image or initialize video stream.
8. **Read Paystack URL**: Extract `paystack_url` for the active advert.
9. **Generate QR Code**: Dynamically generate QR code encoding the exact payment link.
10. **Overlay QR Code**: Render QR code and product caption over the display stage.
11. **Play Advertisement**: Show media for `ad_duration_seconds` (up to a 5-minute total advertising cycle cap).
12. **Continue Through Advertising Cycle**: Advance through the playlist slots; upon completion, switch to YouTube entertainment for `youtube_duration_minutes`, then reload and repeat.

---

## 6. API Request

### Local Development Request
```http
GET /api/media HTTP/1.1
Host: 127.0.0.1:8000
Accept: application/json
```

### Production API Request
```http
GET <API_ENDPOINT_TBD> HTTP/1.1
```
*Note: The production API endpoint is still to be confirmed (TBD) with the Spark/Zuke backend team.*

---

## 7. Example Request

### Conceptual Request
```bash
curl -X GET "https://<API_HOST_TBD>/<API_ENDPOINT_TBD>" \
     -H "Accept: application/json"
```

*Note: Any additional query parameters, pagination, or filtering flags are TBD.*

---

## 8. Example Response

```json
{
  "media": [
    {
      "id": "media_001",
      "business_id": "business_001",
      "business_name": "Amanda Cosmetics",
      "type": "product",
      "name": "Premium Lipstick Collection",
      "media_type": "image",
      "media_url": "https://cdn.example.com/lipstick.jpg",
      "paystack_url": "https://paystack.com/pay/lipstick-001",
      "payment_status": "paid",
      "play_count": 2,
      "status": "active",
      "orientation": "landscape"
    }
  ],
  "youtube_playlist_id": "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
  "ad_duration_seconds": 30,
  "youtube_duration_minutes": 10
}
```

---

## 9. Error Handling

The display engine is resilient against data corruption, network errors, and invalid campaigns:

- **Invalid JSON**: Falls back to an empty media array with default durations (`ad_duration_seconds: 30`, `youtube_duration_minutes: 10`).
- **Missing Required Fields**: Any media record missing `id`, `business_id`, `business_name`, `name`, `media_url`, etc., is ignored.
- **Invalid Orientation**: Items with unsupported `orientation` values (e.g. `"diagonal"`) are ignored while valid items continue playing.
- **Missing / Invalid Media or Paystack URLs**: Checked with URL parser; invalid URLs cause the item to be omitted.
- **Unpaid / Inactive Advertisements**: Silently filtered out.
- **Empty Media Array**: If no active, paid adverts are available, the display engine immediately switches to YouTube entertainment or displays the fallback state without crashing.
- **API Unavailable / Network Failure**: The frontend catches fetch errors, attempts fallback to static `media.json`, and retries on subsequent cycles.
- **Broken Media (404/decode error)**: An `onerror` handler advances immediately to the next advert in the sequence.

---

## 10. Authentication

Authentication details for the production Spark/Zuke API are:

**Authentication method: TBD**

Requirements to be confirmed with the Spark/Zuke backend team:
- Authentication scheme (e.g., Bearer Token, API Key header, Mutual TLS, or HMAC signatures)
- Display unit registration / Device ID credentials
- Token refresh lifecycle and rate limits

---

## 11. Future Zuke/Spark Integration

The application contains a modular transport seam (`subscription-adapter.js`). Moving from the local development mode (`media.json` / `GET /api/media`) to the live Spark/Zuke platform will occur via:

1. **Configuring the Subscription URL**: Pointing the adapter to the live Zuke export endpoint or message broker topic.
2. **Preserving the Data Contract**: The data schema defined above serves as the formal data contract. The production API must return this structure.
3. **Zero UI Rewrite**: The display playback engine (`app.js`) consumes the data contract uniformly, requiring no modifications to the rendering or QR code generation logic.
